// @ts-nocheck
import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission } from "../middleware/rbac";
import { nextDocumentNo } from "../lib/document-number";
import {
  insertMovementWithDetails,
  type DetailInput,
  type MovementInput,
} from "./transactions";

export const supplyChainRouter = Router();

type DocStatus = "DRAFT" | "POSTED" | "CANCELED";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
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
    const seriesIdRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesIdRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesIdRaw));
    // generate documentNo at DRAFT
    const { documentNo, seriesId: resolvedSeriesId } = await db.transaction(async (tx) => {
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
        createdBy: (req as any).user?.internalId ?? null,
        branchId,
      }).returning();
      if (Array.isArray(b.lines)) await replacePoLines(tx, ins.id, b.lines);
      return { documentNo: doc.documentNo, seriesId: doc.seriesId, id: ins.id, publicId: ins.publicId };
    });
    // fetch created publicId
    const [created] = await db.select({ publicId: s.purchaseOrders.publicId, documentNo: s.purchaseOrders.documentNo }).from(s.purchaseOrders).where(eq(s.purchaseOrders.documentNo, documentNo)).limit(1);
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
    let where: any = undefined;
    if (isUuid(pid)) where = eq(s.purchaseOrders.publicId, pid);
    else if (/^\d+$/.test(pid)) where = eq(s.purchaseOrders.id, Number(pid));
    else where = eq(s.purchaseOrders.publicId, pid);
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
      createdBy: row.createdBy,
      branchId: row.branchId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lines: mappedLines,
      receipts: await db.select().from(s.goodsReceipts).where(eq(s.goodsReceipts.purchaseOrderId, row.id)).then((rows) => rows.map((r: any) => ({ ...r, id: r.publicId, _internalId: r.id, documentNo: r.documentNo, grNo: r.documentNo }))),
    });
  } catch (e) { next(e); }
});

supplyChainRouter.put("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = undefined;
    if (isUuid(pid)) where = eq(s.purchaseOrders.publicId, pid);
    else where = eq(s.purchaseOrders.id, Number(pid));
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya PO berstatus DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "PO"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const patch: Record<string, any> = {};
    if (b.supplierId !== undefined) patch.supplierId = await resolveInternalId(s.suppliers, String(b.supplierId));
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.orderDate !== undefined) patch.orderDate = b.orderDate;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    patch.updatedAt = new Date();
    await db.update(s.purchaseOrders).set(patch).where(eq(s.purchaseOrders.id, cur.id));
    if (Array.isArray(b.lines)) await db.transaction(async (tx) => { await replacePoLines(tx, cur.id, b.lines); });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.delete("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = undefined;
    if (isUuid(pid)) where = eq(s.purchaseOrders.publicId, pid);
    else where = eq(s.purchaseOrders.id, Number(pid));
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
    let where: any = undefined;
    if (isUuid(pid)) where = eq(s.purchaseOrders.publicId, pid);
    else where = eq(s.purchaseOrders.id, Number(pid));
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "PO dibatalkan tidak dapat diposting." });
    await db.update(s.purchaseOrders).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

