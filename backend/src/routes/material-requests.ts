// @ts-nocheck
import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission } from "../middleware/rbac";
import { nextDocumentNo } from "../lib/document-number";

export const materialRequestRouter = Router();
const putAndPatch = (path: string, ...handlers: any[]) => {
  (materialRequestRouter as any).put(path, ...handlers);
  (materialRequestRouter as any).patch(path, ...handlers);
};

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isDocumentNo(v: string): boolean {
  return /^[A-Z]{2,5}-\d{2,4}-?\d{1,6}$/i.test(v) || /^[A-Z]{2,5}-\d{4,}-\d+$/i.test(v) || /^[A-Z]+\-\d+.*$/i.test(v);
}
function mrWhere(pid: string) {
  if (isUuid(pid)) return eq(s.materialRequests.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.materialRequests.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.materialRequests.id, Number(pid));
  return eq(s.materialRequests.documentNo, pid);
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

async function mrLines(tx: any, prId: number) {
  return tx.select().from(s.materialRequestLines).where(eq(s.materialRequestLines.materialRequestId, prId));
}
function validateRequireUnitPrice(lines: any[], context: string) {
  // For PR, estimatedPrice is optional — only validate if provided? Keep lax: allow null, but if provided must be >=0
  for (let i = 0; i < lines.length; i++) {
    const v = lines[i]?.unitPrice;
    if (v != null && String(v).trim() !== "") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new Error(`${context} baris ${i + 1}: Harga tidak valid.`);
    }
  }
}
async function replaceMrLines(tx: any, prId: number, lines: any[]) {
  validateRequireUnitPrice(lines, "MR");
  await tx.delete(s.materialRequestLines).where(eq(s.materialRequestLines.materialRequestId, prId));
  for (const l of lines) {
    const deliveryDate = l.deliveryDate ?? l.expectedDate ?? null;
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = await resolveInternalId(s.uom, l.uomId);
    if (!itemId || !uomId) throw new Error(`Item/UOM tidak valid pada baris PR`);
    await tx.insert(s.materialRequestLines).values({
      materialRequestId: prId,
      itemId,
      uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice != null && String(l.unitPrice).trim() !== "" ? String(l.unitPrice) : null,
      discount: l.discount != null && String(l.discount).trim() !== "" ? String(l.discount) : "0",
      batchNumber: l.batchNumber ?? null,
      note: l.note ?? null,
      deliveryDate: deliveryDate ? String(deliveryDate).slice(0, 10) : null,
    });
  }
}

// POST /material-requests
materialRequestRouter.post("/material-requests", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.warehouseId || !b.requestDate) return res.status(400).json({ error: "warehouseId, requestDate wajib." });
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "MR"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const supplierId = null;
    const warehouseId = await resolveInternalId(s.warehouses, b.warehouseId);
    const branchId = b.branchId ? await resolveInternalId(s.branches, b.branchId) : null;
    if (!warehouseId) return res.status(400).json({ error: "warehouseId tidak valid." });
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
    let needApproval: boolean;
    if (b.needApproval !== undefined) needApproval = !!b.needApproval;
    else {
      const [def] = await db.select({ id: s.workflows.id }).from(s.workflows).where(and(eq(s.workflows.documentType, "MR"), eq(s.workflows.isDefault, true), eq(s.workflows.isActive, true))).limit(1);
      needApproval = !!def;
    }
    if (b.urgency && !["LOW","MEDIUM","HIGH"].includes(String(b.urgency).toUpperCase())) return res.status(400).json({ error: "urgency harus LOW, MEDIUM, atau HIGH." });
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
      }
    }
    const { documentNo, seriesId: resolvedSeriesId } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "MR", { seriesId: seriesId ?? undefined, branchId: branchId ?? undefined, date: b.requestDate ? new Date(b.requestDate) : new Date() });
      const [ins] = await tx.insert(s.materialRequests).values({
        documentNo: doc.documentNo,
        seriesId: doc.seriesId,
        warehouseId,
        requestDate: b.requestDate,
        expectedDate: b.expectedDate ?? null,
        urgency: b.urgency ? String(b.urgency).toUpperCase() : "MEDIUM",
        status: "DRAFT",
        notes: b.notes ?? null,
        department: b.department ?? null,
        costCenter: b.costCenter ?? null,
        currency: b.currency ? String(b.currency).toUpperCase() : "IDR",
        exchangeRate: b.exchangeRate != null ? String(b.exchangeRate) : "1",
        needApproval,
        preparedSignature,
        preparedSignedAt,
        preparedBy,
        globalDiscountPercent,
        additionalCharges,
        taxRate: resolvedTaxRate ?? (b.taxRate != null ? String(b.taxRate) : "0"),
        taxCategoryId,
        createdBy: (req as any).user?.internalId ?? null,
        branchId,
      }).returning();
      if (Array.isArray(b.lines)) await replaceMrLines(tx, ins.id, b.lines);
      return { documentNo: doc.documentNo, seriesId: doc.seriesId, id: ins.id, publicId: ins.publicId };
    });
    const [created] = await db.select({ publicId: s.materialRequests.publicId, documentNo: s.materialRequests.documentNo }).from(s.materialRequests).where(eq(s.materialRequests.documentNo, documentNo)).limit(1);
    res.status(201).json({ id: created.publicId, documentNo: created.documentNo, seriesId: resolvedSeriesId });
  } catch (e) { next(e); }
});

