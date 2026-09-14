// @ts-nocheck
import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkAnyPermission, checkPermission } from "../middleware/rbac";
import { nextDocumentNo } from "../lib/document-number";
import { logActivity, getActorInfo } from "../lib/activity-log";
import { computeDiff, diffLines, DIFF_DENYLIST } from "../lib/diff";
import { snapshotApprovalLevelsForDoc } from "../lib/workflow-approval";
import {
  insertMovementWithDetails,
  type DetailInput,
  type MovementInput,
} from "./transactions";

export const supplyChainRouter = Router();

// Helper: support both PUT and PATCH for same handler (frontend uses PATCH, legacy may use PUT)
const putAndPatch = (path: string, ...handlers: any[]) => {
  (supplyChainRouter as any).put(path, ...handlers);
  (supplyChainRouter as any).patch(path, ...handlers);
};

type DocStatus = "DRAFT" | "POSTED" | "CANCELED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isDocumentNo(v: string): boolean {
  // RCV-2609-0001, PR-2609-0001, PO-2609-0001, etc — prefix 2-5 huruf + YYMM + SEQ
  return /^[A-Z]{2,5}-\d{2,4}-?\d{1,6}$/i.test(v) || /^[A-Z]{2,5}-\d{4,}-\d+$/i.test(v) || /^[A-Z]+\-\d+.*$/i.test(v);
}
function receivingWhere(pid: string) {
  if (isUuid(pid)) return eq(s.receivings.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.receivings.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.receivings.id, Number(pid));
  // fallback: coba documentNo dulu, lalu publicId
  return eq(s.receivings.documentNo, pid);
}
function poWhere(pid: string) {
  if (isUuid(pid)) return eq(s.purchaseOrders.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.purchaseOrders.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.purchaseOrders.id, Number(pid));
  return eq(s.purchaseOrders.documentNo, pid);
}
function soWhere(pid: string) {
  if (isUuid(pid)) return eq(s.salesOrders.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.salesOrders.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.salesOrders.id, Number(pid));
  return eq(s.salesOrders.documentNo, pid);
}
function grWhere(pid: string) {
  if (isUuid(pid)) return eq(s.goodsReceipts.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.goodsReceipts.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.goodsReceipts.id, Number(pid));
  return eq(s.goodsReceipts.documentNo, pid);
}
function deliveryWhere(pid: string) {
  if (isUuid(pid)) return eq(s.deliveries.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.deliveries.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.deliveries.id, Number(pid));
  return eq(s.deliveries.documentNo, pid);
}
async function resolveInternalId(table: any, publicOrInternal: string | number | undefined | null): Promise<number | null> {
  if (publicOrInternal == null || publicOrInternal === "") return null;
  const str = String(publicOrInternal).trim();
  if (isUuid(str)) {
    const colPublic = (table as any).publicId;
    const colId = (table as any).id;
    if (!colPublic || !colId) return null;
    const [row] = await db.select({ id: colId }).from(table).where(eq(colPublic, str)).limit(1);
    return (row as any)?.id ?? null;
  }
  if (/^\d+$/.test(str)) return Number(str);
  return null;
}
async function resolveManyIds(table: any, ids: (string|number)[]): Promise<number[]> {
  const out: number[] = [];
  for (const v of ids) {
    const r = await resolveInternalId(table, v as any);
    if (r !== null) out.push(r);
  }
  return out;
}

async function getMovementTypeId(code: string): Promise<number> {
  const [row] = await db.select({ id: s.movementTypes.id }).from(s.movementTypes).where(eq(s.movementTypes.code, code)).limit(1);
  if (!row) throw new Error(`Movement type "${code}" tidak ditemukan.`);
  return row.id;
}

// ---------------------------------------------------------------------------
// PURCHASE ORDERS
// ---------------------------------------------------------------------------