supplyChainRouter.post("/purchase-orders/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = undefined;
    if (isUuid(pid)) where = eq(s.purchaseOrders.publicId, pid);
    else where = eq(s.purchaseOrders.id, Number(pid));
    const [cur] = await db.select({ id: s.purchaseOrders.id, status: s.purchaseOrders.status }).from(s.purchaseOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "PO sudah dibatalkan." });
    await db.update(s.purchaseOrders).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.purchaseOrders.id, cur.id));
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
        createdBy: (req as any).user?.internalId ?? null,
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
    const { documentNo } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "SO", { seriesId: seriesId ?? undefined, branchId: branchId ?? undefined, date: b.orderDate ? new Date(b.orderDate) : new Date() });
      const [ins] = await tx.insert(s.salesOrders).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, customerId, warehouseId, orderDate: b.orderDate, expectedDate: b.expectedDate ?? null, status: "DRAFT", notes: b.notes ?? null, createdBy: (req as any).user?.internalId ?? null, branchId }).returning();
      if (Array.isArray(b.lines)) await replaceSoLines(tx, ins.id, b.lines);
      return { documentNo: doc.documentNo, id: ins.id };
    });
    const [created] = await db.select({ publicId: s.salesOrders.publicId }).from(s.salesOrders).where(eq(s.salesOrders.documentNo, documentNo)).limit(1);
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
    let where: any = isUuid(pid) ? eq(s.salesOrders.publicId, pid) : eq(s.salesOrders.id, Number(pid));
    const [row] = await db.select().from(s.salesOrders).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    const lines = await soLines(db, row.id);
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, soNo: row.documentNo, lines: lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id })) });
  } catch (e) { next(e); }
});
supplyChainRouter.put("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.salesOrders.publicId, pid) : eq(s.salesOrders.id, Number(pid));
    const [cur] = await db.select({ id: s.salesOrders.id, status: s.salesOrders.status }).from(s.salesOrders).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya SO berstatus DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.customerId !== undefined) patch.customerId = await resolveInternalId(s.customers, String(b.customerId));
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.orderDate !== undefined) patch.orderDate = b.orderDate;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    patch.updatedAt = new Date();
    await db.update(s.salesOrders).set(patch).where(eq(s.salesOrders.id, cur.id));
    if (Array.isArray(b.lines)) await db.transaction(async (tx) => { await replaceSoLines(tx, cur.id, b.lines); });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.salesOrders.publicId, pid) : eq(s.salesOrders.id, Number(pid));
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
    let where: any = isUuid(pid) ? eq(s.salesOrders.publicId, pid) : eq(s.salesOrders.id, Number(pid));
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
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/sales-orders/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.salesOrders.publicId, pid) : eq(s.salesOrders.id, Number(pid));
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
    const seriesRaw = b.seriesId ?? b.seriesCode ?? null;
    let seriesId: number | null = null;
    if (seriesRaw) seriesId = await resolveInternalId(s.documentSeries, String(seriesRaw));
    const { documentNo } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "GR", { seriesId: seriesId ?? undefined, branchId: po.branchId ?? undefined, date: b.receiptDate ? new Date(b.receiptDate) : new Date() });
      const [gr] = await tx.insert(s.goodsReceipts).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, purchaseOrderId: poId, supplierId: po.supplierId, warehouseId, receiptDate: b.receiptDate, status: "DRAFT", notes: b.notes ?? null, createdBy: (req as any).user?.internalId ?? null, branchId: po.branchId }).returning();
      if (Array.isArray(b.lines)) await replaceGrLines(tx, gr.id, b.lines);
      return { documentNo: doc.documentNo, id: gr.id };
    });
    const [created] = await db.select({ publicId: s.goodsReceipts.publicId }).from(s.goodsReceipts).where(eq(s.goodsReceipts.documentNo, documentNo)).limit(1);
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
    let where: any = isUuid(pid) ? eq(s.goodsReceipts.publicId, pid) : eq(s.goodsReceipts.id, Number(pid));
    const [row] = await db.select().from(s.goodsReceipts).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    const lines = await grLines(db, row.id);
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, grNo: row.documentNo, lines: lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id })) });
  } catch (e) { next(e); }
});
supplyChainRouter.put("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.goodsReceipts.publicId, pid) : eq(s.goodsReceipts.id, Number(pid));
    const [cur] = await db.select({ id: s.goodsReceipts.id, status: s.goodsReceipts.status }).from(s.goodsReceipts).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya GR berstatus DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "GR"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.receiptDate !== undefined) patch.receiptDate = b.receiptDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.purchaseOrderId !== undefined) patch.purchaseOrderId = await resolveInternalId(s.purchaseOrders, String(b.purchaseOrderId));
    patch.updatedAt = new Date();
    await db.update(s.goodsReceipts).set(patch).where(eq(s.goodsReceipts.id, cur.id));
    if (Array.isArray(b.lines)) await db.transaction(async (tx) => { await replaceGrLines(tx, cur.id, b.lines); });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.goodsReceipts.publicId, pid) : eq(s.goodsReceipts.id, Number(pid));
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
    let where: any = isUuid(pid) ? eq(s.goodsReceipts.publicId, pid) : eq(s.goodsReceipts.id, Number(pid));
    const [gr] = await db.select().from(s.goodsReceipts).where(where).limit(1);
    if (!gr) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (gr.status === "CANCELED") return res.status(400).json({ error: "GR dibatalkan tidak dapat diposting." });
    if (gr.status === "POSTED") return res.status(400).json({ error: "GR sudah diposting." });
    const lines = await grLines(db, gr.id);
    validateRequireUnitPrice(lines, "GR");
    const typeId = await getMovementTypeId("RECEIPT");
    const details: DetailInput[] = lines.map((l: any) => ({ itemId: l.itemId, fromWarehouseId: null, toWarehouseId: gr.warehouseId, qty: Number(l.qty), uomId: l.uomId, batchNumber: l.batchNumber ?? null, incomingRate: l.unitPrice != null ? Number(l.unitPrice) : null }));
    const input: MovementInput = { typeId, movementDate: gr.receiptDate, status: "POSTED", referenceType: "GOODS_RECEIPT", referenceId: String(gr.id), description: `Penerimaan ${gr.documentNo}`, details };
    await db.transaction(async (tx) => { await insertMovementWithDetails(tx as any, input, String((req as any).user?.internalId ?? (req as any).user?.id ?? "system")); });
    await db.update(s.goodsReceipts).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.goodsReceipts.id, gr.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/goods-receipts/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.goodsReceipts.publicId, pid) : eq(s.goodsReceipts.id, Number(pid));
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
    const { documentNo } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "DLV", { seriesId: seriesId ?? undefined, branchId: branchId ?? undefined, date: b.deliveryDate ? new Date(b.deliveryDate) : new Date() });
      const [ins] = await tx.insert(s.deliveries).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, salesOrderId, customerId, warehouseId, deliveryDate: b.deliveryDate, status: "DRAFT", notes: b.notes ?? b.remarks ?? null, createdBy: (req as any).user?.internalId ?? null, branchId }).returning();
      if (Array.isArray(b.lines)) await replaceDeliveryLines(tx, ins.id, b.lines);
      return { documentNo: doc.documentNo, id: ins.id };
    });
    const [created] = await db.select({ publicId: s.deliveries.publicId }).from(s.deliveries).where(eq(s.deliveries.documentNo, documentNo)).limit(1);
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
    let where: any = isUuid(pid) ? eq(s.deliveries.publicId, pid) : eq(s.deliveries.id, Number(pid));
    const [row] = await db.select().from(s.deliveries).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    const lines = await deliveryLines(db, row.id);
    res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, deliveryNo: row.documentNo, lines: lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id })) });
  } catch (e) { next(e); }
});
supplyChainRouter.put("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.deliveries.publicId, pid) : eq(s.deliveries.id, Number(pid));
    const [cur] = await db.select({ id: s.deliveries.id, status: s.deliveries.status }).from(s.deliveries).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya delivery DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.deliveryDate !== undefined) patch.deliveryDate = b.deliveryDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.salesOrderId !== undefined) patch.salesOrderId = b.salesOrderId ? await resolveInternalId(s.salesOrders, String(b.salesOrderId)) : null;
    if (b.customerId !== undefined) patch.customerId = b.customerId ? await resolveInternalId(s.customers, String(b.customerId)) : null;
    patch.updatedAt = new Date();
    await db.update(s.deliveries).set(patch).where(eq(s.deliveries.id, cur.id));
    if (Array.isArray(b.lines)) await db.transaction(async (tx) => { await replaceDeliveryLines(tx, cur.id, b.lines); });
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.delete("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.deliveries.publicId, pid) : eq(s.deliveries.id, Number(pid));
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
    let where: any = isUuid(pid) ? eq(s.deliveries.publicId, pid) : eq(s.deliveries.id, Number(pid));
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
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/deliveries/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.deliveries.publicId, pid) : eq(s.deliveries.id, Number(pid));
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
    res.json({ ok: true });
  } catch (e) { next(e); }
});
supplyChainRouter.post("/sales-orders/:id/create-delivery", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = isUuid(pid) ? eq(s.salesOrders.publicId, pid) : eq(s.salesOrders.id, Number(pid));
    const [so] = await db.select().from(s.salesOrders).where(where).limit(1);
    if (!so) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    const lines = await soLines(db, so.id);
    const { documentNo } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "DLV", { branchId: so.branchId ?? undefined, date: req.body?.deliveryDate ? new Date(req.body.deliveryDate) : new Date() });
      const [dlv] = await tx.insert(s.deliveries).values({ documentNo: doc.documentNo, seriesId: doc.seriesId, salesOrderId: so.id, customerId: so.customerId, warehouseId: so.warehouseId, deliveryDate: (req.body?.deliveryDate as string) || new Date().toISOString().slice(0, 10), status: "DRAFT", notes: req.body?.notes ?? null, createdBy: (req as any).user?.internalId ?? null, branchId: so.branchId }).returning();
      for (const l of lines) {
        await tx.insert(s.deliveryLines).values({ deliveryId: dlv.id, itemId: l.itemId, uomId: l.uomId, qty: l.qty, unitPrice: l.unitPrice, batchNumber: l.batchNumber, note: l.note });
      }
      return { documentNo: doc.documentNo, id: dlv.id };
    });
    const [created] = await db.select({ publicId: s.deliveries.publicId }).from(s.deliveries).where(eq(s.deliveries.documentNo, documentNo)).limit(1);
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});