// GET /material-requests
materialRequestRouter.get("/material-requests", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.materialRequests.status as any, String(req.query.status)));
    if (req.query.warehouseId) {
      const wid = await resolveInternalId(s.warehouses, String(req.query.warehouseId));
      if (wid) conds.push(eq(s.materialRequests.warehouseId, wid));
    }
    const rows = await db.select({
      id: s.materialRequests.id,
      publicId: s.materialRequests.publicId,
      documentNo: s.materialRequests.documentNo,
      seriesId: s.materialRequests.seriesId,
      warehouseId: s.materialRequests.warehouseId,
      requestDate: s.materialRequests.requestDate,
      expectedDate: s.materialRequests.expectedDate,
      urgency: s.materialRequests.urgency,
      status: s.materialRequests.status,
      notes: s.materialRequests.notes,
      department: (s as any).materialRequests.department,
      costCenter: (s as any).materialRequests.costCenter,
      currency: (s as any).materialRequests.currency,
      exchangeRate: (s as any).materialRequests.exchangeRate,
      needApproval: (s.materialRequests as any).needApproval,
      currentApprovalLevel: (s.materialRequests as any).currentApprovalLevel,
      approvalWorkflowId: (s.materialRequests as any).approvalWorkflowId,
      globalDiscountPercent: (s.materialRequests as any).globalDiscountPercent,
      additionalCharges: (s.materialRequests as any).additionalCharges,
      taxRate: s.materialRequests.taxRate,
      taxCategoryId: (s as any).materialRequests.taxCategoryId,
      createdBy: s.materialRequests.createdBy,
      branchId: s.materialRequests.branchId,
      createdAt: s.materialRequests.createdAt,
      updatedAt: s.materialRequests.updatedAt,
    }).from(s.materialRequests).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.materialRequests.requestDate));
    const out = rows.map((r) => ({
      id: r.publicId,
      publicId: r.publicId,
      _internalId: r.id,
      documentNo: r.documentNo,
      mrNo: r.documentNo,
      warehouseId: r.warehouseId,
      requestDate: r.requestDate,
      expectedDate: r.expectedDate,
      urgency: r.urgency,
      status: r.status,
      notes: r.notes,
      department: (r as any).department ?? null,
      costCenter: (r as any).costCenter ?? null,
      currency: (r as any).currency ?? "IDR",
      exchangeRate: (r as any).exchangeRate ?? "1",
      needApproval: (r as any).needApproval ?? false,
      currentApprovalLevel: (r as any).currentApprovalLevel ?? 0,
      approvalWorkflowId: (r as any).approvalWorkflowId ?? null,
      globalDiscountPercent: (r as any).globalDiscountPercent ?? "0",
      additionalCharges: (r as any).additionalCharges ?? [],
      taxRate: (r as any).taxRate ?? "0",
      taxCategoryId: (r as any).taxCategoryId ?? null,
      createdBy: r.createdBy,
      branchId: r.branchId,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    const supplierIds = [...new Set(out.map((o) => o.supplierId).filter(Boolean))] as number[];
    const warehouseIds = [...new Set(out.map((o) => o.warehouseId).filter(Boolean))] as number[];
    const branchIds = [...new Set(out.map((o:any)=> o.branchId).filter(Boolean))] as number[];
    const taxCatIds = [...new Set(out.map((o:any)=> o.taxCategoryId).filter(Boolean))] as number[];
    if (supplierIds.length) {
      const sups = await db.select({ id: s.suppliers.id, publicId: s.suppliers.publicId }).from(s.suppliers).where(inArray(s.suppliers.id, supplierIds));
      const map = new Map(sups.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.supplierId = map.get(o.supplierId) ?? (o.supplierId ? String(o.supplierId) : null); });
    } else { out.forEach((o:any)=>{ if(o.supplierId) o.supplierId = String(o.supplierId); }); }
    if (warehouseIds.length) {
      const whs = await db.select({ id: s.warehouses.id, publicId: s.warehouses.publicId }).from(s.warehouses).where(inArray(s.warehouses.id, warehouseIds));
      const map = new Map(whs.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.warehouseId = map.get(o.warehouseId) ?? o.warehouseId; });
    }
    if (branchIds.length) {
      const brs = await db.select({ id: s.branches.id, publicId: s.branches.publicId }).from(s.branches).where(inArray(s.branches.id, branchIds));
      const map = new Map(brs.map((x) => [x.id, x.publicId]));
      out.forEach((o: any) => { o.branchId = map.get(o.branchId) ?? (o.branchId ? String(o.branchId) : null); });
    }
    if (taxCatIds.length) {
      const cats = await db.select({ id: (s as any).taxCategories.id, publicId: (s as any).taxCategories.publicId, name: (s as any).taxCategories.name, percentage: (s as any).taxCategories.percentage }).from((s as any).taxCategories).where(inArray((s as any).taxCategories.id, taxCatIds));
      const map = new Map(cats.map((x:any)=> [x.id, x]));
      out.forEach((o:any)=> {
        const cat = map.get(o.taxCategoryId);
        if (cat) { o.taxCategoryId = cat.publicId; o.taxCategoryName = cat.name; o.taxCategoryPercentage = String(cat.percentage); }
        else if(o.taxCategoryId) o.taxCategoryId = String(o.taxCategoryId);
      });
    }
    res.json(out);
  } catch (e) { next(e); }
});