async function poLines(tx: any, poId: number) {
  return tx.select().from(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.purchaseOrderId, poId));
}
function validateRequireUnitPrice(lines: any[], context: string) {
  for (let i = 0; i < lines.length; i++) {
    const v = lines[i]?.unitPrice;
    const n = v != null && String(v).trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${context} baris ${i + 1}: Harga (unitPrice) wajib diisi dan > 0.`);
  }
}
async function replacePoLines(tx: any, poId: number, lines: any[]) {
  validateRequireUnitPrice(lines, "PO");
  await tx.delete(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.purchaseOrderId, poId));
  for (const l of lines) {
    const deliveryDate = l.deliveryDate ?? l.expectedDate ?? l.tanggalKirim ?? null;
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = await resolveInternalId(s.uom, l.uomId);
    if (!itemId || !uomId) throw new Error(`Item/UOM tidak valid pada baris PO`);
    await tx.insert(s.purchaseOrderLines).values({
      purchaseOrderId: poId,
      itemId,
      uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
      discount: l.discount != null && String(l.discount).trim() !== "" ? String(l.discount) : "0",
      batchNumber: l.batchNumber ?? null,
      note: l.note ?? null,
      deliveryDate: deliveryDate ? String(deliveryDate).slice(0, 10) : null,
    });
  }
}

supplyChainRouter.post("/purchase-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.supplierId || !b.warehouseId || !b.orderDate) return res.status(400).json({ error: "supplierId, warehouseId, orderDate wajib." });
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "PO"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const supplierId = await resolveInternalId(s.suppliers, b.supplierId);
    const warehouseId = await resolveInternalId(s.warehouses, b.warehouseId);
    const branchId = b.branchId ? await resolveInternalId(s.branches, b.branchId) : null;
    if (!supplierId || !warehouseId) return res.status(400).json({ error: "supplierId/warehouseId tidak valid." });
    let taxCategoryId: number | null = null;
    let resolvedTaxRate: string | null = null;
    if (b.taxCategoryId) {
      taxCategoryId = await resolveInternalId((s as any).taxCategories, String(b.taxCategoryId));
      if (!taxCategoryId) return res.status(400).json({ error: "taxCategoryId tidak valid." });
      const [cat] = await db.select({ percentage: (s as any).taxCategories.percentage }).from((s as any).taxCategories).where(eq((s as any).taxCategories.id, taxCategoryId)).limit(1);
      if (cat) resolvedTaxRate = String(cat.percentage);
    } else {
      resolvedTaxRate = "0";
    }
    let priceListId: number | null = null;
    if (b.priceListId) {
      priceListId = await resolveInternalId((s as any).priceLists, String(b.priceListId));
      if (!priceListId) return res.status(400).json({ error: "priceListId tidak valid." });
    }
    let globalDiscountPercent = "0";
    if (b.globalDiscountPercent !== undefined && b.globalDiscountPercent !== null && String(b.globalDiscountPercent).trim() !== "") {
      const v = Number(b.globalDiscountPercent);
      if (!Number.isFinite(v) || v < 0 || v > 100) return res.status(400).json({ error: "globalDiscountPercent harus 0-100." });
      globalDiscountPercent = String(v);
    }
    let additionalCharges: { type: string; amount: string }[] = [];
    if (Array.isArray(b.additionalCharges)) {
      const allowed = new Set(["freight", "handling", "other"]);
      for (const c of b.additionalCharges) {
        const t = String(c.type ?? "").trim().toLowerCase();
        if (!allowed.has(t)) return res.status(400).json({ error: `additionalCharges type harus freight, handling, atau other.` });
        const a = Number(c.amount);
        if (!Number.isFinite(a) || a < 0) return res.status(400).json({ error: "additionalCharges amount harus >=0." });
        additionalCharges.push({ type: t, amount: String(a) });
      }
    }
    const seriesIdRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesIdRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesIdRaw));
    // Determine needApproval: default true jika ada workflow PO isDefault+isActive, else false (bisa di-override client)
    let needApproval: boolean;
    if (b.needApproval !== undefined) needApproval = !!b.needApproval;
    else {
      const [def] = await db
        .select({ id: s.workflows.id })
        .from(s.workflows)
        .where(and(eq(s.workflows.documentType, "PO"), eq(s.workflows.isDefault, true), eq(s.workflows.isActive, true)))
        .limit(1);
      needApproval = !!def;
    }
    // Prepared signature snapshot per account (jika ada) — resolve via publicId
    const actorPublicIdForPrep = (req as any).user?.id ?? null;
    let actorInternalIdForPrep: number | null = null;
    if (actorPublicIdForPrep) {
      const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.publicId, actorPublicIdForPrep)).limit(1);
      actorInternalIdForPrep = u?.id ?? null;
    }
    let preparedSignature: string | null = null;
    let preparedSignedAt: Date | null = null;
    let preparedBy: number | null = null;
    if (actorInternalIdForPrep) {
      const [sig] = await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalIdForPrep)).limit(1);
      if (sig?.signatureData) {
        preparedSignature = sig.signatureData;
        preparedSignedAt = new Date();
        preparedBy = actorInternalIdForPrep;
      } else {
        preparedBy = actorInternalIdForPrep;
        // tetap set preparedBy walau signature kosong, untuk tracking
      }
    }
    // generate documentNo at DRAFT
    const { documentNo, seriesId: resolvedSeriesId, id: newId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "PO", { seriesId: seriesId ?? undefined, branchId: branchId ?? undefined, date: b.orderDate ? new Date(b.orderDate) : new Date() });
      const [ins] = await tx.insert(s.purchaseOrders).values({
        documentNo: doc.documentNo,
        seriesId: doc.seriesId,
        supplierId,
        warehouseId,
        orderDate: b.orderDate,
        expectedDate: b.expectedDate ?? null,
        status: "DRAFT",
        notes: b.notes ?? null,
        department: b.department ?? null,
        costCenter: b.costCenter ?? null,
        currency: b.currency ? String(b.currency).toUpperCase() : "IDR",
        exchangeRate: b.exchangeRate != null ? String(b.exchangeRate) : "1",
        allowEditOrderDate: b.allowEditOrderDate ?? false,
        qcRequired: b.qcRequired ?? true,
        needApproval,
        preparedSignature,
        preparedSignedAt,
        preparedBy,
        globalDiscountPercent,
        additionalCharges,
        taxRate: resolvedTaxRate ?? (b.taxRate != null ? String(b.taxRate) : "0"),
        taxCategoryId,
        priceListId,
        createdBy: (await getActorInfo(req)).internalId ?? null,
        branchId,
      }).returning();
      if (Array.isArray(b.lines)) await replacePoLines(tx, ins.id, b.lines);
      return { documentNo: doc.documentNo, seriesId: doc.seriesId, id: ins.id, publicId: ins.publicId };
    });
    // fetch created publicId
    const [created] = await db.select({ publicId: s.purchaseOrders.publicId, documentNo: s.purchaseOrders.documentNo }).from(s.purchaseOrders).where(eq(s.purchaseOrders.documentNo, documentNo)).limit(1);
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "PO", documentId: newId, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo } });
    } catch {}
    res.status(201).json({ id: created.publicId, documentNo: created.documentNo, seriesId: resolvedSeriesId });
  } catch (e) { next(e); }
});

supplyChainRouter.get("/purchase-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.purchaseOrders.status as any, String(req.query.status)));
    if (req.query.warehouseId) {
      const wid = await resolveInternalId(s.warehouses, String(req.query.warehouseId));
      if (wid) conds.push(eq(s.purchaseOrders.warehouseId, wid));
    }
    if (req.query.supplierId) {
      const sid = await resolveInternalId(s.suppliers, String(req.query.supplierId));
      if (sid) conds.push(eq(s.purchaseOrders.supplierId, sid));
    }
    const rows = await db.select({
      id: s.purchaseOrders.id,
      publicId: s.purchaseOrders.publicId,
      documentNo: s.purchaseOrders.documentNo,
      seriesId: s.purchaseOrders.seriesId,
      supplierId: s.purchaseOrders.supplierId,
      warehouseId: s.purchaseOrders.warehouseId,
      orderDate: s.purchaseOrders.orderDate,
      expectedDate: s.purchaseOrders.expectedDate,
      status: s.purchaseOrders.status,
      notes: s.purchaseOrders.notes,
      department: (s as any).purchaseOrders.department,
      costCenter: (s as any).purchaseOrders.costCenter,
      currency: (s as any).purchaseOrders.currency,
      exchangeRate: (s as any).purchaseOrders.exchangeRate,
      allowEditOrderDate: s.purchaseOrders.allowEditOrderDate,
      qcRequired: s.purchaseOrders.qcRequired,
      needApproval: (s.purchaseOrders as any).needApproval,
      currentApprovalLevel: (s.purchaseOrders as any).currentApprovalLevel,
      approvalWorkflowId: (s.purchaseOrders as any).approvalWorkflowId,
      globalDiscountPercent: (s.purchaseOrders as any).globalDiscountPercent,
      additionalCharges: (s.purchaseOrders as any).additionalCharges,
      taxRate: s.purchaseOrders.taxRate,
      taxCategoryId: (s as any).purchaseOrders.taxCategoryId,
      priceListId: (s as any).purchaseOrders.priceListId,
      createdBy: s.purchaseOrders.createdBy,
      branchId: s.purchaseOrders.branchId,
      createdAt: s.purchaseOrders.createdAt,
      updatedAt: s.purchaseOrders.updatedAt,
    }).from(s.purchaseOrders).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.purchaseOrders.orderDate));
    // map to API: expose publicId as id, documentNo, and keep internal for FK joins
    const out = rows.map((r) => ({
      id: r.publicId,
      publicId: r.publicId,
      _internalId: r.id,
      documentNo: r.documentNo,
      poNo: r.documentNo, // alias for backward compat
      supplierId: r.supplierId,
      warehouseId: r.warehouseId,
      orderDate: r.orderDate,
      expectedDate: r.expectedDate,
      status: r.status,
      notes: r.notes,
      department: (r as any).department ?? null,
      costCenter: (r as any).costCenter ?? null,
      currency: (r as any).currency ?? "IDR",
      exchangeRate: (r as any).exchangeRate ?? "1",
      allowEditOrderDate: (r as any).allowEditOrderDate ?? false,
      qcRequired: (r as any).qcRequired ?? true,
      needApproval: (r as any).needApproval ?? false,
      currentApprovalLevel: (r as any).currentApprovalLevel ?? 0,
      approvalWorkflowId: (r as any).approvalWorkflowId ?? null,
      globalDiscountPercent: (r as any).globalDiscountPercent ?? "0",
      additionalCharges: (r as any).additionalCharges ?? [],
      taxRate: (r as any).taxRate ?? "0",
      taxCategoryId: (r as any).taxCategoryId ?? null,
      priceListId: (r as any).priceListId ?? null,
      createdBy: r.createdBy,
      branchId: r.branchId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    // enrich supplier/branch publicIds if needed: fetch mappings
    // For performance, return internal ids; frontend can resolve via separate fetch or we map to publicId
    // Here we map supplierId/warehouseId to publicId for frontend convenience
    const supplierIds = [...new Set(out.map((o) => o.supplierId).filter(Boolean))] as number[];
    const warehouseIds = [...new Set(out.map((o) => o.warehouseId).filter(Boolean))] as number[];
    const branchIds = [...new Set(out.map((o:any)=> o.branchId).filter(Boolean))] as number[];
    const taxCatIds = [...new Set(out.map((o:any)=> o.taxCategoryId).filter(Boolean))] as number[];
    if (supplierIds.length) {
      const sups = await db.select({ id: s.suppliers.id, publicId: s.suppliers.publicId }).from(s.suppliers).where(inArray(s.suppliers.id, supplierIds));
      const map = new Map(sups.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.supplierId = map.get(o.supplierId) ?? o.supplierId; });
    }
    if (warehouseIds.length) {
      const whs = await db.select({ id: s.warehouses.id, publicId: s.warehouses.publicId }).from(s.warehouses).where(inArray(s.warehouses.id, warehouseIds));
      const map = new Map(whs.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.warehouseId = map.get(o.warehouseId) ?? o.warehouseId; });
    }
    if (branchIds.length) {
      const brs = await db.select({ id: s.branches.id, publicId: s.branches.publicId }).from(s.branches).where(inArray(s.branches.id, branchIds));
      const map = new Map(brs.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.branchId = map.get(o.branchId) ?? o.branchId; });
    }
    if (taxCatIds.length) {
      const cats = await db.select({ id: (s as any).taxCategories.id, publicId: (s as any).taxCategories.publicId, name: (s as any).taxCategories.name, percentage: (s as any).taxCategories.percentage }).from((s as any).taxCategories).where(inArray((s as any).taxCategories.id, taxCatIds));
      const map = new Map(cats.map((x:any)=> [x.id, x]));
      out.forEach((o:any)=> {
        const cat = map.get(o.taxCategoryId);
        if (cat) { o.taxCategoryId = cat.publicId; o.taxCategoryName = cat.name; o.taxCategoryPercentage = String(cat.percentage); }
        else o.taxCategoryId = o.taxCategoryId ? String(o.taxCategoryId) : null;
      });
    } else {
      out.forEach((o:any)=> { if (o.taxCategoryId) o.taxCategoryId = String(o.taxCategoryId); });
    }
    const priceListIds = [...new Set(out.map((o:any)=> o.priceListId).filter(Boolean))] as number[];
    if (priceListIds.length) {
      const pls = await db.select({ id: (s as any).priceLists.id, publicId: (s as any).priceLists.publicId, name: (s as any).priceLists.name }).from((s as any).priceLists).where(inArray((s as any).priceLists.id, priceListIds));
      const map = new Map(pls.map((x:any)=> [x.id, x]));
      out.forEach((o:any)=> {
        const pl = map.get(o.priceListId);
        if (pl) { o.priceListId = pl.publicId; o.priceListName = pl.name; }
        else o.priceListId = o.priceListId ? String(o.priceListId) : null;
      });
    } else {
      out.forEach((o:any)=> { if (o.priceListId) o.priceListId = String(o.priceListId); });
    }
    // enrich createdBy -> createdByName
    const createdByIds = [...new Set(out.map((o:any)=> o.createdBy).filter(Boolean))] as number[];
    if (createdByIds.length) {
      const users = await db.select({ id: s.users.id, name: s.users.name }).from(s.users).where(inArray(s.users.id, createdByIds));
      const map = new Map(users.map((u:any)=> [u.id, u.name]));
      out.forEach((o:any)=> { o.createdByName = map.get(o.createdBy) ?? null; });
    } else {
      out.forEach((o:any)=> { o.createdByName = null; });
    }
    const wfIds = [...new Set(out.map((o:any)=> o.approvalWorkflowId).filter(Boolean))] as number[];
    if (wfIds.length) {
      const wfs = await db.select({ id: s.workflows.id, publicId: s.workflows.publicId }).from(s.workflows).where(inArray(s.workflows.id, wfIds));
      const map = new Map(wfs.map((x:any)=> [x.id, x.publicId]));
      out.forEach((o:any)=> { o.approvalWorkflowId = map.get(o.approvalWorkflowId) ?? (o.approvalWorkflowId ? String(o.approvalWorkflowId) : null); });
    } else {
      out.forEach((o:any)=> { if (o.approvalWorkflowId) o.approvalWorkflowId = String(o.approvalWorkflowId); });
    }
    res.json(out);
  } catch (e) { next(e); }
});

supplyChainRouter.get("/purchase-orders/last-price", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const itemIdParam = String(req.query.itemId ?? "").trim();
    const itemIdsRaw = String(req.query.itemIds ?? "").trim();
    const idsRaw = itemIdParam ? [itemIdParam] : itemIdsRaw ? itemIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : [];
    if (idsRaw.length === 0) return res.json({});
    const ids = await resolveManyIds(s.items, idsRaw);
    if (ids.length === 0) return res.json({});
    const rows = await db.select({ itemId: s.purchaseOrderLines.itemId, unitPrice: s.purchaseOrderLines.unitPrice, orderDate: s.purchaseOrders.orderDate }).from(s.purchaseOrderLines).innerJoin(s.purchaseOrders, eq(s.purchaseOrders.id, s.purchaseOrderLines.purchaseOrderId)).where(inArray(s.purchaseOrderLines.itemId, ids)).orderBy(desc(s.purchaseOrders.orderDate), desc(s.purchaseOrders.createdAt));
    const map: Record<string, string | null> = {};
    const idToPublic = new Map<number, string>();
    // need to map internal itemId to publicId string for response key
    if (ids.length) {
      const items = await db.select({ id: s.items.id, publicId: s.items.publicId }).from(s.items).where(inArray(s.items.id, ids));
      items.forEach((it) => idToPublic.set(it.id, it.publicId));
    }
    for (const r of rows) {
      const pub = idToPublic.get(r.itemId) ?? String(r.itemId);
      if (!(pub in map)) map[pub] = r.unitPrice != null ? String(r.unitPrice) : null;
    }
    for (const pub of idsRaw) {
      // map missing: find internal then public
      const internal = await resolveInternalId(s.items, pub);
      const pubKey = internal ? (idToPublic.get(internal) ?? pub) : pub;
      if (!(pubKey in map)) map[pubKey] = null;
    }
    if (itemIdParam) {
      const internal = await resolveInternalId(s.items, itemIdParam);
      const pub = internal ? (idToPublic.get(internal) ?? itemIdParam) : itemIdParam;
      return res.json({ itemId: pub, unitPrice: map[pub] });
    }
    return res.json(map);
  } catch (e) { next(e); }
});

supplyChainRouter.get("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = poWhere(pid);
    const [row] = await db.select().from(s.purchaseOrders).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    const lines = await poLines(db, row.id);
    // map lines itemId/uomId to publicId
    const itemIds = [...new Set(lines.map((l: any) => l.itemId))];
    const uomIds = [...new Set(lines.map((l: any) => l.uomId).filter(Boolean))];
    let itemMap = new Map<number, string>();
    let uomMap = new Map<number, string>();
    if (itemIds.length) {
      const items = await db.select({ id: s.items.id, publicId: s.items.publicId }).from(s.items).where(inArray(s.items.id, itemIds));
      items.forEach((it) => itemMap.set(it.id, it.publicId));
    }
    if (uomIds.length) {
      const uoms = await db.select({ id: s.uom.id, publicId: s.uom.publicId }).from(s.uom).where(inArray(s.uom.id, uomIds as number[]));
      uoms.forEach((u) => uomMap.set(u.id, u.publicId));
    }
    const mappedLines = lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id, purchaseOrderId: row.publicId, itemId: itemMap.get(l.itemId) ?? l.itemId, uomId: l.uomId ? (uomMap.get(l.uomId) ?? l.uomId) : null }));
    const [supplier] = row.supplierId ? await db.select({ publicId: s.suppliers.publicId }).from(s.suppliers).where(eq(s.suppliers.id, row.supplierId)).limit(1) : [];
    const [warehouse] = row.warehouseId ? await db.select({ publicId: s.warehouses.publicId }).from(s.warehouses).where(eq(s.warehouses.id, row.warehouseId)).limit(1) : [];
    const [branch] = (row as any).branchId ? await db.select({ publicId: s.branches.publicId }).from(s.branches).where(eq(s.branches.id, (row as any).branchId)).limit(1) : [];
    let taxCategoryPublicId: string | null = null;
    let taxCategoryName: string | null = null;
    let taxCategoryPercentage: string | null = null;
    if ((row as any).taxCategoryId) {
      const [cat] = await db.select({ publicId: (s as any).taxCategories.publicId, name: (s as any).taxCategories.name, percentage: (s as any).taxCategories.percentage }).from((s as any).taxCategories).where(eq((s as any).taxCategories.id, (row as any).taxCategoryId)).limit(1);
      if (cat) { taxCategoryPublicId = cat.publicId; taxCategoryName = cat.name; taxCategoryPercentage = String(cat.percentage); }
    }
    let priceListPublicId: string | null = null;
    let priceListName: string | null = null;
    if ((row as any).priceListId) {
      const [pl] = await db.select({ publicId: (s as any).priceLists.publicId, name: (s as any).priceLists.name }).from((s as any).priceLists).where(eq((s as any).priceLists.id, (row as any).priceListId)).limit(1);
      if (pl) { priceListPublicId = pl.publicId; priceListName = pl.name; }
    }
    let approvalWorkflowPublicId: string | null = null;
    if ((row as any).approvalWorkflowId) {
      const [wf] = await db.select({ publicId: s.workflows.publicId }).from(s.workflows).where(eq(s.workflows.id, (row as any).approvalWorkflowId)).limit(1);
      if (wf) approvalWorkflowPublicId = wf.publicId;
    }
    let preparedByPublicId: string | null = null;
    let preparedByName: string | null = null;
    let preparedByRole: string | null = null;
    if ((row as any).preparedBy) {
      const [u] = await db.select({ publicId: s.users.publicId, name: s.users.name, roleId: s.users.roleId }).from(s.users).where(eq(s.users.id, (row as any).preparedBy)).limit(1);
      if (u) {
        preparedByPublicId = u.publicId;
        preparedByName = u.name;
        if (u.roleId) {
          const [r] = await db.select({ name: s.roles.name }).from(s.roles).where(eq(s.roles.id, u.roleId)).limit(1);
          if (r) preparedByRole = r.name;
        }
      }
    } else if ((row as any).createdBy) {
      const [u] = await db.select({ publicId: s.users.publicId, name: s.users.name, roleId: s.users.roleId }).from(s.users).where(eq(s.users.id, (row as any).createdBy)).limit(1);
      if (u) {
        preparedByPublicId = u.publicId;
        preparedByName = u.name;
        if (u.roleId) {
          const [r] = await db.select({ name: s.roles.name }).from(s.roles).where(eq(s.roles.id, u.roleId)).limit(1);
          if (r) preparedByRole = r.name;
        }
      }
    }
    let approvedByPublicId: string | null = null;
    let approvedByName: string | null = null;
    let approvedByRole: string | null = null;
    if ((row as any).approvedBy) {
      const [u] = await db.select({ publicId: s.users.publicId, name: s.users.name, roleId: s.users.roleId }).from(s.users).where(eq(s.users.id, (row as any).approvedBy)).limit(1);
      if (u) {
        approvedByPublicId = u.publicId;
        approvedByName = u.name;
        if (u.roleId) {
          const [r] = await db.select({ name: s.roles.name }).from(s.roles).where(eq(s.roles.id, u.roleId)).limit(1);
          if (r) approvedByRole = r.name;
        }
      }
    }
    res.json({
      id: row.publicId,
      publicId: row.publicId,
      _internalId: row.id,
      documentNo: row.documentNo,
      poNo: row.documentNo,
      supplierId: supplier?.publicId ?? row.supplierId,
      warehouseId: warehouse?.publicId ?? row.warehouseId,
      orderDate: row.orderDate,
      expectedDate: row.expectedDate,
      status: row.status,
      notes: row.notes,
      department: (row as any).department ?? null,
      costCenter: (row as any).costCenter ?? null,
      currency: (row as any).currency ?? "IDR",
      exchangeRate: (row as any).exchangeRate ?? "1",
      allowEditOrderDate: (row as any).allowEditOrderDate ?? false,
      qcRequired: (row as any).qcRequired ?? true,
      needApproval: (row as any).needApproval ?? false,
      currentApprovalLevel: (row as any).currentApprovalLevel ?? 0,
      approvalWorkflowId: approvalWorkflowPublicId,
      preparedSignature: (row as any).preparedSignature ?? null,
      preparedSignedAt: (row as any).preparedSignedAt ?? null,
      preparedBy: preparedByPublicId,
      preparedByName,
      preparedByRole,
      approvedSignature: (row as any).approvedSignature ?? null,
      approvedSignedAt: (row as any).approvedSignedAt ?? null,
      approvedBy: approvedByPublicId,
      approvedByName,
      approvedByRole,
      globalDiscountPercent: (row as any).globalDiscountPercent ?? "0",
      additionalCharges: (row as any).additionalCharges ?? [],
      taxRate: (row as any).taxRate ?? "0",
      taxCategoryId: taxCategoryPublicId,
      taxCategoryName,
      taxCategoryPercentage,
      priceListId: priceListPublicId,
      priceListName,
      createdBy: row.createdBy,
      branchId: branch?.publicId ?? (row as any).branchId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lines: mappedLines,
      receipts: await db.select().from(s.goodsReceipts).where(eq(s.goodsReceipts.purchaseOrderId, row.id)).then((rows) => rows.map((r: any) => ({ ...r, id: r.publicId, _internalId: r.id, documentNo: r.documentNo, grNo: r.documentNo }))),
    });
  } catch (e) { next(e); }
});

putAndPatch("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = poWhere(pid);
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya PO berstatus DRAFT yang dapat diubah." });
    // fetch full old row + old lines for diff (per baris)
    const [oldRowFull] = await db.select().from(s.purchaseOrders).where(where).limit(1);
    let oldLines: any[] = [];
    try { if (Array.isArray((req.body as any)?.lines)) oldLines = await db.select().from(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.purchaseOrderId, cur.id)); } catch {}
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "PO"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const patch: Record<string, any> = {};
    if (b.supplierId !== undefined) patch.supplierId = await resolveInternalId(s.suppliers, String(b.supplierId));
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.orderDate !== undefined) patch.orderDate = b.orderDate;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.department !== undefined) patch.department = b.department ? String(b.department).trim() : null;
    if (b.costCenter !== undefined) patch.costCenter = b.costCenter ? String(b.costCenter).trim() : null;
    if (b.branchId !== undefined) patch.branchId = b.branchId ? await resolveInternalId(s.branches, String(b.branchId)) : null;
    if (b.currency !== undefined) {
      const cur = String(b.currency).trim().toUpperCase();
      if (!["IDR","USD","EUR","SGD","JPY","CNY","MYR","THB","AUD"].includes(cur)) {
        return res.status(400).json({ error: "Currency tidak valid." });
      }
      patch.currency = cur;
      if (cur === "IDR") patch.exchangeRate = "1";
    }
    if (b.exchangeRate !== undefined) {
      const er = Number(b.exchangeRate);
      if (!isFinite(er) || er <= 0) return res.status(400).json({ error: "Exchange Rate harus >0." });
      patch.exchangeRate = String(er);
    }
    if (b.allowEditOrderDate !== undefined) patch.allowEditOrderDate = !!b.allowEditOrderDate;
    if (b.qcRequired !== undefined) patch.qcRequired = !!b.qcRequired;
    if (b.needApproval !== undefined) patch.needApproval = !!b.needApproval;
    if (b.globalDiscountPercent !== undefined) {
      const v = Number(b.globalDiscountPercent);
      if (b.globalDiscountPercent === null || String(b.globalDiscountPercent).trim() === "") {
        patch.globalDiscountPercent = "0";
      } else if (!Number.isFinite(v) || v < 0 || v > 100) {
        return res.status(400).json({ error: "globalDiscountPercent harus 0-100." });
      } else {
        patch.globalDiscountPercent = String(v);
      }
    }
    if (b.additionalCharges !== undefined) {
      if (!Array.isArray(b.additionalCharges)) return res.status(400).json({ error: "additionalCharges harus array." });
      const allowed = new Set(["freight", "handling", "other"]);
      const arr: { type: string; amount: string }[] = [];
      for (const c of b.additionalCharges) {
        const t = String(c.type ?? "").trim().toLowerCase();
        if (!allowed.has(t)) return res.status(400).json({ error: `additionalCharges type harus freight, handling, atau other.` });
        const a = Number(c.amount);
        if (!Number.isFinite(a) || a < 0) return res.status(400).json({ error: "additionalCharges amount harus >=0." });
        arr.push({ type: t, amount: String(a) });
      }
      patch.additionalCharges = arr;
    }
    if (b.taxRate !== undefined) patch.taxRate = String(b.taxRate);
    if (b.taxCategoryId !== undefined) {
      if (b.taxCategoryId == null || String(b.taxCategoryId).trim() === "") {
        patch.taxCategoryId = null;
        patch.taxRate = "0";
      } else {
        const tid = await resolveInternalId((s as any).taxCategories, String(b.taxCategoryId));
        if (!tid) return res.status(400).json({ error: "taxCategoryId tidak valid." });
        patch.taxCategoryId = tid;
        const [cat] = await db.select({ percentage: (s as any).taxCategories.percentage }).from((s as any).taxCategories).where(eq((s as any).taxCategories.id, tid)).limit(1);
        if (cat) patch.taxRate = String(cat.percentage);
      }
    }
    if (b.priceListId !== undefined) {
      if (b.priceListId == null || String(b.priceListId).trim() === "") {
        patch.priceListId = null;
      } else {
        const plid = await resolveInternalId((s as any).priceLists, String(b.priceListId));
        if (!plid) return res.status(400).json({ error: "priceListId tidak valid." });
        patch.priceListId = plid;
      }
    }
    patch.updatedAt = new Date();
    await db.update(s.purchaseOrders).set(patch).where(eq(s.purchaseOrders.id, cur.id));
    let linesDiff: any = null;
    if (Array.isArray(b.lines)) {
      await db.transaction(async (tx) => { await replacePoLines(tx, cur.id, b.lines); });
      try {
        const newLinesResolved = await Promise.all((b.lines as any[]).map(async (l: any) => {
          const itemId = l.itemId ? await resolveInternalId(s.items, String(l.itemId)) : l.itemId;
          const uomId = l.uomId ? await resolveInternalId(s.uom, String(l.uomId)) : l.uomId;
          return { ...l, itemId: itemId ?? l.itemId, uomId: uomId ?? l.uomId };
        }));
        linesDiff = diffLines(oldLines as any, newLinesResolved as any);
      } catch {}
    }
    try {
      const { internalId, role } = await getActorInfo(req);
      const changes = computeDiff(oldRowFull as any, patch as any, { denylist: DIFF_DENYLIST });
      const meta: Record<string, unknown> = { patchKeys: Object.keys(patch) };
      if (Object.keys(changes).length) meta.changes = changes;
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
      await logActivity({ documentType: "PO", documentId: cur.id, action: "update", fromStatus: cur.status, toStatus: cur.status, actorUserId: internalId, actorRole: role, metadata: meta });
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.delete("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = poWhere(pid);
    const [cur] = await db.select({ id: s.purchaseOrders.id }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    await db.delete(s.purchaseOrders).where(eq(s.purchaseOrders.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/purchase-orders/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = poWhere(pid);
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status, needApproval: (s.purchaseOrders as any).needApproval, currentApprovalLevel: (s.purchaseOrders as any).currentApprovalLevel, approvalWorkflowId: (s.purchaseOrders as any).approvalWorkflowId, preparedSignature: (s.purchaseOrders as any).preparedSignature, preparedBy: (s.purchaseOrders as any).preparedBy }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "PO dibatalkan tidak dapat diposting." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya PO berstatus DRAFT yang dapat diposting." });
    // ensure prepared signature snapshot if missing (per account) — resolve via publicId
    const actorPublicId = (req as any).user?.id ?? null;
    let actorInternalId: number | null = null;
    if (actorPublicId) {
      const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.publicId, actorPublicId)).limit(1);
      actorInternalId = u?.id ?? null;
    }
    if (actorInternalId && !(cur as any).preparedSignature) {
      const [sig] = await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalId)).limit(1);
      if (sig?.signatureData) {
        await db.update(s.purchaseOrders).set({ preparedSignature: sig.signatureData, preparedSignedAt: new Date(), preparedBy: actorInternalId }).where(eq(s.purchaseOrders.id, cur.id));
      } else if (actorInternalId) {
        await db.update(s.purchaseOrders).set({ preparedBy: actorInternalId, preparedSignedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      }
    }
    const needApproval = !!(cur as any).needApproval;
    const { internalId: postActorId, role: postRole } = await getActorInfo(req);
    if (!needApproval) {
      await db.update(s.purchaseOrders).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      try { await logActivity({ documentType: "PO", documentId: cur.id, action: "post", fromStatus: "DRAFT", toStatus: "POSTED", actorUserId: postActorId, actorRole: postRole }); } catch {}
      return res.json({ ok: true });
    }
    // needApproval true -> masuk alur approval
    const [wf] = await db.select({ id: s.workflows.id }).from(s.workflows).where(and(eq(s.workflows.documentType, "PO"), eq(s.workflows.isDefault, true), eq(s.workflows.isActive, true))).limit(1);
    if (!wf) {
      // tidak ada workflow default -> langsung APPROVED
      await db.update(s.purchaseOrders).set({ status: "APPROVED", currentApprovalLevel: 0, approvalWorkflowId: null, updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      try { await logActivity({ documentType: "PO", documentId: cur.id, action: "post", fromStatus: "DRAFT", toStatus: "APPROVED", actorUserId: postActorId, actorRole: postRole }); } catch {}
      return res.json({ ok: true });
    }
    const states = await db.select({ id: s.workflowStates.id, orderNo: s.workflowStates.orderNo }).from(s.workflowStates).where(eq(s.workflowStates.workflowId, wf.id)).orderBy(s.workflowStates.orderNo);
    const approvers = states.filter((st: any) => true); // semua state dianggap langkah approve, urut orderNo
    // filter intermediate saja jika ada type, tapi fallback ke semua
    const intermediate = await db.select().from(s.workflowStates).where(and(eq(s.workflowStates.workflowId, wf.id), eq(s.workflowStates.type as any, "intermediate"))).then((rows)=> rows.sort((a:any,b:any)=> a.orderNo - b.orderNo));
    const levels = intermediate.length > 0 ? intermediate : states;
    if (levels.length === 0) {
      await db.update(s.purchaseOrders).set({ status: "APPROVED", currentApprovalLevel: 0, approvalWorkflowId: wf.id, updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      try { await logActivity({ documentType: "PO", documentId: cur.id, action: "post", fromStatus: "DRAFT", toStatus: "APPROVED", actorUserId: postActorId, actorRole: postRole, metadata: { workflowId: wf.id } }); } catch {}
      return res.json({ ok: true });
    }
    await db.update(s.purchaseOrders).set({ status: "PENDING_APPROVAL", currentApprovalLevel: 1, approvalWorkflowId: wf.id, updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
    try {
      const approvalLevels = await snapshotApprovalLevelsForDoc({ documentType: "PO", workflowId: wf.id, currentLevel: 1, status: "PENDING_APPROVAL" });
      await logActivity({ documentType: "PO", documentId: cur.id, action: "post", fromStatus: "DRAFT", toStatus: "PENDING_APPROVAL", actorUserId: postActorId, actorRole: postRole, metadata: { workflowId: wf.id, level: 1, total: levels.length, approvalLevels } });
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/purchase-orders/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = poWhere(pid);
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "PO sudah dibatalkan." });
    await db.update(s.purchaseOrders).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "PO", documentId: cur.id, action: "cancel", fromStatus: cur.status, toStatus: "CANCELED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/purchase-orders/:id/approve", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = poWhere(pid);
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status, needApproval: (s.purchaseOrders as any).needApproval, currentApprovalLevel: (s.purchaseOrders as any).currentApprovalLevel, approvalWorkflowId: (s.purchaseOrders as any).approvalWorkflowId }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (!(cur as any).needApproval) return res.status(400).json({ error: "PO ini tidak membutuhkan approval." });
    if ((cur as any).status !== "PENDING_APPROVAL") return res.status(400).json({ error: "Hanya PO dengan status Pending Approval yang bisa di-approve." });
    const actorPublicId = (req as any).user?.id ?? null;
    let actorInternalId: number | null = null;
    if (actorPublicId) {
      const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.publicId, actorPublicId)).limit(1);
      actorInternalId = u?.id ?? null;
    }
    const wfId = (cur as any).approvalWorkflowId;
    let wf: any = null;
    if (wfId) {
      const [row] = await db.select({ id: s.workflows.id }).from(s.workflows).where(eq(s.workflows.id, wfId)).limit(1);
      wf = row;
    }
    if (!wf) {
      const [def] = await db.select({ id: s.workflows.id }).from(s.workflows).where(and(eq(s.workflows.documentType, "PO"), eq(s.workflows.isDefault, true), eq(s.workflows.isActive, true))).limit(1);
      wf = def;
    }
    if (!wf) {
      const [sig] = actorInternalId ? await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalId)).limit(1) : [null as any];
      await db.update(s.purchaseOrders).set({ status: "APPROVED", approvedSignature: sig?.signatureData ?? null, approvedSignedAt: sig ? new Date() : null, approvedBy: actorInternalId, updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      try { const { role } = await getActorInfo(req); await logActivity({ documentType: "PO", documentId: cur.id, action: "approve", fromStatus: "PENDING_APPROVAL", toStatus: "APPROVED", actorUserId: actorInternalId, actorRole: role }); } catch {}
      return res.json({ ok: true });
    }
    const intermediate = await db.select().from(s.workflowStates).where(and(eq(s.workflowStates.workflowId, wf.id), eq((s.workflowStates as any).type, "intermediate"))).then((rows:any)=> rows.sort((a:any,b:any)=> a.orderNo - b.orderNo));
    const levels = intermediate.length > 0 ? intermediate : await db.select().from(s.workflowStates).where(eq(s.workflowStates.workflowId, wf.id)).then((rows:any)=> rows.sort((a:any,b:any)=> a.orderNo - b.orderNo));
    const total = levels.length;
    const current = Number((cur as any).currentApprovalLevel || 1);
    const curState = levels[current - 1];
    if (curState?.requiresSignature) {
      if (!actorInternalId) return res.status(401).json({ error: "Tidak terautentikasi." });
      const [sig] = await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalId)).limit(1);
      if (!sig?.signatureData) return res.status(400).json({ error: "Anda belum memiliki signature. Buat di Profile → Signature." });
    }
    if (total === 0) {
      const [sig] = actorInternalId ? await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalId)).limit(1) : [null as any];
      await db.update(s.purchaseOrders).set({ status: "APPROVED", currentApprovalLevel: 0, approvedSignature: sig?.signatureData ?? null, approvedSignedAt: sig ? new Date() : null, approvedBy: actorInternalId, updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      try { const { role } = await getActorInfo(req); await logActivity({ documentType: "PO", documentId: cur.id, action: "approve", fromStatus: "PENDING_APPROVAL", toStatus: "APPROVED", actorUserId: actorInternalId, actorRole: role, metadata: { level: current, total } }); } catch {}
      return res.json({ ok: true });
    }
    const [sigRow] = actorInternalId ? await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalId)).limit(1) : [null as any];
    if (current >= total) {
      await db.update(s.purchaseOrders).set({ status: "APPROVED", currentApprovalLevel: total, approvedSignature: sigRow?.signatureData ?? null, approvedSignedAt: sigRow ? new Date() : null, approvedBy: actorInternalId, updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      try {
        const { role } = await getActorInfo(req);
        const approvalLevels = await snapshotApprovalLevelsForDoc({ documentType: "PO", workflowId: wf.id, currentLevel: total, status: "APPROVED" });
        await logActivity({ documentType: "PO", documentId: cur.id, action: "approve", fromStatus: "PENDING_APPROVAL", toStatus: "APPROVED", actorUserId: actorInternalId, actorRole: role, metadata: { level: current, total, approvalLevels } });
      } catch {}
    } else {
      await db.update(s.purchaseOrders).set({ status: "PENDING_APPROVAL", currentApprovalLevel: current + 1, updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
      try {
        const { role } = await getActorInfo(req);
        const approvalLevels = await snapshotApprovalLevelsForDoc({ documentType: "PO", workflowId: wf.id, currentLevel: current + 1, status: "PENDING_APPROVAL" });
        await logActivity({ documentType: "PO", documentId: cur.id, action: "approve", fromStatus: "PENDING_APPROVAL", toStatus: "PENDING_APPROVAL", actorUserId: actorInternalId, actorRole: role, metadata: { level: current, nextLevel: current + 1, total, approvalLevels } });
      } catch {}
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/purchase-orders/:id/reject", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = poWhere(pid);
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status, needApproval: (s.purchaseOrders as any).needApproval }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (!(cur as any).needApproval) return res.status(400).json({ error: "PO ini tidak membutuhkan approval." });
    if ((cur as any).status !== "PENDING_APPROVAL") return res.status(400).json({ error: "Hanya PO dengan status Pending Approval yang bisa di-reject." });
    await db.update(s.purchaseOrders).set({ status: "REJECTED", updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "PO", documentId: cur.id, action: "reject", fromStatus: "PENDING_APPROVAL", toStatus: "REJECTED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/purchase-orders/:id/create-receipt", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = undefined;
    if (isUuid(pid)) where = eq(s.purchaseOrders.publicId, pid);
    else where = eq(s.purchaseOrders.id, Number(pid));
    const [po] = await db.select().from(s.purchaseOrders).where(where).limit(1);
    if (!po) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (po.status === "CANCELED") return res.status(400).json({ error: "PO dibatalkan tidak dapat dibuatkan penerimaan." });
    const lines = await poLines(db, po.id);
    const { documentNo, seriesId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "GR", { branchId: po.branchId ?? undefined, date: req.body?.receiptDate ? new Date(req.body.receiptDate) : new Date() });
      const [gr] = await tx.insert(s.goodsReceipts).values({
        documentNo: doc.documentNo,
        seriesId: doc.seriesId,
        purchaseOrderId: po.id,
        supplierId: po.supplierId,
        warehouseId: po.warehouseId,
        receiptDate: (req.body?.receiptDate as string) || new Date().toISOString().slice(0, 10),
        status: "DRAFT",
        notes: req.body?.notes ?? null,
        createdBy: (await getActorInfo(req)).internalId ?? null,
        branchId: po.branchId,
      }).returning();
      for (const l of lines) {
        await tx.insert(s.goodsReceiptLines).values({
          goodsReceiptId: gr.id,
          itemId: l.itemId,
          uomId: l.uomId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          batchNumber: l.batchNumber,
          note: l.note,
        });
      }
      return { documentNo: doc.documentNo, seriesId: doc.seriesId, id: gr.id, publicId: gr.publicId };
    });
    const [created] = await db.select({ publicId: s.goodsReceipts.publicId }).from(s.goodsReceipts).where(eq(s.goodsReceipts.documentNo, documentNo)).limit(1);
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "PO", documentId: po.id, action: "convert", fromStatus: po.status, toStatus: po.status, actorUserId: internalId, actorRole: role, metadata: { targetType: "GR", targetDocumentNo: documentNo, targetPublicId: created.publicId } }); } catch {}
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// SALES ORDERS (simplified, same pattern)
// ---------------------------------------------------------------------------

async function soLines(tx: any, soId: number) { return tx.select().from(s.salesOrderLines).where(eq(s.salesOrderLines.salesOrderId, soId)); }
async function replaceSoLines(tx: any, soId: number, lines: any[]) {
  await tx.delete(s.salesOrderLines).where(eq(s.salesOrderLines.salesOrderId, soId));
  for (const l of lines) {
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = await resolveInternalId(s.uom, l.uomId);
    if (!itemId || !uomId) throw new Error("Item/UOM tidak valid");
    await tx.insert(s.salesOrderLines).values({ salesOrderId: soId, itemId, uomId, qty: String(l.qty), unitPrice: l.unitPrice != null ? String(l.unitPrice) : null, batchNumber: l.batchNumber ?? null, note: l.note ?? null });
  }
}
supplyChainRouter.post("/sales-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.customerId || !b.warehouseId || !b.orderDate) return res.status(400).json({ error: "customerId, warehouseId, orderDate wajib." });
    const customerId = await resolveInternalId(s.customers, String(b.customerId));
    const warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    const branchId = b.branchId ? await resolveInternalId(s.branches, String(b.branchId)) : null;
    if (!customerId || !warehouseId) return res.status(400).json({ error: "customerId/warehouseId tidak valid." });
    const seriesRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesRaw));
    const { documentNo, id: newId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "SO", { seriesId: seriesId ?? undefined, branchId: branchId ?? undefined, date: b.orderDate ? new Date(b.orderDate) : new Date() });
      const [ins] = await tx.insert(s.salesOrders).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, customerId, warehouseId, orderDate: b.orderDate, expectedDate: b.expectedDate ?? null, status: "DRAFT", notes: b.notes ?? null, createdBy: (await getActorInfo(req)).internalId ?? null, branchId }).returning();
      if (Array.isArray(b.lines)) await replaceSoLines(tx, ins.id, b.lines);
      return { documentNo: doc.documentNo, id: ins.id };
    });
    const [created] = await db.select({ publicId: s.salesOrders.publicId }).from(s.salesOrders).where(eq(s.salesOrders.documentNo, documentNo)).limit(1);
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "SO", documentId: newId, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo } });
    } catch {}
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});
supplyChainRouter.get("/sales-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.salesOrders.status as any, String(req.query.status)));
    if (req.query.warehouseId) {
      const wid = await resolveInternalId(s.warehouses, String(req.query.warehouseId));
      if (wid) conds.push(eq(s.salesOrders.warehouseId, wid));
    }
    if (req.query.customerId) {
      const cid = await resolveInternalId(s.customers, String(req.query.customerId));
      if (cid) conds.push(eq(s.salesOrders.customerId, cid));
    }
    const rows = await db.select().from(s.salesOrders).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.salesOrders.orderDate));
    const out = rows.map((r: any) => ({ ...r, id: r.publicId, _internalId: r.id, documentNo: r.documentNo, soNo: r.documentNo }));
    // map FKs to publicIds
    const custIds = [...new Set(out.map((o: any) => o.customerId).filter(Boolean))];
    const whIds = [...new Set(out.map((o: any) => o.warehouseId).filter(Boolean))];
    if (custIds.length) {
      const cs = await db.select({ id: s.customers.id, publicId: s.customers.publicId }).from(s.customers).where(inArray(s.customers.id, custIds as number[]));
      const map = new Map(cs.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.customerId = map.get(o.customerId) ?? o.customerId; });
    }
    if (whIds.length) {
      const whs = await db.select({ id: s.warehouses.id, publicId: s.warehouses.publicId }).from(s.warehouses).where(inArray(s.warehouses.id, whIds as number[]));
      const map = new Map(whs.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.warehouseId = map.get(o.warehouseId) ?? o.warehouseId; });
    }
    res.json(out);
  } catch (e) { next(e); }
});
supplyChainRouter.get("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "view"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = soWhere(pid);
    const [row] = await db.select().from(s.salesOrders).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    const lines = await soLines(db, row.id);
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, soNo: row.documentNo, lines: lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id })) });
  } catch (e) { next(e); }
});
putAndPatch("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = soWhere(pid);
    const [cur] = await db.select({ id: s.salesOrders.id, status: s.salesOrders.status }).from(s.salesOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya SO berstatus DRAFT yang dapat diubah." });
    const [oldRowFull] = await db.select().from(s.salesOrders).where(where).limit(1);
    let oldLines: any[] = [];
    try { if (Array.isArray((req.body as any)?.lines)) oldLines = await db.select().from(s.salesOrderLines).where(eq(s.salesOrderLines.salesOrderId, cur.id)); } catch {}
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.customerId !== undefined) patch.customerId = await resolveInternalId(s.customers, String(b.customerId));
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.orderDate !== undefined) patch.orderDate = b.orderDate;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    patch.updatedAt = new Date();
    await db.update(s.salesOrders).set(patch).where(eq(s.salesOrders.id, cur.id));
    let linesDiff: any = null;
    if (Array.isArray(b.lines)) {
      await db.transaction(async (tx) => { await replaceSoLines(tx, cur.id, b.lines); });
      try {
        const newLinesResolved = await Promise.all((b.lines as any[]).map(async (l: any) => {
          const itemId = l.itemId ? await resolveInternalId(s.items, String(l.itemId)) : l.itemId;
          const uomId = l.uomId ? await resolveInternalId(s.uom, String(l.uomId)) : l.uomId;
          return { ...l, itemId: itemId ?? l.itemId, uomId: uomId ?? l.uomId };
        }));
        linesDiff = diffLines(oldLines as any, newLinesResolved as any);
      } catch {}
    }
    try {
      const { internalId, role } = await getActorInfo(req);
      const changes = computeDiff(oldRowFull as any, patch as any, { denylist: DIFF_DENYLIST });
      const meta: Record<string, unknown> = { patchKeys: Object.keys(patch) };
      if (Object.keys(changes).length) meta.changes = changes;
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
      await logActivity({ documentType: "SO", documentId: cur.id, action: "update", fromStatus: cur.status, toStatus: cur.status, actorUserId: internalId, actorRole: role, metadata: meta });
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = soWhere(pid);
    const [cur] = await db.select({ id: s.salesOrders.id }).from(s.salesOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    await db.delete(s.salesOrders).where(eq(s.salesOrders.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/sales-orders/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = soWhere(pid);
    const [so] = await db.select().from(s.salesOrders).where(where).limit(1);
    if (!so) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    if (so.status === "CANCELED") return res.status(400).json({ error: "SO dibatalkan tidak dapat diposting." });
    if (so.status === "POSTED") return res.status(400).json({ error: "SO sudah diposting." });
    const lines = await soLines(db, so.id);
    const typeId = await getMovementTypeId("ISSUE");
    const details: DetailInput[] = lines.map((l: any) => ({ itemId: l.itemId, fromWarehouseId: so.warehouseId, toWarehouseId: null, qty: Number(l.qty), uomId: l.uomId, batchNumber: l.batchNumber ?? null }));
    const input: MovementInput = { typeId, movementDate: so.orderDate, status: "POSTED", referenceType: "SALES_ORDER", referenceId: String(so.id), description: `Sales Order ${so.documentNo}`, details };
    await db.transaction(async (tx) => { await insertMovementWithDetails(tx as any, input, String((req as any).user?.internalId ?? (req as any).user?.id ?? "system")); });
    await db.update(s.salesOrders).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.salesOrders.id, so.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "SO", documentId: so.id, action: "post", fromStatus: "DRAFT", toStatus: "POSTED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/sales-orders/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = soWhere(pid);
    const [cur] = await db.select({ id: s.salesOrders.id, status: s.salesOrders.status }).from(s.salesOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "SO sudah dibatalkan." });
    if (cur.status === "POSTED") {
      const [so] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, cur.id)).limit(1);
      const lines = await soLines(db, cur.id);
      const typeId = await getMovementTypeId("RECEIPT");
      const details: DetailInput[] = lines.map((l: any) => ({ itemId: l.itemId, fromWarehouseId: null, toWarehouseId: so.warehouseId, qty: Number(l.qty), uomId: l.uomId, batchNumber: l.batchNumber ?? null }));
      const input: MovementInput = { typeId, movementDate: so.orderDate, status: "POSTED", referenceType: "SALES_ORDER_CANCEL", referenceId: String(so.id), description: `Batal Sales Order ${so.documentNo}`, details };
      await db.transaction(async (tx) => { await insertMovementWithDetails(tx as any, input, String((req as any).user?.internalId ?? (req as any).user?.id ?? "system")); });
    }
    await db.update(s.salesOrders).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.salesOrders.id, cur.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "SO", documentId: cur.id, action: "cancel", fromStatus: cur.status, toStatus: "CANCELED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// GOODS RECEIPTS & DELIVERIES - simplified keep same pattern as original but with documentNo
// ---------------------------------------------------------------------------

async function grLines(tx: any, grId: number) { return tx.select().from(s.goodsReceiptLines).where(eq(s.goodsReceiptLines.goodsReceiptId, grId)); }
async function replaceGrLines(tx: any, grId: number, lines: any[]) {
  validateRequireUnitPrice(lines, "GR");
  await tx.delete(s.goodsReceiptLines).where(eq(s.goodsReceiptLines.goodsReceiptId, grId));
  for (const l of lines) {
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = await resolveInternalId(s.uom, l.uomId);
    if (!itemId || !uomId) throw new Error("Item/UOM tidak valid");
    await tx.insert(s.goodsReceiptLines).values({ goodsReceiptId: grId, itemId, uomId, qty: String(l.qty), unitPrice: l.unitPrice != null ? String(l.unitPrice) : null, batchNumber: l.batchNumber ?? null, note: l.note ?? null });
  }
}
supplyChainRouter.post("/goods-receipts", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.purchaseOrderId || !b.warehouseId || !b.receiptDate) return res.status(400).json({ error: "purchaseOrderId, warehouseId, receiptDate wajib." });
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "GR"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const poId = await resolveInternalId(s.purchaseOrders, String(b.purchaseOrderId));
    const warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (!poId || !warehouseId) return res.status(400).json({ error: "PO/warehouse tidak valid." });
    const [po] = await db.select({ supplierId: s.purchaseOrders.supplierId, branchId: s.purchaseOrders.branchId }).from(s.purchaseOrders).where(eq(s.purchaseOrders.id, poId)).limit(1);
    if (!po) return res.status(400).json({ error: "Purchase Order tidak ditemukan." });
    // Guard: jika ada receiving untuk PO ini yang belum COMPLETED/POSTED, tolak GNR
    const pendingReceivings = await db.select({ id: s.receivings.id, status: s.receivings.status }).from(s.receivings).where(eq(s.receivings.purchaseOrderId, poId));
    if (pendingReceivings.length > 0) {
      const hasCompleted = pendingReceivings.some((r) => r.status === "COMPLETED" || r.status === "POSTED");
      const hasPending = pendingReceivings.some((r) => r.status === "PENDING_QC" || r.status === "DRAFT");
      if (hasPending) return res.status(400).json({ error: "Receiving untuk PO ini masih Pending QC / Draft — selesaikan QC hingga COMPLETED dulu sebelum buat GNR." });
      if (!hasCompleted) return res.status(400).json({ error: "Receiving untuk PO ini belum COMPLETED — selesaikan QC dulu sebelum buat GNR." });
    }
    const seriesRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesRaw));
    const { documentNo, id: newId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "GR", { seriesId: seriesId ?? undefined, branchId: po.branchId ?? undefined, date: b.receiptDate ? new Date(b.receiptDate) : new Date() });
      const [gr] = await tx.insert(s.goodsReceipts).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, purchaseOrderId: poId, supplierId: po.supplierId, warehouseId, receiptDate: b.receiptDate, status: "DRAFT", notes: b.notes ?? null, createdBy: (await getActorInfo(req)).internalId ?? null, branchId: po.branchId }).returning();
      if (Array.isArray(b.lines)) await replaceGrLines(tx, gr.id, b.lines);
      return { documentNo: doc.documentNo, id: gr.id };
    });
    const [created] = await db.select({ publicId: s.goodsReceipts.publicId }).from(s.goodsReceipts).where(eq(s.goodsReceipts.documentNo, documentNo)).limit(1);
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "GR", documentId: newId, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo } });
    } catch {}
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});
supplyChainRouter.get("/goods-receipts", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.goodsReceipts.status as any, String(req.query.status)));
    if (req.query.warehouseId) {
      const wid = await resolveInternalId(s.warehouses, String(req.query.warehouseId));
      if (wid) conds.push(eq(s.goodsReceipts.warehouseId, wid));
    }
    if (req.query.purchaseOrderId) {
      const pid = await resolveInternalId(s.purchaseOrders, String(req.query.purchaseOrderId));
      if (pid) conds.push(eq(s.goodsReceipts.purchaseOrderId, pid));
    }
    const rows = await db.select().from(s.goodsReceipts).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.goodsReceipts.receiptDate));
    res.json(rows.map((r: any) => ({ ...r, id: r.publicId, _internalId: r.id, documentNo: r.documentNo, grNo: r.documentNo })));
  } catch (e) { next(e); }
});
supplyChainRouter.get("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "view"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = grWhere(pid);
    const [row] = await db.select().from(s.goodsReceipts).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    const lines = await grLines(db, row.id);
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, grNo: row.documentNo, lines: lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id })) });
  } catch (e) { next(e); }
});
putAndPatch("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = grWhere(pid);
    const [cur] = await db.select({ id: s.goodsReceipts.id, status: s.goodsReceipts.status }).from(s.goodsReceipts).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya GR berstatus DRAFT yang dapat diubah." });
    const [oldRowFull] = await db.select().from(s.goodsReceipts).where(where).limit(1);
    let oldLines: any[] = [];
    try { if (Array.isArray((req.body as any)?.lines)) oldLines = await db.select().from(s.goodsReceiptLines).where(eq(s.goodsReceiptLines.goodsReceiptId, cur.id)); } catch {}
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "GR"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.receiptDate !== undefined) patch.receiptDate = b.receiptDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.purchaseOrderId !== undefined) patch.purchaseOrderId = await resolveInternalId(s.purchaseOrders, String(b.purchaseOrderId));
    patch.updatedAt = new Date();
    await db.update(s.goodsReceipts).set(patch).where(eq(s.goodsReceipts.id, cur.id));
    let linesDiff: any = null;
    if (Array.isArray(b.lines)) {
      await db.transaction(async (tx) => { await replaceGrLines(tx, cur.id, b.lines); });
      try {
        const newLinesResolved = await Promise.all((b.lines as any[]).map(async (l: any) => {
          const itemId = l.itemId ? await resolveInternalId(s.items, String(l.itemId)) : l.itemId;
          const uomId = l.uomId ? await resolveInternalId(s.uom, String(l.uomId)) : l.uomId;
          return { ...l, itemId: itemId ?? l.itemId, uomId: uomId ?? l.uomId };
        }));
        linesDiff = diffLines(oldLines as any, newLinesResolved as any);
      } catch {}
    }
    try {
      const { internalId, role } = await getActorInfo(req);
      const changes = computeDiff(oldRowFull as any, patch as any, { denylist: DIFF_DENYLIST });
      const meta: Record<string, unknown> = { patchKeys: Object.keys(patch) };
      if (Object.keys(changes).length) meta.changes = changes;
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
      await logActivity({ documentType: "GR", documentId: cur.id, action: "update", fromStatus: cur.status, toStatus: cur.status, actorUserId: internalId, actorRole: role, metadata: meta });
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = grWhere(pid);
    const [cur] = await db.select({ id: s.goodsReceipts.id }).from(s.goodsReceipts).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    await db.delete(s.goodsReceipts).where(eq(s.goodsReceipts.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/goods-receipts/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = grWhere(pid);
    const [gr] = await db.select().from(s.goodsReceipts).where(where).limit(1);
    if (!gr) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (gr.status === "CANCELED") return res.status(400).json({ error: "GR dibatalkan tidak dapat diposting." });
    if (gr.status === "POSTED") return res.status(400).json({ error: "GR sudah diposting." });
    // Guard: receiving untuk PO ini harus COMPLETED/POSTED dulu
    if (gr.purchaseOrderId) {
      const recs = await db.select({ status: s.receivings.status }).from(s.receivings).where(eq(s.receivings.purchaseOrderId, gr.purchaseOrderId));
      if (recs.length > 0) {
        const hasPending = recs.some((r) => r.status === "PENDING_QC" || r.status === "DRAFT");
        const hasCompleted = recs.some((r) => r.status === "COMPLETED" || r.status === "POSTED");
        if (hasPending || !hasCompleted) return res.status(400).json({ error: "QC Receiving belum COMPLETED — selesaikan QC dulu sebelum posting GNR (stock masuk gudang)." });
      }
    }
    const lines = await grLines(db, gr.id);
    validateRequireUnitPrice(lines, "GR");
    const typeId = await getMovementTypeId("RECEIPT");
    const details: DetailInput[] = lines.map((l: any) => ({ itemId: l.itemId, fromWarehouseId: null, toWarehouseId: gr.warehouseId, qty: Number(l.qty), uomId: l.uomId, batchNumber: l.batchNumber ?? null, incomingRate: l.unitPrice != null ? Number(l.unitPrice) : null }));
    const input: MovementInput = { typeId, movementDate: gr.receiptDate, status: "POSTED", referenceType: "GOODS_RECEIPT", referenceId: String(gr.id), description: `Penerimaan ${gr.documentNo}`, details };
    await db.transaction(async (tx) => { await insertMovementWithDetails(tx as any, input, String((req as any).user?.internalId ?? (req as any).user?.id ?? "system")); });
    await db.update(s.goodsReceipts).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.goodsReceipts.id, gr.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "GR", documentId: gr.id, action: "post", fromStatus: "DRAFT", toStatus: "POSTED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/goods-receipts/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = grWhere(pid);
    const [cur] = await db.select({ id: s.goodsReceipts.id, status: s.goodsReceipts.status }).from(s.goodsReceipts).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "GR sudah dibatalkan." });
    if (cur.status === "POSTED") {
      const [gr] = await db.select().from(s.goodsReceipts).where(eq(s.goodsReceipts.id, cur.id)).limit(1);
      const lines = await grLines(db, cur.id);
      const typeId = await getMovementTypeId("ISSUE");
      const details: DetailInput[] = lines.map((l: any) => ({ itemId: l.itemId, fromWarehouseId: gr.warehouseId, toWarehouseId: null, qty: Number(l.qty), uomId: l.uomId, batchNumber: l.batchNumber ?? null }));
      const input: MovementInput = { typeId, movementDate: gr.receiptDate, status: "POSTED", referenceType: "GOODS_RECEIPT_CANCEL", referenceId: String(gr.id), description: `Batal Penerimaan ${gr.documentNo}`, details };
      await db.transaction(async (tx) => { await insertMovementWithDetails(tx as any, input, String((req as any).user?.internalId ?? (req as any).user?.id ?? "system")); });
    }
    await db.update(s.goodsReceipts).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.goodsReceipts.id, cur.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "GR", documentId: cur.id, action: "cancel", fromStatus: cur.status, toStatus: "CANCELED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// RECEIVINGS — tahap awal inbound (Receiving → QC → GRN → stok).
// BUKAN Goods Receipt: tidak menggerakkan stok. Post/cancel hanya ubah status.
// ---------------------------------------------------------------------------

async function receivingLines(tx: any, receivingId: number) { return tx.select().from(s.receivingLines).where(eq(s.receivingLines.receivingId, receivingId)); }
async function replaceReceivingLines(tx: any, receivingId: number, lines: any[]) {
  validateRequireUnitPrice(lines, "RCV");
  await tx.delete(s.receivingLines).where(eq(s.receivingLines.receivingId, receivingId));
  for (const l of lines) {
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = await resolveInternalId(s.uom, l.uomId);
    if (!itemId || !uomId) throw new Error("Item/UOM tidak valid");
    await tx.insert(s.receivingLines).values({ receivingId, itemId, uomId, qty: String(l.qty), qtyAccepted: l.qtyAccepted != null ? String(l.qtyAccepted) : null, qtyRejected: l.qtyRejected != null ? String(l.qtyRejected) : null, unitPrice: l.unitPrice != null ? String(l.unitPrice) : null, batchNumber: l.batchNumber ?? null, note: l.note ?? null, rejectReason: l.rejectReason ?? null });
  }
}
async function mapReceivingLines(lines: any[]) {
  const itemIds = [...new Set(lines.map((l: any) => l.itemId))];
  const uomIds = [...new Set(lines.map((l: any) => l.uomId).filter(Boolean))];
  const itemMap = new Map<number, string>();
  const uomMap = new Map<number, string>();
  if (itemIds.length) {
    const items = await db.select({ id: s.items.id, publicId: s.items.publicId }).from(s.items).where(inArray(s.items.id, itemIds));
    items.forEach((it) => itemMap.set(it.id, it.publicId));
  }
  if (uomIds.length) {
    const uoms = await db.select({ id: s.uom.id, publicId: s.uom.publicId }).from(s.uom).where(inArray(s.uom.id, uomIds as number[]));
    uoms.forEach((u) => uomMap.set(u.id, u.publicId));
  }
  return lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id, receivingId: undefined, itemId: itemMap.get(l.itemId) ?? l.itemId, uomId: l.uomId ? (uomMap.get(l.uomId) ?? l.uomId) : null, qtyAccepted: l.qtyAccepted != null ? String(l.qtyAccepted) : null, qtyRejected: l.qtyRejected != null ? String(l.qtyRejected) : null, rejectReason: l.rejectReason ?? null }));
}
supplyChainRouter.post("/receivings", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.purchaseOrderId || !b.warehouseId || !b.receiptDate) return res.status(400).json({ error: "purchaseOrderId, warehouseId, receiptDate wajib." });
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "RCV"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const poId = await resolveInternalId(s.purchaseOrders, String(b.purchaseOrderId));
    const warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (!poId || !warehouseId) return res.status(400).json({ error: "PO/warehouse tidak valid." });
    const [po] = await db.select({ supplierId: s.purchaseOrders.supplierId, branchId: s.purchaseOrders.branchId }).from(s.purchaseOrders).where(eq(s.purchaseOrders.id, poId)).limit(1);
    if (!po) return res.status(400).json({ error: "Purchase Order tidak ditemukan." });
    const seriesRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesRaw));
    const { documentNo, id: newId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "RCV", { seriesId: seriesId ?? undefined, branchId: po.branchId ?? undefined, date: b.receiptDate ? new Date(b.receiptDate) : new Date() });
      const [rcv] = await tx.insert(s.receivings).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, purchaseOrderId: poId, supplierId: po.supplierId, warehouseId, receiptDate: b.receiptDate, status: "DRAFT", notes: b.notes ?? null, createdBy: (await getActorInfo(req)).internalId ?? null, branchId: po.branchId }).returning();
      if (Array.isArray(b.lines)) await replaceReceivingLines(tx, rcv.id, b.lines);
      return { documentNo: doc.documentNo, id: rcv.id };
    });
    const [created] = await db.select({ publicId: s.receivings.publicId }).from(s.receivings).where(eq(s.receivings.documentNo, documentNo)).limit(1);
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "RCV", documentId: newId, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo } });
    } catch {}
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});
supplyChainRouter.get("/receivings", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.receivings.status as any, String(req.query.status)));
    if (req.query.warehouseId) {
      const wid = await resolveInternalId(s.warehouses, String(req.query.warehouseId));
      if (wid) conds.push(eq(s.receivings.warehouseId, wid));
    }
    if (req.query.purchaseOrderId) {
      const pid = await resolveInternalId(s.purchaseOrders, String(req.query.purchaseOrderId));
      if (pid) conds.push(eq(s.receivings.purchaseOrderId, pid));
    }
    const rows = await db.select().from(s.receivings).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.receivings.receiptDate));
    // map FK internal ids to publicIds for frontend convenience
    const purchaseOrderIds = [...new Set(rows.map((r: any) => r.purchaseOrderId).filter(Boolean))];
    const supplierIds = [...new Set(rows.map((r: any) => r.supplierId).filter(Boolean))];
    const warehouseIds = [...new Set(rows.map((r: any) => r.warehouseId).filter(Boolean))];
    const poMap = new Map<number, string>();
    const supMap = new Map<number, string>();
    const whMap = new Map<number, string>();
    if (purchaseOrderIds.length) {
      const pos = await db.select({ id: s.purchaseOrders.id, publicId: s.purchaseOrders.publicId }).from(s.purchaseOrders).where(inArray(s.purchaseOrders.id, purchaseOrderIds as number[]));
      pos.forEach((x) => poMap.set(x.id, x.publicId));
    }
    if (supplierIds.length) {
      const sups = await db.select({ id: s.suppliers.id, publicId: s.suppliers.publicId }).from(s.suppliers).where(inArray(s.suppliers.id, supplierIds as number[]));
      sups.forEach((x) => supMap.set(x.id, x.publicId));
    }
    if (warehouseIds.length) {
      const whs = await db.select({ id: s.warehouses.id, publicId: s.warehouses.publicId }).from(s.warehouses).where(inArray(s.warehouses.id, warehouseIds as number[]));
      whs.forEach((x) => whMap.set(x.id, x.publicId));
    }
    // aggregate qtyReceived / qtyRejected for Return progress (qtyRejected / qtyReceived)
    const receivingInternalIds = rows.map((r: any) => r.id);
    const sumMap = new Map<number, { totalQty: number; totalRejected: number }>();
    if (receivingInternalIds.length) {
      const sums = await db.select({
        receivingId: s.receivingLines.receivingId,
        totalQty: sql<string>`COALESCE(SUM(${s.receivingLines.qty}::numeric),0)`,
        totalRejected: sql<string>`COALESCE(SUM(COALESCE(${s.receivingLines.qtyRejected}::numeric,0)),0)`,
      }).from(s.receivingLines).where(inArray(s.receivingLines.receivingId, receivingInternalIds as number[])).groupBy(s.receivingLines.receivingId);
      sums.forEach((x: any) => sumMap.set(x.receivingId, { totalQty: Number(x.totalQty), totalRejected: Number(x.totalRejected) }));
    }
    const out = rows.map((r: any) => {
      const agg = sumMap.get(r.id) ?? { totalQty: 0, totalRejected: 0 };
      const pct = agg.totalQty > 0 ? Math.round((agg.totalRejected / agg.totalQty) * 100) : 0;
      return {
        ...r,
        id: r.publicId,
        _internalId: r.id,
        documentNo: r.documentNo,
        rcvNo: r.documentNo,
        purchaseOrderId: poMap.get(r.purchaseOrderId) ?? r.purchaseOrderId,
        supplierId: supMap.get(r.supplierId) ?? r.supplierId,
        warehouseId: whMap.get(r.warehouseId) ?? r.warehouseId,
        totalQty: agg.totalQty,
        totalRejected: agg.totalRejected,
        returnPct: pct,
      };
    });
    res.json(out);
  } catch (e) { next(e); }
});
supplyChainRouter.get("/receivings/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "view"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = receivingWhere(pid);
    const [row] = await db.select().from(s.receivings).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    const lines = await receivingLines(db, row.id);
    // map FKs to publicId
    let purchaseOrderPublic: string | number = row.purchaseOrderId;
    let supplierPublic: string | number | null = row.supplierId;
    let warehousePublic: string | number = row.warehouseId;
    if (row.purchaseOrderId) {
      const [po] = await db.select({ publicId: s.purchaseOrders.publicId }).from(s.purchaseOrders).where(eq(s.purchaseOrders.id, row.purchaseOrderId)).limit(1);
      if (po) purchaseOrderPublic = po.publicId;
    }
    if (row.supplierId) {
      const [sup] = await db.select({ publicId: s.suppliers.publicId }).from(s.suppliers).where(eq(s.suppliers.id, row.supplierId)).limit(1);
      if (sup) supplierPublic = sup.publicId;
    }
    if (row.warehouseId) {
      const [wh] = await db.select({ publicId: s.warehouses.publicId }).from(s.warehouses).where(eq(s.warehouses.id, row.warehouseId)).limit(1);
      if (wh) warehousePublic = wh.publicId;
    }
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, rcvNo: row.documentNo, purchaseOrderId: purchaseOrderPublic, supplierId: supplierPublic, warehouseId: warehousePublic, lines: await mapReceivingLines(lines) });
  } catch (e) { next(e); }
});
putAndPatch("/receivings/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = receivingWhere(pid);
    const [cur] = await db.select({ id: s.receivings.id, status: s.receivings.status }).from(s.receivings).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya receiving berstatus DRAFT yang dapat diubah." });
    const [oldRowFull] = await db.select().from(s.receivings).where(where).limit(1);
    let oldLines: any[] = [];
    try { if (Array.isArray((req.body as any)?.lines)) oldLines = await db.select().from(s.receivingLines).where(eq(s.receivingLines.receivingId, cur.id)); } catch {}
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "RCV"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.receiptDate !== undefined) patch.receiptDate = b.receiptDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.purchaseOrderId !== undefined) patch.purchaseOrderId = await resolveInternalId(s.purchaseOrders, String(b.purchaseOrderId));
    patch.updatedAt = new Date();
    await db.update(s.receivings).set(patch).where(eq(s.receivings.id, cur.id));
    let linesDiff: any = null;
    if (Array.isArray(b.lines)) {
      await db.transaction(async (tx) => { await replaceReceivingLines(tx, cur.id, b.lines); });
      try {
        const newLinesResolved = await Promise.all((b.lines as any[]).map(async (l: any) => {
          const itemId = l.itemId ? await resolveInternalId(s.items, String(l.itemId)) : l.itemId;
          const uomId = l.uomId ? await resolveInternalId(s.uom, String(l.uomId)) : l.uomId;
          return { ...l, itemId: itemId ?? l.itemId, uomId: uomId ?? l.uomId };
        }));
        linesDiff = diffLines(oldLines as any, newLinesResolved as any);
      } catch {}
    }
    try {
      const { internalId, role } = await getActorInfo(req);
      const changes = computeDiff(oldRowFull as any, patch as any, { denylist: DIFF_DENYLIST });
      const meta: Record<string, unknown> = { patchKeys: Object.keys(patch) };
      if (Object.keys(changes).length) meta.changes = changes;
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
      await logActivity({ documentType: "RCV", documentId: cur.id, action: "update", fromStatus: cur.status, toStatus: cur.status, actorUserId: internalId, actorRole: role, metadata: meta });
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/receivings/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = receivingWhere(pid);
    const [cur] = await db.select({ id: s.receivings.id }).from(s.receivings).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    await db.delete(s.receivings).where(eq(s.receivings.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/receivings/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = receivingWhere(pid);
    const [rcv] = await db.select().from(s.receivings).where(where).limit(1);
    if (!rcv) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    if (rcv.status === "CANCELED") return res.status(400).json({ error: "Receiving dibatalkan tidak dapat diposting." });
    if (rcv.status === "POSTED" || rcv.status === "COMPLETED") return res.status(400).json({ error: "Receiving sudah selesai/posted." });
    if (rcv.status === "PENDING_QC") {
      // Legacy post from PENDING_QC → COMPLETED (tanpa QC detail, accepted = received)
      const lines = await receivingLines(db, rcv.id);
      await db.transaction(async (tx) => {
        for (const l of lines) {
          await tx.update(s.receivingLines).set({ qtyAccepted: l.qty, qtyRejected: "0" }).where(eq(s.receivingLines.id, l.id));
        }
        await tx.update(s.receivings).set({ status: "COMPLETED", qcInspectedAt: new Date(), qcInspectedBy: (req as any).user?.internalId ?? null, updatedAt: new Date() }).where(eq(s.receivings.id, rcv.id));
      });
      try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: rcv.id, action: "post", fromStatus: "PENDING_QC", toStatus: "COMPLETED", actorUserId: internalId, actorRole: role }); } catch {}
      return res.json({ ok: true });
    }
    // DRAFT → PENDING_QC atau langsung COMPLETED jika PO tidak butuh QC
    let qcRequired = true;
    if (rcv.purchaseOrderId) {
      const [po] = await db.select({ qcRequired: s.purchaseOrders.qcRequired }).from(s.purchaseOrders).where(eq(s.purchaseOrders.id, rcv.purchaseOrderId)).limit(1);
      if (po) qcRequired = (po as any).qcRequired ?? true;
    }
    if (!qcRequired) {
      const lines = await receivingLines(db, rcv.id);
      await db.transaction(async (tx) => {
        for (const l of lines) {
          await tx.update(s.receivingLines).set({ qtyAccepted: l.qty, qtyRejected: "0", rejectReason: null }).where(eq(s.receivingLines.id, l.id));
        }
        await tx.update(s.receivings).set({ status: "COMPLETED", qcInspectedAt: new Date(), qcInspectedBy: (req as any).user?.internalId ?? null, submittedAt: new Date(), submittedBy: (req as any).user?.internalId ?? null, updatedAt: new Date() }).where(eq(s.receivings.id, rcv.id));
      });
      try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: rcv.id, action: "post", fromStatus: "DRAFT", toStatus: "COMPLETED", actorUserId: internalId, actorRole: role, metadata: { qcSkipped: true } }); } catch {}
      return res.json({ ok: true, qcSkipped: true });
    }
    await db.update(s.receivings).set({ status: "PENDING_QC", submittedAt: new Date(), submittedBy: (req as any).user?.internalId ?? null, updatedAt: new Date() }).where(eq(s.receivings.id, rcv.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: rcv.id, action: "post", fromStatus: "DRAFT", toStatus: "PENDING_QC", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/receivings/:id/submit", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = receivingWhere(pid);
    const [rcv] = await db.select().from(s.receivings).where(where).limit(1);
    if (!rcv) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    if (rcv.status !== "DRAFT") return res.status(400).json({ error: `Hanya DRAFT yang bisa di-submit. Status sekarang: ${rcv.status}` });
    const lines = await receivingLines(db, rcv.id);
    if (!lines.length) return res.status(400).json({ error: "Receiving tanpa item tidak bisa di-submit." });
    for (const l of lines) {
      if (Number(l.qty) <= 0) return res.status(400).json({ error: "Qty Received harus > 0." });
    }
    // Jika PO tidak butuh QC → langsung COMPLETED tanpa PENDING_QC
    let qcRequired = true;
    if (rcv.purchaseOrderId) {
      const [po] = await db.select({ qcRequired: s.purchaseOrders.qcRequired }).from(s.purchaseOrders).where(eq(s.purchaseOrders.id, rcv.purchaseOrderId)).limit(1);
      if (po) qcRequired = (po as any).qcRequired ?? true;
    }
    if (!qcRequired) {
      await db.transaction(async (tx) => {
        for (const l of lines) {
          await tx.update(s.receivingLines).set({ qtyAccepted: l.qty, qtyRejected: "0", rejectReason: null }).where(eq(s.receivingLines.id, l.id));
        }
        await tx.update(s.receivings).set({ status: "COMPLETED", qcInspectedAt: new Date(), qcInspectedBy: (req as any).user?.internalId ?? null, submittedAt: new Date(), submittedBy: (req as any).user?.internalId ?? null, updatedAt: new Date() }).where(eq(s.receivings.id, rcv.id));
      });
      try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: rcv.id, action: "submit", fromStatus: "DRAFT", toStatus: "COMPLETED", actorUserId: internalId, actorRole: role, metadata: { qcSkipped: true } }); } catch {}
      return res.json({ ok: true, qcSkipped: true });
    }
    await db.update(s.receivings).set({ status: "PENDING_QC", submittedAt: new Date(), submittedBy: (req as any).user?.internalId ?? null, updatedAt: new Date() }).where(eq(s.receivings.id, rcv.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: rcv.id, action: "submit", fromStatus: "DRAFT", toStatus: "PENDING_QC", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/receivings/:id/qc", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = receivingWhere(pid);
    const [rcv] = await db.select().from(s.receivings).where(where).limit(1);
    if (!rcv) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    if (rcv.status !== "PENDING_QC") return res.status(400).json({ error: `Hanya PENDING_QC yang bisa di-QC. Status sekarang: ${rcv.status}` });
    const body = req.body ?? {};
    const qcLines: Array<{ id?: string; receivingLineId?: string; lineId?: string; qtyRejected?: number | string; rejectReason?: string | null }> = body.lines ?? body.qcLines ?? [];
    const qcNotes: string | null = body.qcNotes ?? body.notes ?? null;
    const lines = await receivingLines(db, rcv.id);
    // Map by publicId or internal id
    const lineByPublic = new Map<string, any>();
    const lineById = new Map<number, any>();
    for (const l of lines) {
      lineByPublic.set(l.publicId, l);
      lineById.set(l.id, l);
    }
    // If body provides reject per line, update; else assume 0 reject (all accepted)
    await db.transaction(async (tx) => {
      for (const l of lines) {
        const match = qcLines.find((q: any) => {
          const qid = q.id ?? q.receivingLineId ?? q.lineId ?? q.publicId;
          return qid && (qid === l.publicId || qid === String(l.id));
        });
        // If no explicit entry, treat as 0 reject (fully accepted)
        // If qcLines empty but body has single reject? fallback: use first entry if only one line
        let qtyRejected = 0;
        let rejectReason: string | null = null;
        if (match) {
          qtyRejected = Number(match.qtyRejected ?? match.qtyReject ?? 0);
          rejectReason = match.rejectReason ?? match.reason ?? null;
        } else if (qcLines.length === 0) {
          qtyRejected = 0;
        } else if (qcLines.length === lines.length) {
          // order-based fallback: index mapping
          const idx = lines.indexOf(l);
          const q = qcLines[idx];
          if (q) {
            qtyRejected = Number(q.qtyRejected ?? q.qtyReject ?? 0);
            rejectReason = q.rejectReason ?? q.reason ?? null;
          }
        }
        if (!Number.isFinite(qtyRejected) || qtyRejected < 0) throw new Error(`Qty Reject tidak valid untuk line ${l.publicId}`);
        const qtyReceived = Number(l.qty);
        if (qtyRejected > qtyReceived) throw new Error(`Qty Reject (${qtyRejected}) melebihi Qty Received (${qtyReceived}) untuk line ${l.publicId}`);
        const qtyAccepted = qtyReceived - qtyRejected;
        await tx.update(s.receivingLines).set({ qtyAccepted: String(qtyAccepted), qtyRejected: String(qtyRejected), rejectReason: rejectReason || null }).where(eq(s.receivingLines.id, l.id));
      }
      await tx.update(s.receivings).set({ status: "COMPLETED", qcInspectedAt: new Date(), qcInspectedBy: (req as any).user?.internalId ?? null, qcNotes: qcNotes || null, updatedAt: new Date() }).where(eq(s.receivings.id, rcv.id));
    });
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: rcv.id, action: "post", fromStatus: "PENDING_QC", toStatus: "COMPLETED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/receivings/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.receivings", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = receivingWhere(pid);
    const [cur] = await db.select({ id: s.receivings.id, status: s.receivings.status }).from(s.receivings).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "Receiving sudah dibatalkan." });
    if (cur.status === "COMPLETED" || cur.status === "POSTED") return res.status(400).json({ error: "Receiving COMPLETED tidak bisa dibatalkan." });
    await db.update(s.receivings).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.receivings.id, cur.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: cur.id, action: "cancel", fromStatus: cur.status, toStatus: "CANCELED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// QC INSPECTIONS — dokumen terpisah dengan nomor QC-..., history di menu QC
// Flow: Receiving(PENDING_QC) → QC Inspection (DRAFT→COMPLETED) → Receiving(COMPLETED) → GNR
// ---------------------------------------------------------------------------
function qcWhere(pid: string) {
  if (isUuid(pid)) return eq(s.qcInspections.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.qcInspections.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.qcInspections.id, Number(pid));
  return eq(s.qcInspections.documentNo, pid);
}
async function qcInspectionLines(tx: any, qcId: number) {
  return tx.select().from(s.qcInspectionLines).where(eq(s.qcInspectionLines.qcInspectionId, qcId));
}
async function replaceQcLines(tx: any, qcId: number, lines: any[]) {
  // delete child params first via cascade, but also clear via delete lines
  await tx.delete(s.qcInspectionLines).where(eq(s.qcInspectionLines.qcInspectionId, qcId));
  for (const l of lines) {
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = l.uomId ? await resolveInternalId(s.uom, l.uomId) : null;
    if (!itemId) throw new Error("Item tidak valid");
    let qtyReceived = Number(l.qtyReceived ?? l.qty ?? 0);
    // if params provided, sum rejected from params
    let qtyRejected: number;
    let params = l.params ?? l.parameters ?? null;
    if (Array.isArray(params) && params.length > 0) {
      qtyRejected = params.reduce((sum: number, p: any) => sum + Number(p.qty ?? 0), 0);
    } else {
      qtyRejected = Number(l.qtyRejected ?? 0);
    }
    const qtyAccepted = qtyReceived - qtyRejected;
    if (qtyRejected < 0 || qtyRejected > qtyReceived) throw new Error("Qty reject tidak valid");
    const [inserted] = await tx.insert(s.qcInspectionLines).values({
      qcInspectionId: qcId,
      receivingLineId: l.receivingLineId ? await resolveInternalId(s.receivingLines, String(l.receivingLineId)) : null,
      itemId,
      uomId,
      qtyReceived: String(qtyReceived),
      qtyRejected: String(qtyRejected),
      qtyAccepted: String(qtyAccepted),
      batchNumber: l.batchNumber ?? null,
      rejectReason: l.rejectReason ?? (Array.isArray(params) ? params.map((p: any) => `${p.parameterCode ?? p.parameterId ?? ""}: ${p.qty}`).join(", ") : null),
    }).returning();
    // insert params breakdown if any
    if (Array.isArray(params) && params.length > 0) {
      for (const p of params) {
        const paramId = await resolveInternalId(s.qcParameters, String(p.parameterId ?? p.parameterCode ?? ""));
        // also try by code if not uuid
        let pid = paramId;
        if (!pid && p.parameterCode) {
          const [byCode] = await tx.select({ id: s.qcParameters.id }).from(s.qcParameters).where(eq(s.qcParameters.code, String(p.parameterCode))).limit(1);
          pid = byCode?.id ?? null;
        }
        if (!pid) {
          // try by name
          if (p.parameterName) {
            const [byName] = await tx.select({ id: s.qcParameters.id }).from(s.qcParameters).where(eq(s.qcParameters.name, String(p.parameterName))).limit(1);
            pid = byName?.id ?? null;
          }
        }
        if (!pid) throw new Error(`Parameter QC tidak valid: ${p.parameterId ?? p.parameterCode ?? ""}`);
        await tx.insert(s.qcInspectionLineParams).values({
          qcInspectionLineId: inserted.id,
          parameterId: pid,
          qty: String(p.qty ?? 0),
          note: p.note ?? null,
        });
      }
    }
  }
}
async function mapQcLines(lines: any[]) {
  const itemIds = [...new Set(lines.map((l: any) => l.itemId))];
  const itemMap = new Map<number, string>();
  if (itemIds.length) {
    const items = await db.select({ id: s.items.id, publicId: s.items.publicId }).from(s.items).where(inArray(s.items.id, itemIds));
    items.forEach((it) => itemMap.set(it.id, it.publicId));
  }
  const uomIds = [...new Set(lines.map((l: any) => l.uomId).filter(Boolean))];
  const uomMap = new Map<number, string>();
  if (uomIds.length) {
    const uoms = await db.select({ id: s.uom.id, publicId: s.uom.publicId }).from(s.uom).where(inArray(s.uom.id, uomIds as number[]));
    uoms.forEach((u) => uomMap.set(u.id, u.publicId));
  }
  // fetch params for these lines
  const lineIds = lines.map((l: any) => l.id);
  let paramsByLine = new Map<number, any[]>();
  if (lineIds.length) {
    const params = await db.select().from(s.qcInspectionLineParams).where(inArray(s.qcInspectionLineParams.qcInspectionLineId, lineIds));
    // map parameterId to publicId/code/name
    const paramIds = [...new Set(params.map((p: any) => p.parameterId))];
    const paramMap = new Map<number, any>();
    if (paramIds.length) {
      const paramRows = await db.select().from(s.qcParameters).where(inArray(s.qcParameters.id, paramIds));
      paramRows.forEach((pr: any) => paramMap.set(pr.id, pr));
    }
    for (const p of params) {
      const pr = paramMap.get(p.parameterId);
      const arr = paramsByLine.get(p.qcInspectionLineId) ?? [];
      arr.push({ id: p.publicId, _internalId: p.id, parameterId: pr?.publicId ?? p.parameterId, parameterCode: pr?.code ?? null, parameterName: pr?.name ?? null, qty: p.qty, note: p.note });
      paramsByLine.set(p.qcInspectionLineId, arr);
    }
  }
  return lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id, qcInspectionId: undefined, itemId: itemMap.get(l.itemId) ?? l.itemId, uomId: l.uomId ? (uomMap.get(l.uomId) ?? l.uomId) : null, params: paramsByLine.get(l.id) ?? [] }));
}

supplyChainRouter.post("/qc-inspections", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.receivingId) return res.status(400).json({ error: "receivingId wajib." });
    if (!b.inspectionDate) return res.status(400).json({ error: "inspectionDate wajib." });
    let receivingId: number | null = await resolveInternalId(s.receivings, String(b.receivingId));
    if (!receivingId) {
      const [byDoc] = await db.select({ id: s.receivings.id }).from(s.receivings).where(eq(s.receivings.documentNo, String(b.receivingId))).limit(1);
      receivingId = byDoc?.id ?? null;
    }
    if (!receivingId) return res.status(400).json({ error: "Receiving tidak valid." });
    const [rcv] = await db.select().from(s.receivings).where(eq(s.receivings.id, receivingId)).limit(1);
    if (!rcv) return res.status(404).json({ error: "Receiving tidak ditemukan." });
    if (rcv.status !== "PENDING_QC") return res.status(400).json({ error: `Hanya Receiving PENDING_QC yang bisa di-QC. Status sekarang: ${rcv.status}` });
    // cegah double QC draft untuk receiving yang sama
    const existing = await db.select({ id: s.qcInspections.id }).from(s.qcInspections).where(and(eq(s.qcInspections.receivingId, receivingId), eq(s.qcInspections.status as any, "DRAFT"))).limit(1);
    if (existing.length) return res.status(400).json({ error: "Sudah ada QC Inspection DRAFT untuk Receiving ini." });
    const warehouseId = rcv.warehouseId;
    const supplierId = rcv.supplierId;
    const purchaseOrderId = rcv.purchaseOrderId;
    const branchId = rcv.branchId;
    const seriesRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesRaw));
    const { documentNo, id: newId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "QC", { seriesId: seriesId ?? undefined, branchId: branchId ?? undefined, date: b.inspectionDate ? new Date(b.inspectionDate) : new Date() });
      const [qc] = await tx.insert(s.qcInspections).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, receivingId, purchaseOrderId, supplierId, warehouseId, inspectionDate: b.inspectionDate, status: "DRAFT", notes: b.notes ?? null, qcNotes: b.qcNotes ?? null, createdBy: (await getActorInfo(req)).internalId ?? null, branchId }).returning();
      // lines: jika tidak dikirim, auto dari receivingLines dengan qtyRejected=0
      let lines = b.lines;
      if (!Array.isArray(lines) || lines.length === 0) {
        const rcvLines = await qcInspectionLines(tx as any, qc.id); // empty now, fetch from receiving
        const rLines = await tx.select().from(s.receivingLines).where(eq(s.receivingLines.receivingId, receivingId));
        lines = rLines.map((rl: any) => ({ itemId: rl.itemId, uomId: rl.uomId, qtyReceived: rl.qty, qtyRejected: "0", batchNumber: rl.batchNumber, receivingLineId: rl.id }));
        // need to map itemId/uomId from internal to public for replaceQcLines? replaceQcLines expects publicId and will resolveInternalId again, so we pass publicId via map
        // Convert internal ids to public ids for replaceQcLines
        const mapped = await Promise.all(lines.map(async (l: any) => {
          const [it] = await tx.select({ publicId: s.items.publicId }).from(s.items).where(eq(s.items.id, l.itemId)).limit(1);
          let uomPublic = null;
          if (l.uomId) {
            const [u] = await tx.select({ publicId: s.uom.publicId }).from(s.uom).where(eq(s.uom.id, l.uomId)).limit(1);
            uomPublic = u?.publicId ?? l.uomId;
          }
          const [rl] = await tx.select({ publicId: s.receivingLines.publicId }).from(s.receivingLines).where(eq(s.receivingLines.id, l.receivingLineId ?? l.id)).limit(1);
          return { ...l, itemId: it?.publicId ?? l.itemId, uomId: uomPublic, receivingLineId: rl?.publicId ?? l.receivingLineId };
        }));
        lines = mapped;
      }
      if (Array.isArray(lines) && lines.length) await replaceQcLines(tx, qc.id, lines);
      return { documentNo: doc.documentNo, id: qc.id };
    });
    const [created] = await db.select({ publicId: s.qcInspections.publicId }).from(s.qcInspections).where(eq(s.qcInspections.documentNo, documentNo)).limit(1);
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "QC", documentId: newId, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo } });
    } catch {}
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});

supplyChainRouter.get("/qc-inspections", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.qcInspections.status as any, String(req.query.status)));
    if (req.query.receivingId) {
      const rid = await resolveInternalId(s.receivings, String(req.query.receivingId));
      if (rid) conds.push(eq(s.qcInspections.receivingId, rid));
    }
    const rows = await db.select().from(s.qcInspections).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.qcInspections.inspectionDate));
    // map FKs to publicId
    const receivingIds = [...new Set(rows.map((r: any) => r.receivingId).filter(Boolean))];
    const poIds = [...new Set(rows.map((r: any) => r.purchaseOrderId).filter(Boolean))];
    const supIds = [...new Set(rows.map((r: any) => r.supplierId).filter(Boolean))];
    const whIds = [...new Set(rows.map((r: any) => r.warehouseId).filter(Boolean))];
    const rcvMap = new Map<number, string>();
    const poMap = new Map<number, string>();
    const supMap = new Map<number, string>();
    const whMap = new Map<number, string>();
    if (receivingIds.length) {
      const rcvs = await db.select({ id: s.receivings.id, publicId: s.receivings.publicId }).from(s.receivings).where(inArray(s.receivings.id, receivingIds as number[]));
      rcvs.forEach((x) => rcvMap.set(x.id, x.publicId));
    }
    if (poIds.length) {
      const pos = await db.select({ id: s.purchaseOrders.id, publicId: s.purchaseOrders.publicId }).from(s.purchaseOrders).where(inArray(s.purchaseOrders.id, poIds as number[]));
      pos.forEach((x) => poMap.set(x.id, x.publicId));
    }
    if (supIds.length) {
      const sups = await db.select({ id: s.suppliers.id, publicId: s.suppliers.publicId }).from(s.suppliers).where(inArray(s.suppliers.id, supIds as number[]));
      sups.forEach((x) => supMap.set(x.id, x.publicId));
    }
    if (whIds.length) {
      const whs = await db.select({ id: s.warehouses.id, publicId: s.warehouses.publicId }).from(s.warehouses).where(inArray(s.warehouses.id, whIds as number[]));
      whs.forEach((x) => whMap.set(x.id, x.publicId));
    }
    const out = rows.map((r: any) => ({
      ...r,
      id: r.publicId,
      _internalId: r.id,
      documentNo: r.documentNo,
      receivingId: rcvMap.get(r.receivingId) ?? r.receivingId,
      purchaseOrderId: r.purchaseOrderId ? (poMap.get(r.purchaseOrderId) ?? r.purchaseOrderId) : null,
      supplierId: r.supplierId ? (supMap.get(r.supplierId) ?? r.supplierId) : null,
      warehouseId: r.warehouseId ? (whMap.get(r.warehouseId) ?? r.warehouseId) : null,
    }));
    res.json(out);
  } catch (e) { next(e); }
});

supplyChainRouter.get("/qc-inspections/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = qcWhere(pid);
    const [row] = await db.select().from(s.qcInspections).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "QC Inspection tidak ditemukan." });
    const lines = await qcInspectionLines(db, row.id);
    // map FKs to publicId
    let receivingPublic: string | number = row.receivingId;
    let poPublic: string | number | null = row.purchaseOrderId;
    let supplierPublic: string | number | null = row.supplierId;
    let warehousePublic: string | number | null = row.warehouseId;
    if (row.receivingId) {
      const [rcv] = await db.select({ publicId: s.receivings.publicId }).from(s.receivings).where(eq(s.receivings.id, row.receivingId)).limit(1);
      if (rcv) receivingPublic = rcv.publicId;
    }
    if (row.purchaseOrderId) {
      const [po] = await db.select({ publicId: s.purchaseOrders.publicId }).from(s.purchaseOrders).where(eq(s.purchaseOrders.id, row.purchaseOrderId)).limit(1);
      if (po) poPublic = po.publicId;
    }
    if (row.supplierId) {
      const [sup] = await db.select({ publicId: s.suppliers.publicId }).from(s.suppliers).where(eq(s.suppliers.id, row.supplierId)).limit(1);
      if (sup) supplierPublic = sup.publicId;
    }
    if (row.warehouseId) {
      const [wh] = await db.select({ publicId: s.warehouses.publicId }).from(s.warehouses).where(eq(s.warehouses.id, row.warehouseId)).limit(1);
      if (wh) warehousePublic = wh.publicId;
    }
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, receivingId: receivingPublic, purchaseOrderId: poPublic, supplierId: supplierPublic, warehouseId: warehousePublic, lines: await mapQcLines(lines) });
  } catch (e) { next(e); }
});

putAndPatch("/qc-inspections/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = qcWhere(pid);
    const [cur] = await db.select({ id: s.qcInspections.id, status: s.qcInspections.status }).from(s.qcInspections).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "QC Inspection tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya DRAFT yang bisa diubah." });
    const [oldRowFull] = await db.select().from(s.qcInspections).where(where).limit(1);
    let oldLines: any[] = [];
    try { if (Array.isArray((req.body as any)?.lines)) oldLines = await db.select().from(s.qcInspectionLines).where(eq(s.qcInspectionLines.qcInspectionId, cur.id)); } catch {}
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.inspectionDate !== undefined) patch.inspectionDate = b.inspectionDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.qcNotes !== undefined) patch.qcNotes = b.qcNotes ?? null;
    patch.updatedAt = new Date();
    await db.update(s.qcInspections).set(patch).where(eq(s.qcInspections.id, cur.id));
    let linesDiff: any = null;
    if (Array.isArray(b.lines)) {
      await db.transaction(async (tx) => { await replaceQcLines(tx, cur.id, b.lines); });
      try {
        const newLinesResolved = await Promise.all((b.lines as any[]).map(async (l: any) => {
          const itemId = l.itemId ? await resolveInternalId(s.items, String(l.itemId)) : l.itemId;
          const uomId = l.uomId ? await resolveInternalId(s.uom, String(l.uomId)) : l.uomId;
          return { ...l, itemId: itemId ?? l.itemId, uomId: uomId ?? l.uomId };
        }));
        linesDiff = diffLines(oldLines as any, newLinesResolved as any);
      } catch {}
    }
    try {
      const { internalId, role } = await getActorInfo(req);
      const changes = computeDiff(oldRowFull as any, patch as any, { denylist: DIFF_DENYLIST });
      const meta: Record<string, unknown> = { patchKeys: Object.keys(patch) };
      if (Object.keys(changes).length) meta.changes = changes;
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
      await logActivity({ documentType: "QC", documentId: cur.id, action: "update", fromStatus: cur.status, toStatus: cur.status, actorUserId: internalId, actorRole: role, metadata: meta });
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.delete("/qc-inspections/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = qcWhere(pid);
    const [cur] = await db.select({ id: s.qcInspections.id }).from(s.qcInspections).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "QC Inspection tidak ditemukan." });
    await db.delete(s.qcInspections).where(eq(s.qcInspections.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/qc-inspections/:id/submit", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = qcWhere(pid);
    const [qc] = await db.select().from(s.qcInspections).where(where).limit(1);
    if (!qc) return res.status(404).json({ error: "QC Inspection tidak ditemukan." });
    if (qc.status !== "DRAFT") return res.status(400).json({ error: `Hanya DRAFT yang bisa di-submit. Status: ${qc.status}` });
    const lines = await qcInspectionLines(db, qc.id);
    if (!lines.length) return res.status(400).json({ error: "QC tanpa item tidak bisa di-submit." });
    for (const l of lines) {
      if (Number(l.qtyRejected) < 0 || Number(l.qtyRejected) > Number(l.qtyReceived)) return res.status(400).json({ error: `Qty reject tidak valid untuk ${l.publicId}` });
    }
    await db.transaction(async (tx) => {
      // update qc status
      await tx.update(s.qcInspections).set({ status: "COMPLETED", updatedAt: new Date() }).where(eq(s.qcInspections.id, qc.id));
      // propagate to receiving_lines and receiving status
      for (const l of lines) {
        const qtyAccepted = Number(l.qtyReceived) - Number(l.qtyRejected);
        if (l.receivingLineId) {
          await tx.update(s.receivingLines).set({ qtyAccepted: String(qtyAccepted), qtyRejected: String(l.qtyRejected), rejectReason: l.rejectReason ?? null }).where(eq(s.receivingLines.id, l.receivingLineId as any));
        }
      }
      // if all qc lines have been inspected, mark receiving completed
      await tx.update(s.receivings).set({ status: "COMPLETED", qcInspectedAt: new Date(), qcInspectedBy: (req as any).user?.internalId ?? null, qcNotes: qc.qcNotes ?? null, updatedAt: new Date() }).where(eq(s.receivings.id, qc.receivingId));
    });
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "QC", documentId: qc.id, action: "submit", fromStatus: "DRAFT", toStatus: "COMPLETED", actorUserId: internalId, actorRole: role }); } catch {}
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "RCV", documentId: qc.receivingId, action: "post", fromStatus: "PENDING_QC", toStatus: "COMPLETED", actorUserId: internalId, actorRole: role, metadata: { qcInspectionId: qc.id, qcDocumentNo: qc.documentNo } }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/qc-inspections/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = qcWhere(pid);
    const [cur] = await db.select({ id: s.qcInspections.id, status: s.qcInspections.status }).from(s.qcInspections).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "QC Inspection tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "Sudah dibatalkan." });
    await db.update(s.qcInspections).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.qcInspections.id, cur.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "QC", documentId: cur.id, action: "cancel", fromStatus: cur.status, toStatus: "CANCELED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// QC Parameters master
function qcParamWhere(pid: string) {
  if (isUuid(pid)) return eq(s.qcParameters.publicId, pid);
  if (/^\d+$/.test(pid)) return eq(s.qcParameters.id, Number(pid));
  return eq(s.qcParameters.code, pid);
}
supplyChainRouter.get("/qc-parameters", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const rows = await db.select().from(s.qcParameters).orderBy(s.qcParameters.code);
    res.json(rows.map((r: any) => ({ ...r, id: r.publicId, _internalId: r.id })));
  } catch (e) { next(e); }
});
supplyChainRouter.post("/qc-parameters", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.code || !b.name) return res.status(400).json({ error: "code & name wajib." });
    const [row] = await db.insert(s.qcParameters).values({ code: String(b.code).toUpperCase().trim(), name: String(b.name).trim(), description: b.description ?? null, isActive: b.isActive ?? true }).returning();
    res.status(201).json({ id: row.publicId, code: row.code });
  } catch (e) { next(e); }
});
putAndPatch("/qc-parameters/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = qcParamWhere(pid);
    const [cur] = await db.select({ id: s.qcParameters.id }).from(s.qcParameters).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "QC Parameter tidak ditemukan." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.code !== undefined) patch.code = String(b.code).toUpperCase().trim();
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.description !== undefined) patch.description = b.description ?? null;
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    patch.updatedAt = new Date();
    await db.update(s.qcParameters).set(patch).where(eq(s.qcParameters.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/qc-parameters/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = qcParamWhere(pid);
    const [cur] = await db.select({ id: s.qcParameters.id }).from(s.qcParameters).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "QC Parameter tidak ditemukan." });
    await db.delete(s.qcParameters).where(eq(s.qcParameters.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Deliveries
async function deliveryLines(tx: any, deliveryId: number) { return tx.select().from(s.deliveryLines).where(eq(s.deliveryLines.deliveryId, deliveryId)); }
async function replaceDeliveryLines(tx: any, deliveryId: number, lines: any[]) {
  await tx.delete(s.deliveryLines).where(eq(s.deliveryLines.deliveryId, deliveryId));
  for (const l of lines) {
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = await resolveInternalId(s.uom, l.uomId);
    if (!itemId || !uomId) throw new Error("Item/UOM tidak valid");
    await tx.insert(s.deliveryLines).values({ deliveryId, itemId, uomId, qty: String(l.qty), unitPrice: l.unitPrice != null ? String(l.unitPrice) : null, batchNumber: l.batchNumber ?? null, note: l.note ?? null });
  }
}
supplyChainRouter.post("/deliveries", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.warehouseId || !b.deliveryDate) return res.status(400).json({ error: "warehouseId, deliveryDate wajib." });
    const warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (!warehouseId) return res.status(400).json({ error: "warehouse tidak valid." });
    let salesOrderId: number | null = null;
    let customerId: number | null = null;
    if (b.salesOrderId) {
      salesOrderId = await resolveInternalId(s.salesOrders, String(b.salesOrderId));
      if (!salesOrderId) return res.status(400).json({ error: "Sales Order tidak ditemukan." });
      if (!b.customerId) {
        const [so] = await db.select({ customerId: s.salesOrders.customerId }).from(s.salesOrders).where(eq(s.salesOrders.id, salesOrderId)).limit(1);
        if (so) customerId = so.customerId;
      }
    }
    if (b.customerId) customerId = await resolveInternalId(s.customers, String(b.customerId));
    const branchId = b.branchId ? await resolveInternalId(s.branches, String(b.branchId)) : null;
    const seriesRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesRaw));
    const { documentNo, id: newId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "DLV", { seriesId: seriesId ?? undefined, branchId: branchId ?? undefined, date: b.deliveryDate ? new Date(b.deliveryDate) : new Date() });
      const [ins] = await tx.insert(s.deliveries).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, salesOrderId, customerId, warehouseId, deliveryDate: b.deliveryDate, status: "DRAFT", notes: b.notes ?? b.remarks ?? null, createdBy: (await getActorInfo(req)).internalId ?? null, branchId }).returning();
      if (Array.isArray(b.lines)) await replaceDeliveryLines(tx, ins.id, b.lines);
      return { documentNo: doc.documentNo, id: ins.id };
    });
    const [created] = await db.select({ publicId: s.deliveries.publicId }).from(s.deliveries).where(eq(s.deliveries.documentNo, documentNo)).limit(1);
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "DLV", documentId: newId, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo } });
    } catch {}
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});
supplyChainRouter.get("/deliveries", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.deliveries.status as any, String(req.query.status)));
    if (req.query.warehouseId) {
      const wid = await resolveInternalId(s.warehouses, String(req.query.warehouseId));
      if (wid) conds.push(eq(s.deliveries.warehouseId, wid));
    }
    if (req.query.salesOrderId) {
      const sid = await resolveInternalId(s.salesOrders, String(req.query.salesOrderId));
      if (sid) conds.push(eq(s.deliveries.salesOrderId, sid));
    }
    if (req.query.customerId) {
      const cid = await resolveInternalId(s.customers, String(req.query.customerId));
      if (cid) conds.push(eq(s.deliveries.customerId, cid));
    }
    const rows = await db.select().from(s.deliveries).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.deliveries.deliveryDate));
    res.json(rows.map((r: any) => ({ ...r, id: r.publicId, _internalId: r.id, documentNo: r.documentNo, deliveryNo: r.documentNo })));
  } catch (e) { next(e); }
});
supplyChainRouter.get("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "view"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = deliveryWhere(pid);
    const [row] = await db.select().from(s.deliveries).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    const lines = await deliveryLines(db, row.id);
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, deliveryNo: row.documentNo, lines: lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id })) });
  } catch (e) { next(e); }
});
putAndPatch("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = deliveryWhere(pid);
    const [cur] = await db.select({ id: s.deliveries.id, status: s.deliveries.status }).from(s.deliveries).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya delivery DRAFT yang dapat diubah." });
    const [oldRowFull] = await db.select().from(s.deliveries).where(where).limit(1);
    let oldLines: any[] = [];
    try { if (Array.isArray((req.body as any)?.lines)) oldLines = await db.select().from(s.deliveryLines).where(eq(s.deliveryLines.deliveryId, cur.id)); } catch {}
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.deliveryDate !== undefined) patch.deliveryDate = b.deliveryDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.salesOrderId !== undefined) patch.salesOrderId = b.salesOrderId ? await resolveInternalId(s.salesOrders, String(b.salesOrderId)) : null;
    if (b.customerId !== undefined) patch.customerId = b.customerId ? await resolveInternalId(s.customers, String(b.customerId)) : null;
    patch.updatedAt = new Date();
    await db.update(s.deliveries).set(patch).where(eq(s.deliveries.id, cur.id));
    let linesDiff: any = null;
    if (Array.isArray(b.lines)) {
      await db.transaction(async (tx) => { await replaceDeliveryLines(tx, cur.id, b.lines); });
      try {
        const newLinesResolved = await Promise.all((b.lines as any[]).map(async (l: any) => {
          const itemId = l.itemId ? await resolveInternalId(s.items, String(l.itemId)) : l.itemId;
          const uomId = l.uomId ? await resolveInternalId(s.uom, String(l.uomId)) : l.uomId;
          return { ...l, itemId: itemId ?? l.itemId, uomId: uomId ?? l.uomId };
        }));
        linesDiff = diffLines(oldLines as any, newLinesResolved as any);
      } catch {}
    }
    try {
      const { internalId, role } = await getActorInfo(req);
      const changes = computeDiff(oldRowFull as any, patch as any, { denylist: DIFF_DENYLIST });
      const meta: Record<string, unknown> = { patchKeys: Object.keys(patch) };
      if (Object.keys(changes).length) meta.changes = changes;
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
      await logActivity({ documentType: "DLV", documentId: cur.id, action: "update", fromStatus: cur.status, toStatus: cur.status, actorUserId: internalId, actorRole: role, metadata: meta });
    } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = deliveryWhere(pid);
    const [cur] = await db.select({ id: s.deliveries.id }).from(s.deliveries).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    await db.delete(s.deliveries).where(eq(s.deliveries.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/deliveries/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = deliveryWhere(pid);
    const [dlv] = await db.select().from(s.deliveries).where(where).limit(1);
    if (!dlv) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    if (dlv.status === "CANCELED") return res.status(400).json({ error: "Delivery dibatalkan tidak dapat diposting." });
    if (dlv.status === "POSTED") return res.status(400).json({ error: "Delivery sudah diposting." });
    const lines = await deliveryLines(db, dlv.id);
    if (lines.length === 0) return res.status(400).json({ error: "Delivery tanpa lines." });
    const typeId = await getMovementTypeId("ISSUE");
    const details: DetailInput[] = lines.map((l: any) => ({ itemId: l.itemId, fromWarehouseId: dlv.warehouseId, toWarehouseId: null, qty: Number(l.qty), uomId: l.uomId, batchNumber: l.batchNumber ?? null }));
    const input: MovementInput = { typeId, movementDate: dlv.deliveryDate, status: "POSTED", referenceType: "DELIVERY", referenceId: String(dlv.id), description: `Delivery ${dlv.documentNo}`, details };
    await db.transaction(async (tx) => { await insertMovementWithDetails(tx as any, input, String((req as any).user?.internalId ?? (req as any).user?.id ?? "system")); });
    await db.update(s.deliveries).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.deliveries.id, dlv.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "DLV", documentId: dlv.id, action: "post", fromStatus: "DRAFT", toStatus: "POSTED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/deliveries/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = deliveryWhere(pid);
    const [cur] = await db.select({ id: s.deliveries.id, status: s.deliveries.status }).from(s.deliveries).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "Delivery sudah dibatalkan." });
    if (cur.status === "POSTED") {
      const [dlv] = await db.select().from(s.deliveries).where(eq(s.deliveries.id, cur.id)).limit(1);
      const lines = await deliveryLines(db, cur.id);
      const typeId = await getMovementTypeId("RECEIPT");
      const details: DetailInput[] = lines.map((l: any) => ({ itemId: l.itemId, fromWarehouseId: null, toWarehouseId: dlv.warehouseId, qty: Number(l.qty), uomId: l.uomId, batchNumber: l.batchNumber ?? null }));
      const input: MovementInput = { typeId, movementDate: dlv.deliveryDate, status: "POSTED", referenceType: "DELIVERY_CANCEL", referenceId: String(dlv.id), description: `Batal Delivery ${dlv.documentNo}`, details };
      await db.transaction(async (tx) => { await insertMovementWithDetails(tx as any, input, String((req as any).user?.internalId ?? (req as any).user?.id ?? "system")); });
    }
    await db.update(s.deliveries).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.deliveries.id, cur.id));
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "DLV", documentId: cur.id, action: "cancel", fromStatus: cur.status, toStatus: "CANCELED", actorUserId: internalId, actorRole: role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/sales-orders/:id/create-delivery", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = soWhere(pid);
    const [so] = await db.select().from(s.salesOrders).where(where).limit(1);
    if (!so) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    const lines = await soLines(db, so.id);
    const { documentNo } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "DLV", { branchId: so.branchId ?? undefined, date: req.body?.deliveryDate ? new Date(req.body.deliveryDate) : new Date() });
      const [dlv] = await tx.insert(s.deliveries).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, salesOrderId: so.id, customerId: so.customerId, warehouseId: so.warehouseId, deliveryDate: (req.body?.deliveryDate as string) || new Date().toISOString().slice(0, 10), status: "DRAFT", notes: req.body?.notes ?? null, createdBy: (await getActorInfo(req)).internalId ?? null, branchId: so.branchId }).returning();
      for (const l of lines) {
        await tx.insert(s.deliveryLines).values({ deliveryId: dlv.id, itemId: l.itemId, uomId: l.uomId, qty: l.qty, unitPrice: l.unitPrice, batchNumber: l.batchNumber, note: l.note });
      }
      return { documentNo: doc.documentNo, id: dlv.id };
    });
    const [created] = await db.select({ publicId: s.deliveries.publicId }).from(s.deliveries).where(eq(s.deliveries.documentNo, documentNo)).limit(1);
    try { const { internalId, role } = await getActorInfo(req); await logActivity({ documentType: "SO", documentId: so.id, action: "convert", fromStatus: so.status, toStatus: so.status, actorUserId: internalId, actorRole: role, metadata: { targetType: "DLV", targetDocumentNo: documentNo, targetPublicId: created.publicId } }); } catch {}
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});