// GET /material-requests/:id
materialRequestRouter.get("/material-requests/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "view"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [row] = await db.select().from(s.materialRequests).where(where).limit(1);
    if (!row) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    const lines = await mrLines(db, row.id);
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
    const mappedLines = lines.map((l: any) => ({ ...l, id: l.publicId, _internalId: l.id, materialRequestId: row.publicId, itemId: itemMap.get(l.itemId) ?? l.itemId, uomId: l.uomId ? (uomMap.get(l.uomId) ?? l.uomId) : null }));
    const [warehouse] = row.warehouseId ? await db.select({ publicId: s.warehouses.publicId }).from(s.warehouses).where(eq(s.warehouses.id, row.warehouseId)).limit(1) : [];
    const [branch] = (row as any).branchId ? await db.select({ publicId: s.branches.publicId }).from(s.branches).where(eq(s.branches.id, (row as any).branchId)).limit(1) : [];
    let taxCategoryPublicId: string | null = null;
    let taxCategoryName: string | null = null;
    let taxCategoryPercentage: string | null = null;
    if ((row as any).taxCategoryId) {
      const [cat] = await db.select({ publicId: (s as any).taxCategories.publicId, name: (s as any).taxCategories.name, percentage: (s as any).taxCategories.percentage }).from((s as any).taxCategories).where(eq((s as any).taxCategories.id, (row as any).taxCategoryId)).limit(1);
      if (cat) { taxCategoryPublicId = cat.publicId; taxCategoryName = cat.name; taxCategoryPercentage = String(cat.percentage); }
    }
    let approvalWorkflowPublicId: string | null = null;
    if ((row as any).approvalWorkflowId) {
      const [wf] = await db.select({ publicId: s.workflows.publicId }).from(s.workflows).where(eq(s.workflows.id, (row as any).approvalWorkflowId)).limit(1);
      if (wf) approvalWorkflowPublicId = wf.publicId;
    }
    let preparedByPublicId: string | null = null;
    let preparedByName: string | null = null;
    if ((row as any).preparedBy) {
      const [u] = await db.select({ publicId: s.users.publicId, name: s.users.name }).from(s.users).where(eq(s.users.id, (row as any).preparedBy)).limit(1);
      if (u) { preparedByPublicId = u.publicId; preparedByName = u.name; }
    }
    let approvedByPublicId: string | null = null;
    let approvedByName: string | null = null;
    if ((row as any).approvedBy) {
      const [u] = await db.select({ publicId: s.users.publicId, name: s.users.name }).from(s.users).where(eq(s.users.id, (row as any).approvedBy)).limit(1);
      if (u) { approvedByPublicId = u.publicId; approvedByName = u.name; }
    }
    res.json({
      id: row.publicId,
      publicId: row.publicId,
      _internalId: row.id,
      documentNo: row.documentNo,
      mrNo: row.documentNo,
      warehouseId: warehouse?.publicId ?? row.warehouseId,
      requestDate: row.requestDate,
      expectedDate: row.expectedDate,
      urgency: (row as any).urgency,
      status: row.status,
      notes: row.notes,
      department: (row as any).department ?? null,
      costCenter: (row as any).costCenter ?? null,
      currency: (row as any).currency ?? "IDR",
      exchangeRate: (row as any).exchangeRate ?? "1",
      needApproval: (row as any).needApproval ?? false,
      currentApprovalLevel: (row as any).currentApprovalLevel ?? 0,
      approvalWorkflowId: approvalWorkflowPublicId,
      preparedSignature: (row as any).preparedSignature ?? null,
      preparedSignedAt: (row as any).preparedSignedAt ?? null,
      preparedBy: preparedByPublicId,
      preparedByName,
      approvedSignature: (row as any).approvedSignature ?? null,
      approvedSignedAt: (row as any).approvedSignedAt ?? null,
      approvedBy: approvedByPublicId,
      approvedByName,
      globalDiscountPercent: (row as any).globalDiscountPercent ?? "0",
      additionalCharges: (row as any).additionalCharges ?? [],
      taxRate: (row as any).taxRate ?? "0",
      taxCategoryId: taxCategoryPublicId,
      taxCategoryName,
      taxCategoryPercentage,
      createdBy: row.createdBy,
      branchId: branch?.publicId ?? (row as any).branchId ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lines: mappedLines,
    });
  } catch (e) { next(e); }
});

putAndPatch("/material-requests/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [cur] = await db.select({ id: s.materialRequests.id, status: s.materialRequests.status }).from(s.materialRequests).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya PR berstatus DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) { try { validateRequireUnitPrice(b.lines, "MR"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); } }
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = await resolveInternalId(s.warehouses, String(b.warehouseId));
    if (b.requestDate !== undefined) patch.requestDate = b.requestDate;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.urgency !== undefined) patch.urgency = b.urgency ? String(b.urgency).toUpperCase() : "MEDIUM";
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.department !== undefined) patch.department = b.department ? String(b.department).trim() : null;
    if (b.costCenter !== undefined) patch.costCenter = b.costCenter ? String(b.costCenter).trim() : null;
    if (b.branchId !== undefined) patch.branchId = b.branchId ? await resolveInternalId(s.branches, String(b.branchId)) : null;
    if (b.needApproval !== undefined) patch.needApproval = !!b.needApproval;
    if (b.globalDiscountPercent !== undefined) {
      const v = Number(b.globalDiscountPercent);
      if (b.globalDiscountPercent === null || String(b.globalDiscountPercent).trim() === "") patch.globalDiscountPercent = "0";
      else if (!Number.isFinite(v) || v < 0 || v > 100) return res.status(400).json({ error: "globalDiscountPercent harus 0-100." });
      else patch.globalDiscountPercent = String(v);
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
    if (b.taxCategoryId !== undefined) {
      if (b.taxCategoryId == null || String(b.taxCategoryId).trim() === "") { patch.taxCategoryId = null; patch.taxRate = "0"; }
      else {
        const tid = await resolveInternalId((s as any).taxCategories, String(b.taxCategoryId));
        if (!tid) return res.status(400).json({ error: "taxCategoryId tidak valid." });
        patch.taxCategoryId = tid;
        const [cat] = await db.select({ percentage: (s as any).taxCategories.percentage }).from((s as any).taxCategories).where(eq((s as any).taxCategories.id, tid)).limit(1);
        if (cat) patch.taxRate = String(cat.percentage);
      }
    }
    patch.updatedAt = new Date();
    await db.update(s.materialRequests).set(patch).where(eq(s.materialRequests.id, cur.id));
    if (Array.isArray(b.lines)) await db.transaction(async (tx) => { await replaceMrLines(tx, cur.id, b.lines); });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

materialRequestRouter.delete("/material-requests/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [cur] = await db.select({ id: s.materialRequests.id }).from(s.materialRequests).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    await db.delete(s.materialRequests).where(eq(s.materialRequests.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

materialRequestRouter.post("/material-requests/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [cur] = await db.select({ id: s.materialRequests.id, status: s.materialRequests.status, needApproval: (s.materialRequests as any).needApproval }).from(s.materialRequests).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya PR berstatus DRAFT yang dapat diposting." });
    const needApproval = !!(cur as any).needApproval;
    if (!needApproval) {
      await db.update(s.materialRequests).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
      return res.json({ ok: true });
    }
    const [wf] = await db.select({ id: s.workflows.id }).from(s.workflows).where(and(eq(s.workflows.documentType, "MR"), eq(s.workflows.isDefault, true), eq(s.workflows.isActive, true))).limit(1);
    if (!wf) {
      await db.update(s.materialRequests).set({ status: "APPROVED", updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
      return res.json({ ok: true });
    }
    const intermediate = await db.select().from(s.workflowStates).where(and(eq(s.workflowStates.workflowId, wf.id), eq((s.workflowStates as any).type, "intermediate"))).then((rows:any)=> rows.sort((a:any,b:any)=> a.orderNo - b.orderNo));
    const levels = intermediate.length > 0 ? intermediate : await db.select().from(s.workflowStates).where(eq(s.workflowStates.workflowId, wf.id)).then((rows:any)=> rows.sort((a:any,b:any)=> a.orderNo - b.orderNo));
    if (levels.length === 0) {
      await db.update(s.materialRequests).set({ status: "APPROVED", approvalWorkflowId: wf.id, updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
      return res.json({ ok: true });
    }
    await db.update(s.materialRequests).set({ status: "PENDING_APPROVAL", currentApprovalLevel: 1, approvalWorkflowId: wf.id, updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

materialRequestRouter.post("/material-requests/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [cur] = await db.select({ id: s.materialRequests.id, status: s.materialRequests.status }).from(s.materialRequests).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "PR sudah dibatalkan." });
    await db.update(s.materialRequests).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

materialRequestRouter.post("/material-requests/:id/approve", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [cur] = await db.select({ id: s.materialRequests.id, status: s.materialRequests.status, needApproval: (s.materialRequests as any).needApproval, currentApprovalLevel: (s.materialRequests as any).currentApprovalLevel, approvalWorkflowId: (s.materialRequests as any).approvalWorkflowId }).from(s.materialRequests).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    if (!(cur as any).needApproval) return res.status(400).json({ error: "PR ini tidak membutuhkan approval." });
    if ((cur as any).status !== "PENDING_APPROVAL") return res.status(400).json({ error: "Hanya PR dengan status Pending Approval yang bisa di-approve." });
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
      const [def] = await db.select({ id: s.workflows.id }).from(s.workflows).where(and(eq(s.workflows.documentType, "MR"), eq(s.workflows.isDefault, true), eq(s.workflows.isActive, true))).limit(1);
      wf = def;
    }
    if (!wf) {
      const [sig] = actorInternalId ? await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalId)).limit(1) : [null as any];
      await db.update(s.materialRequests).set({ status: "APPROVED", approvedSignature: sig?.signatureData ?? null, approvedSignedAt: sig ? new Date() : null, approvedBy: actorInternalId, updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
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
      await db.update(s.materialRequests).set({ status: "APPROVED", currentApprovalLevel: 0, approvedSignature: sig?.signatureData ?? null, approvedSignedAt: sig ? new Date() : null, approvedBy: actorInternalId, updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
      return res.json({ ok: true });
    }
    const [sigRow] = actorInternalId ? await db.select({ signatureData: s.userSignatures.signatureData }).from(s.userSignatures).where(eq(s.userSignatures.userId, actorInternalId)).limit(1) : [null as any];
    if (current >= total) {
      await db.update(s.materialRequests).set({ status: "APPROVED", currentApprovalLevel: total, approvedSignature: sigRow?.signatureData ?? null, approvedSignedAt: sigRow ? new Date() : null, approvedBy: actorInternalId, updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
    } else {
      await db.update(s.materialRequests).set({ status: "PENDING_APPROVAL", currentApprovalLevel: current + 1, updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

materialRequestRouter.post("/material-requests/:id/reject", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.materialRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [cur] = await db.select({ id: s.materialRequests.id, status: s.materialRequests.status, needApproval: (s.materialRequests as any).needApproval }).from(s.materialRequests).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    if (!(cur as any).needApproval) return res.status(400).json({ error: "PR ini tidak membutuhkan approval." });
    if ((cur as any).status !== "PENDING_APPROVAL") return res.status(400).json({ error: "Hanya PR dengan status Pending Approval yang bisa di-reject." });
    await db.update(s.materialRequests).set({ status: "REJECTED", updatedAt: new Date() }).where(eq(s.materialRequests.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// PR -> PO
materialRequestRouter.post("/material-requests/:id/create-po", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    let where: any = mrWhere(pid);
    const [pr] = await db.select().from(s.materialRequests).where(where).limit(1);
    if (!pr) return res.status(404).json({ error: "Material Request tidak ditemukan." });
    if (pr.status !== "APPROVED" && pr.status !== "POSTED") return res.status(400).json({ error: "PR harus APPROVED/POSTED untuk dibuatkan PO." });
    const lines = await mrLines(db, pr.id);
    const supplierId = req.body?.supplierId ? await resolveInternalId(s.suppliers, String(req.body.supplierId)) : null;
    if (!supplierId) return res.status(400).json({ error: "supplierId wajib untuk PO (isi di PR atau body)." });
    const { documentNo } = await db.transaction(async (tx) => {
      const doc = await nextDocumentNo(tx as any, "PO", { branchId: pr.branchId ?? undefined, date: new Date() });
      const [po] = await tx.insert(s.purchaseOrders).values({
        documentNo: doc.documentNo,
        seriesId: doc.seriesId,
        supplierId,
        warehouseId: pr.warehouseId,
        orderDate: new Date().toISOString().slice(0,10),
        expectedDate: (pr as any).expectedDate ?? null,
        status: "DRAFT",
        notes: (pr as any).notes ?? null,
        department: (pr as any).department ?? null,
        costCenter: (pr as any).costCenter ?? null,
        currency: (pr as any).currency ?? "IDR",
        exchangeRate: (pr as any).exchangeRate ?? "1",
        needApproval: false,
        globalDiscountPercent: (pr as any).globalDiscountPercent ?? "0",
        additionalCharges: (pr as any).additionalCharges ?? [],
        taxRate: (pr as any).taxRate ?? "0",
        taxCategoryId: (pr as any).taxCategoryId ?? null,
        createdBy: (req as any).user?.internalId ?? null,
        branchId: pr.branchId,
      }).returning();
      for (const l of lines) {
        await tx.insert(s.purchaseOrderLines).values({
          purchaseOrderId: po.id,
          itemId: l.itemId,
          uomId: l.uomId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount ?? "0",
          batchNumber: l.batchNumber,
          note: l.note,
          deliveryDate: l.deliveryDate,
        });
      }
      return { documentNo: doc.documentNo, id: po.id, publicId: po.publicId };
    });
    const [created] = await db.select({ publicId: s.purchaseOrders.publicId }).from(s.purchaseOrders).where(eq(s.purchaseOrders.documentNo, documentNo)).limit(1);
    res.status(201).json({ id: created.publicId, documentNo });
  } catch (e) { next(e); }
});
