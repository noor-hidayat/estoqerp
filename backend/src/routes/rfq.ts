// @ts-nocheck
import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission } from "../middleware/rbac";
import { nextDocumentNo } from "../lib/document-number";
import { logActivity, getActorInfo } from "../lib/activity-log";

export const rfqRouter = Router();

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isDocumentNo(v: string): boolean {
  return /^[A-Z]{2,5}-\d{2,4}-?\d{1,6}$/i.test(v) || /^[A-Z]{2,5}-\d{4,}-\d+$/i.test(v) || /^[A-Z]+\-\d+.*$/i.test(v);
}
function rfqWhere(pid: string) {
  if (isUuid(pid)) return eq(s.rfqs.publicId, pid);
  if (isDocumentNo(pid)) return eq(s.rfqs.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(s.rfqs.id, Number(pid));
  return eq(s.rfqs.documentNo, pid);
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
async function resolveManyInternalIds(table: any, ids: (string|number)[]): Promise<number[]> {
  const out: number[] = [];
  for (const v of ids) {
    const r = await resolveInternalId(table, v as any);
    if (r !== null) out.push(r);
  }
  return out;
}

async function rfqLinesTx(tx: any, rfqId: number) {
  return tx.select().from(s.rfqLines).where(eq(s.rfqLines.rfqId, rfqId));
}
async function replaceRfqLines(tx: any, rfqId: number, lines: any[]) {
  await tx.delete(s.rfqLines).where(eq(s.rfqLines.rfqId, rfqId));
  for (const l of lines) {
    const itemId = await resolveInternalId(s.items, l.itemId);
    const uomId = await resolveInternalId(s.uom, l.uomId);
    if (!itemId || !uomId) throw new Error(`Item/UOM tidak valid pada baris RFQ`);
    const qtyNum = Number(l.qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) throw new Error(`Qty baris RFQ harus >0`);
    await tx.insert(s.rfqLines).values({
      rfqId,
      itemId,
      uomId,
      qty: String(l.qty),
      note: l.note ?? null,
    });
  }
}
async function replaceRfqSuppliers(tx: any, rfqId: number, supplierIds: string[]) {
  await tx.delete(s.rfqSuppliers).where(eq(s.rfqSuppliers.rfqId, rfqId));
  for (const sid of supplierIds) {
    const internal = await resolveInternalId(s.suppliers, sid);
    if (!internal) throw new Error(`Supplier ${sid} tidak valid`);
    await tx.insert(s.rfqSuppliers).values({
      rfqId,
      supplierId: internal,
      status: "INVITED",
    });
  }
}

// Validate sisa qty PR: sum rfq lines for this PR <= PR line qty
async function validateRfqAgainstPr(tx: any, prId: number, newLines: any[]) {
  const prLines = await tx.select().from(s.purchaseRequestLines).where(eq(s.purchaseRequestLines.purchaseRequestId, prId));
  const prMap = new Map<number, number>();
  prLines.forEach((pl: any) => {
    const prev = prMap.get(pl.itemId) ?? 0;
    prMap.set(pl.itemId, prev + Number(pl.qty));
  });
  // existing rfqs for this PR (exclude current rfq if editing? We'll sum all)
  const existingRfqs = await tx.select({ id: s.rfqs.id }).from(s.rfqs).where(eq(s.rfqs.purchaseRequestId, prId));
  const rfqIds = existingRfqs.map((r: any) => r.id);
  let existingMap = new Map<number, number>();
  if (rfqIds.length) {
    const existingLines = await tx.select().from(s.rfqLines).where(inArray(s.rfqLines.rfqId, rfqIds));
    existingLines.forEach((l: any) => {
      const prev = existingMap.get(l.itemId) ?? 0;
      existingMap.set(l.itemId, prev + Number(l.qty));
    });
  }
  // Also consider PO lines already created from PR? Try to find POs that were created from PR via activity log? Simpler: check purchaseOrders where branchId & warehouse same and created after PR? Not accurate.
  // For MVP, only check RFQ sum + newLines <= PR qty. We subtract existing for edit case via caller handling.
  for (const nl of newLines) {
    const itemInternal = await resolveInternalId(s.items, nl.itemId);
    if (!itemInternal) continue;
    const prQty = prMap.get(itemInternal) ?? 0;
    if (prQty === 0) throw new Error(`Item ${nl.itemId} tidak ada di PR`);
    const existingQty = existingMap.get(itemInternal) ?? 0;
    const newQty = Number(nl.qty);
    // Note: caller for edit should subtract current rfq's old qty; we approximate by allowing equal
    // For create, existingMap is total existing, newLines should not exceed prQty - existingQty
    // But if we included current rfq in existingMap, we double count. So for update we need to handle separately.
    // Here we assume create path: check new total
    // We'll throw if existing + new > prQty
    if (existingQty + newQty > prQty + 1e-6) {
      throw new Error(`Qty item melebihi PR. PR qty ${prQty}, sudah dialokasikan ${existingQty}, diminta ${newQty}`);
    }
  }
}

// POST /rfqs
rfqRouter.post("/rfqs", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.warehouseId || !b.requestDate) return res.status(400).json({ error: "warehouseId, requestDate wajib." });
    if (!Array.isArray(b.lines) || b.lines.length === 0) return res.status(400).json({ error: "lines wajib minimal 1." });
    if (!Array.isArray(b.supplierIds) || b.supplierIds.length === 0) return res.status(400).json({ error: "supplierIds wajib minimal 1." });
    const warehouseId = await resolveInternalId(s.warehouses, b.warehouseId);
    if (!warehouseId) return res.status(400).json({ error: "warehouseId tidak valid." });
    const branchId = b.branchId ? await resolveInternalId(s.branches, b.branchId) : null;
    let purchaseRequestId: number | null = null;
    if (b.purchaseRequestId) {
      purchaseRequestId = await resolveInternalId(s.purchaseRequests, b.purchaseRequestId);
      if (!purchaseRequestId) return res.status(400).json({ error: "purchaseRequestId tidak valid." });
      const [pr] = await db.select({ status: s.purchaseRequests.status }).from(s.purchaseRequests).where(eq(s.purchaseRequests.id, purchaseRequestId)).limit(1);
      if (!pr) return res.status(404).json({ error: "PR tidak ditemukan." });
      if (!["APPROVED", "POSTED"].includes(String(pr.status).toUpperCase())) return res.status(400).json({ error: "PR harus APPROVED/POSTED untuk dibuatkan RFQ." });
    }
    // validate lines item/uom
    for (let i=0;i<b.lines.length;i++) {
      const l=b.lines[i];
      if (!l.itemId || !l.uomId || !l.qty) return res.status(400).json({ error: `Line ${i+1}: itemId, uomId, qty wajib.` });
    }
    const supplierIds = [...new Set(b.supplierIds.map((v:any)=> String(v)))];
    if (supplierIds.length === 0) return res.status(400).json({ error: "supplierIds minimal 1." });
    // validate suppliers exist
    for (const sid of supplierIds) {
      const iid = await resolveInternalId(s.suppliers, sid);
      if (!iid) return res.status(400).json({ error: `Supplier ${sid} tidak ditemukan.` });
    }
    const actor = await getActorInfo(req);
    const { documentNo, seriesId, id: newId, publicId } = await db.transaction(async (tx) => {
      if (purchaseRequestId) {
        // For create, validate against PR total existing + new
        // We do check before insert
        const prLines = await tx.select().from(s.purchaseRequestLines).where(eq(s.purchaseRequestLines.purchaseRequestId, purchaseRequestId as number));
        const prMap = new Map<number, number>();
        prLines.forEach((pl:any)=> prMap.set(pl.itemId, (prMap.get(pl.itemId)??0)+Number(pl.qty)));
        const existingRfqs = await tx.select({ id: s.rfqs.id }).from(s.rfqs).where(eq(s.rfqs.purchaseRequestId, purchaseRequestId as number));
        const rfqIds = existingRfqs.map((r:any)=> r.id);
        let existingMap = new Map<number, number>();
        if (rfqIds.length) {
          const existingLines = await tx.select().from(s.rfqLines).where(inArray(s.rfqLines.rfqId, rfqIds));
          existingLines.forEach((l:any)=> existingMap.set(l.itemId, (existingMap.get(l.itemId)??0)+Number(l.qty)));
        }
        for (const nl of b.lines) {
          const itemInternal = await resolveInternalId(s.items, nl.itemId);
          if (!itemInternal) throw new Error(`Item ${nl.itemId} tidak valid`);
          const prQty = prMap.get(itemInternal) ?? 0;
          if (prQty===0) throw new Error(`Item ${nl.itemId} tidak ada di PR`);
          const existingQty = existingMap.get(itemInternal) ?? 0;
          const newQty = Number(nl.qty);
          if (existingQty + newQty > prQty + 1e-6) throw new Error(`Qty item melebihi PR. PR qty ${prQty}, sudah dialokasikan RFQ ${existingQty}, diminta ${newQty}`);
        }
      }
      const doc = await nextDocumentNo(tx as any, "RFQ", { branchId: branchId ?? undefined, date: b.requestDate ? new Date(b.requestDate) : new Date() });
      const [ins] = await tx.insert(s.rfqs).values({
        documentNo: doc.documentNo,
        seriesId: doc.seriesId,
        purchaseRequestId,
        warehouseId,
        requestDate: b.requestDate,
        quotationDeadline: b.quotationDeadline ?? null,
        expectedDate: b.expectedDate ?? null,
        status: "DRAFT",
        notes: b.notes ?? null,
        currency: b.currency ? String(b.currency).toUpperCase() : "IDR",
        createdBy: actor.internalId ?? null,
        branchId,
      }).returning();
      await replaceRfqLines(tx, ins.id, b.lines);
      await replaceRfqSuppliers(tx, ins.id, supplierIds);
      return { documentNo: doc.documentNo, seriesId: doc.seriesId, id: ins.id, publicId: ins.publicId };
    });
    try { await logActivity({ documentType: "RFQ", documentId: newId, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: actor.internalId, actorRole: actor.role, metadata: { documentNo } }); } catch {}
    res.status(201).json({ id: publicId, documentNo, seriesId });
  } catch (e: any) {
    const msg = e?.message ?? "";
    if (msg.includes("Qty item melebihi") || msg.includes("tidak ada di PR") || msg.includes("tidak valid")) {
      return res.status(400).json({ error: msg });
    }
    next(e);
  }
});

// GET /rfqs
rfqRouter.get("/rfqs", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.rfqs.status as any, String(req.query.status)));
    if (req.query.warehouseId) {
      const wid = await resolveInternalId(s.warehouses, String(req.query.warehouseId));
      if (wid) conds.push(eq(s.rfqs.warehouseId, wid));
    }
    if (req.query.purchaseRequestId) {
      const prid = await resolveInternalId(s.purchaseRequests, String(req.query.purchaseRequestId));
      if (prid) conds.push(eq(s.rfqs.purchaseRequestId, prid));
    }
    const rows = await db.select().from(s.rfqs).where(conds.length ? and(...conds) : undefined).orderBy(desc(s.rfqs.requestDate));
    // enrich warehouseId, purchaseRequestId to publicId
    const warehouseIds = [...new Set(rows.map(r=> r.warehouseId).filter(Boolean))] as number[];
    const prIds = [...new Set(rows.map(r=> r.purchaseRequestId).filter(Boolean))] as number[];
    const supplierIds = rows.map(r=> r.awardedSupplierId).filter(Boolean) as number[];
    let whMap = new Map<number,string>();
    let prMap = new Map<number,string>();
    let supMap = new Map<number,string>();
    if (warehouseIds.length) {
      const whs = await db.select({ id: s.warehouses.id, publicId: s.warehouses.publicId }).from(s.warehouses).where(inArray(s.warehouses.id, warehouseIds));
      whs.forEach(x=> whMap.set(x.id, x.publicId));
    }
    if (prIds.length) {
      const prs = await db.select({ id: s.purchaseRequests.id, publicId: s.purchaseRequests.publicId }).from(s.purchaseRequests).where(inArray(s.purchaseRequests.id, prIds));
      prs.forEach(x=> prMap.set(x.id, x.publicId));
    }
    if (supplierIds.length) {
      const sups = await db.select({ id: s.suppliers.id, publicId: s.suppliers.publicId }).from(s.suppliers).where(inArray(s.suppliers.id, supplierIds));
      sups.forEach(x=> supMap.set(x.id, x.publicId));
    }
    // count lines & suppliers & quotations per RFQ
    const out = [];
    for (const r of rows) {
      const [lineCount] = await db.select({ count: s.rfqLines.id }).from(s.rfqLines).where(eq(s.rfqLines.rfqId, r.id)).then(rows=> [{count: rows.length}]);
      // Actually need proper count query
    }
    // simplify: for each row fetch counts
    const enriched = await Promise.all(rows.map(async (r)=> {
      const lines = await db.select().from(s.rfqLines).where(eq(s.rfqLines.rfqId, r.id));
      const suppliers = await db.select().from(s.rfqSuppliers).where(eq(s.rfqSuppliers.rfqId, r.id));
      const quotes = await db.select().from(s.supplierQuotations).where(eq(s.supplierQuotations.rfqId, r.id));
      return {
        id: r.publicId,
        publicId: r.publicId,
        _internalId: r.id,
        documentNo: r.documentNo,
        warehouseId: whMap.get(r.warehouseId) ?? String(r.warehouseId),
        purchaseRequestId: r.purchaseRequestId ? (prMap.get(r.purchaseRequestId) ?? String(r.purchaseRequestId)) : null,
        requestDate: r.requestDate,
        quotationDeadline: r.quotationDeadline,
        expectedDate: r.expectedDate,
        status: r.status,
        notes: r.notes,
        currency: r.currency,
        awardedSupplierId: r.awardedSupplierId ? (supMap.get(r.awardedSupplierId) ?? String(r.awardedSupplierId)) : null,
        awardedAt: r.awardedAt,
        branchId: r.branchId,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        linesCount: lines.length,
        suppliersCount: suppliers.length,
        quotationsCount: quotes.length,
      };
    }));
    res.json(enriched);
  } catch (e) { next(e); }
});

// GET /rfqs/:id
rfqRouter.get("/rfqs/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "view"))) return;
  try {
    const pid = String(req.params.id);
    const [row] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!row) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    const lines = await db.select().from(s.rfqLines).where(eq(s.rfqLines.rfqId, row.id));
    const suppliers = await db.select().from(s.rfqSuppliers).where(eq(s.rfqSuppliers.rfqId, row.id));
    const quotations = await db.select().from(s.supplierQuotations).where(eq(s.supplierQuotations.rfqId, row.id));
    // map ids to publicId
    const itemIds = [...new Set(lines.map(l=> l.itemId))];
    const uomIds = [...new Set(lines.map(l=> l.uomId))];
    let itemMap = new Map<number,string>();
    let uomMap = new Map<number,string>();
    if (itemIds.length) {
      const items = await db.select({ id: s.items.id, publicId: s.items.publicId, code: s.items.code, name: s.items.name }).from(s.items).where(inArray(s.items.id, itemIds));
      items.forEach(it=> itemMap.set(it.id, it.publicId));
    }
    if (uomIds.length) {
      const uoms = await db.select({ id: s.uom.id, publicId: s.uom.publicId }).from(s.uom).where(inArray(s.uom.id, uomIds as number[]));
      uoms.forEach(u=> uomMap.set(u.id, u.publicId));
    }
    // suppliers mapping
    const supIds = suppliers.map(su=> su.supplierId);
    let supMap = new Map<number, {publicId:string, name:string, code:string}>();
    if (supIds.length) {
      const sups = await db.select({ id: s.suppliers.id, publicId: s.suppliers.publicId, name: s.suppliers.name, code: s.suppliers.code }).from(s.suppliers).where(inArray(s.suppliers.id, supIds));
      sups.forEach(sup=> supMap.set(sup.id, {publicId: sup.publicId, name: sup.name, code: sup.code}));
    }
    const whSup = row.warehouseId ? await db.select({ publicId: s.warehouses.publicId, name: s.warehouses.name }).from(s.warehouses).where(eq(s.warehouses.id, row.warehouseId)).limit(1).then(r=> r[0]) : null;
    const prSup = row.purchaseRequestId ? await db.select({ publicId: s.purchaseRequests.publicId, documentNo: s.purchaseRequests.documentNo }).from(s.purchaseRequests).where(eq(s.purchaseRequests.id, row.purchaseRequestId)).limit(1).then(r=> r[0]) : null;
    const awardedSup = row.awardedSupplierId ? supMap.get(row.awardedSupplierId) ?? null : null;

    // quotations detail with lines
    const quotDetails = await Promise.all(quotations.map(async (q)=> {
      const qLines = await db.select().from(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, q.id));
      const supInfo = supMap.get(q.supplierId) ?? (await db.select({ publicId: s.suppliers.publicId, name: s.suppliers.name }).from(s.suppliers).where(eq(s.suppliers.id, q.supplierId)).limit(1).then(r=> r[0] ? {publicId:r[0].publicId, name:r[0].name, code:""} : null));
      return {
        id: q.publicId,
        _internalId: q.id,
        rfqId: row.publicId,
        supplierId: supInfo?.publicId ?? String(q.supplierId),
        supplierName: supInfo?.name ?? "",
        quotationNo: q.quotationNo,
        quotationDate: q.quotationDate,
        validUntil: q.validUntil,
        currency: q.currency,
        notes: q.notes,
        status: q.status,
        totalAmount: q.totalAmount,
        deliveryLeadTime: q.deliveryLeadTime,
        paymentTerm: q.paymentTerm,
        createdAt: q.createdAt,
        lines: qLines.map(ql=> ({
          id: ql.publicId,
          _internalId: ql.id,
          rfqLineId: ql.rfqLineId,
          itemId: itemMap.get(ql.itemId) ?? String(ql.itemId),
          uomId: uomMap.get(ql.uomId) ?? String(ql.uomId),
          qty: ql.qty,
          unitPrice: ql.unitPrice,
          discount: ql.discount,
          subtotal: ql.subtotal,
          note: ql.note,
        })),
      };
    }));

    res.json({
      id: row.publicId,
      publicId: row.publicId,
      _internalId: row.id,
      documentNo: row.documentNo,
      warehouseId: whSup?.publicId ?? String(row.warehouseId),
      warehouseName: whSup?.name ?? null,
      purchaseRequestId: prSup?.publicId ?? (row.purchaseRequestId ? String(row.purchaseRequestId) : null),
      purchaseRequestNo: prSup?.documentNo ?? null,
      requestDate: row.requestDate,
      quotationDeadline: row.quotationDeadline,
      expectedDate: row.expectedDate,
      status: row.status,
      notes: row.notes,
      currency: row.currency,
      awardedSupplierId: awardedSup?.publicId ?? (row.awardedSupplierId ? String(row.awardedSupplierId) : null),
      awardedSupplierName: (awardedSup as any)?.name ?? null,
      awardedAt: row.awardedAt,
      branchId: row.branchId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lines: lines.map(l=> ({
        id: l.publicId,
        _internalId: l.id,
        rfqId: row.publicId,
        itemId: itemMap.get(l.itemId) ?? String(l.itemId),
        uomId: uomMap.get(l.uomId) ?? String(l.uomId),
        qty: l.qty,
        note: l.note,
      })),
      suppliers: suppliers.map(su=> {
        const info = supMap.get(su.supplierId);
        return {
          id: su.publicId,
          _internalId: su.id,
          rfqId: row.publicId,
          supplierId: info?.publicId ?? String(su.supplierId),
          supplierName: info?.name ?? "",
          supplierCode: info?.code ?? "",
          status: su.status,
        };
      }),
      quotations: quotDetails,
    });
  } catch (e) { next(e); }
});

// PATCH /rfqs/:id (only DRAFT)
rfqRouter.patch("/rfqs/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [cur] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!cur) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya RFQ DRAFT yang bisa diubah." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) {
      const wid = await resolveInternalId(s.warehouses, String(b.warehouseId));
      if (!wid) return res.status(400).json({ error: "warehouseId tidak valid." });
      patch.warehouseId = wid;
    }
    if (b.requestDate !== undefined) patch.requestDate = b.requestDate;
    if (b.quotationDeadline !== undefined) patch.quotationDeadline = b.quotationDeadline ?? null;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.currency !== undefined) patch.currency = String(b.currency).toUpperCase();
    if (b.branchId !== undefined) patch.branchId = b.branchId ? await resolveInternalId(s.branches, String(b.branchId)) : null;
    patch.updatedAt = new Date();
    await db.update(s.rfqs).set(patch).where(eq(s.rfqs.id, cur.id));
    if (Array.isArray(b.lines)) {
      // validate against PR if exists, excluding current rfq's old allocation
      if (cur.purchaseRequestId) {
        const prId = cur.purchaseRequestId;
        const prLines = await db.select().from(s.purchaseRequestLines).where(eq(s.purchaseRequestLines.purchaseRequestId, prId));
        const prMap = new Map<number, number>();
        prLines.forEach((pl:any)=> prMap.set(pl.itemId, (prMap.get(pl.itemId)??0)+Number(pl.qty)));
        const existingRfqs = await db.select({ id: s.rfqs.id }).from(s.rfqs).where(eq(s.rfqs.purchaseRequestId, prId));
        const otherRfqIds = existingRfqs.filter((r:any)=> r.id !== cur.id).map((r:any)=> r.id);
        let existingMap = new Map<number, number>();
        if (otherRfqIds.length) {
          const existingLines = await db.select().from(s.rfqLines).where(inArray(s.rfqLines.rfqId, otherRfqIds));
          existingLines.forEach((l:any)=> existingMap.set(l.itemId, (existingMap.get(l.itemId)??0)+Number(l.qty)));
        }
        for (const nl of b.lines) {
          const itemInternal = await resolveInternalId(s.items, nl.itemId);
          if (!itemInternal) return res.status(400).json({ error: `Item ${nl.itemId} tidak valid` });
          const prQty = prMap.get(itemInternal) ?? 0;
          if (prQty===0) return res.status(400).json({ error: `Item ${nl.itemId} tidak ada di PR` });
          const existingQty = existingMap.get(itemInternal) ?? 0;
          const newQty = Number(nl.qty);
          if (existingQty + newQty > prQty + 1e-6) return res.status(400).json({ error: `Qty melebihi PR. PR qty ${prQty}, sudah di RFQ lain ${existingQty}, diminta ${newQty}` });
        }
      }
      await db.transaction(async (tx)=> { await replaceRfqLines(tx, cur.id, b.lines); });
    }
    if (Array.isArray(b.supplierIds)) {
      const supplierIds = [...new Set(b.supplierIds.map((v:any)=> String(v)))];
      // validate
      for (const sid of supplierIds) {
        const iid = await resolveInternalId(s.suppliers, sid);
        if (!iid) return res.status(400).json({ error: `Supplier ${sid} tidak valid` });
      }
      await db.transaction(async (tx)=> { await replaceRfqSuppliers(tx, cur.id, supplierIds);
        // also remove quotations for suppliers no longer invited? Keep but maybe delete orphaned
        const currentQuotes = await tx.select().from(s.supplierQuotations).where(eq(s.supplierQuotations.rfqId, cur.id));
        for (const q of currentQuotes) {
          const supPublic = await db.select({ publicId: s.suppliers.publicId }).from(s.suppliers).where(eq(s.suppliers.id, q.supplierId)).limit(1).then(r=> r[0]?.publicId);
          if (supPublic && !supplierIds.includes(supPublic)) {
            await tx.delete(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, q.id));
            await tx.delete(s.supplierQuotations).where(eq(s.supplierQuotations.id, q.id));
          }
        }
      });
    }
    try { const actor = await getActorInfo(req); await logActivity({ documentType: "RFQ", documentId: cur.id, action: "update", fromStatus: cur.status, toStatus: cur.status, actorUserId: actor.internalId, actorRole: actor.role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /rfqs/:id/send -> DRAFT -> SENT
rfqRouter.post("/rfqs/:id/send", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [cur] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!cur) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya DRAFT yang bisa di-send." });
    const suppliers = await db.select().from(s.rfqSuppliers).where(eq(s.rfqSuppliers.rfqId, cur.id));
    if (suppliers.length===0) return res.status(400).json({ error: "Invite minimal 1 supplier sebelum send." });
    const lines = await db.select().from(s.rfqLines).where(eq(s.rfqLines.rfqId, cur.id));
    if (lines.length===0) return res.status(400).json({ error: "RFQ harus punya minimal 1 line." });
    await db.update(s.rfqs).set({ status: "SENT", updatedAt: new Date() }).where(eq(s.rfqs.id, cur.id));
    try { const actor = await getActorInfo(req); await logActivity({ documentType: "RFQ", documentId: cur.id, action: "send", fromStatus: "DRAFT", toStatus: "SENT", actorUserId: actor.internalId, actorRole: actor.role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rfqRouter.post("/rfqs/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [cur] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!cur) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "Sudah canceled." });
    if (cur.status === "CLOSED") return res.status(400).json({ error: "Sudah closed." });
    await db.update(s.rfqs).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.rfqs.id, cur.id));
    try { const actor = await getActorInfo(req); await logActivity({ documentType: "RFQ", documentId: cur.id, action: "cancel", fromStatus: cur.status, toStatus: "CANCELED", actorUserId: actor.internalId, actorRole: actor.role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rfqRouter.post("/rfqs/:id/close", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [cur] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!cur) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (cur.status === "CLOSED") return res.status(400).json({ error: "Sudah closed." });
    await db.update(s.rfqs).set({ status: "CLOSED", updatedAt: new Date() }).where(eq(s.rfqs.id, cur.id));
    try { const actor = await getActorInfo(req); await logActivity({ documentType: "RFQ", documentId: cur.id, action: "close", fromStatus: cur.status, toStatus: "CLOSED", actorUserId: actor.internalId, actorRole: actor.role }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rfqRouter.delete("/rfqs/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [cur] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!cur) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (!["DRAFT","CANCELED"].includes(cur.status)) return res.status(400).json({ error: "Hanya DRAFT/CANCELED yang bisa dihapus." });
    await db.delete(s.rfqs).where(eq(s.rfqs.id, cur.id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Quotations: POST /rfqs/:id/quotations
rfqRouter.post("/rfqs/:id/quotations", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [rfq] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (["CANCELED","CLOSED"].includes(rfq.status)) return res.status(400).json({ error: `RFQ status ${rfq.status} tidak bisa input quotation.` });
    const b = req.body ?? {};
    if (!b.supplierId) return res.status(400).json({ error: "supplierId wajib." });
    if (!b.quotationDate) return res.status(400).json({ error: "quotationDate wajib." });
    if (!Array.isArray(b.lines) || b.lines.length===0) return res.status(400).json({ error: "lines wajib." });
    const supplierInternal = await resolveInternalId(s.suppliers, b.supplierId);
    if (!supplierInternal) return res.status(400).json({ error: "supplierId tidak valid." });
    // check supplier invited
    const [invited] = await db.select().from(s.rfqSuppliers).where(and(eq(s.rfqSuppliers.rfqId, rfq.id), eq(s.rfqSuppliers.supplierId, supplierInternal))).limit(1);
    if (!invited) return res.status(400).json({ error: "Supplier belum di-invite di RFQ ini." });
    // fetch rfq lines for mapping
    const rfqLines = await db.select().from(s.rfqLines).where(eq(s.rfqLines.rfqId, rfq.id));
    const rfqLineMap = new Map<string, any>();
    for (const rl of rfqLines) {
      const itemPublic = await db.select({ publicId: s.items.publicId }).from(s.items).where(eq(s.items.id, rl.itemId)).limit(1).then(r=> r[0]?.publicId);
      if (itemPublic) rfqLineMap.set(itemPublic, rl);
      // also map by internal id string
      rfqLineMap.set(String(rl.itemId), rl);
      rfqLineMap.set(rl.publicId, rl);
    }
    // validate lines: at least one with unitPrice >0
    let hasPrice = false;
    for (const l of b.lines) {
      const p = l.unitPrice != null && String(l.unitPrice).trim()!=="" ? Number(l.unitPrice) : NaN;
      if (Number.isFinite(p) && p>0) hasPrice=true;
    }
    if (!hasPrice) return res.status(400).json({ error: "Minimal 1 line harus ada unitPrice >0" });
    const actor = await getActorInfo(req);
    const existing = await db.select().from(s.supplierQuotations).where(and(eq(s.supplierQuotations.rfqId, rfq.id), eq(s.supplierQuotations.supplierId, supplierInternal))).limit(1).then(r=> r[0]);
    let quotationId: number;
    let quotationPublicId: string;
    await db.transaction(async (tx)=>{
      if (existing) {
        await tx.update(s.supplierQuotations).set({
          quotationNo: b.quotationNo ?? null,
          quotationDate: b.quotationDate,
          validUntil: b.validUntil ?? null,
          currency: b.currency ? String(b.currency).toUpperCase() : rfq.currency,
          notes: b.notes ?? null,
          deliveryLeadTime: b.deliveryLeadTime ?? null,
          paymentTerm: b.paymentTerm ?? null,
          status: b.status ?? existing.status,
          updatedAt: new Date(),
        }).where(eq(s.supplierQuotations.id, existing.id));
        await tx.delete(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, existing.id));
        quotationId = existing.id;
        quotationPublicId = existing.publicId;
      } else {
        const [ins] = await tx.insert(s.supplierQuotations).values({
          rfqId: rfq.id,
          supplierId: supplierInternal,
          quotationNo: b.quotationNo ?? null,
          quotationDate: b.quotationDate,
          validUntil: b.validUntil ?? null,
          currency: b.currency ? String(b.currency).toUpperCase() : rfq.currency,
          notes: b.notes ?? null,
          status: b.status ?? "DRAFT",
          deliveryLeadTime: b.deliveryLeadTime ?? null,
          paymentTerm: b.paymentTerm ?? null,
          createdBy: actor.internalId ?? null,
        }).returning();
        quotationId = ins.id;
        quotationPublicId = ins.publicId;
      }
      let total = 0;
      for (const l of b.lines) {
        const itemInternal = await resolveInternalId(s.items, l.itemId);
        const uomInternal = await resolveInternalId(s.uom, l.uomId);
        if (!itemInternal || !uomInternal) throw new Error(`Item/UOM tidak valid ${l.itemId}`);
        const rfqLine = rfqLineMap.get(String(l.itemId)) ?? rfqLineMap.get(l.itemId) ?? rfqLines.find((rl:any)=> rl.itemId===itemInternal) ?? null;
        const qtyNum = Number(l.qty ?? rfqLine?.qty ?? 0);
        const priceNum = l.unitPrice != null && String(l.unitPrice).trim()!=="" ? Number(l.unitPrice) : null;
        const discountNum = l.discount != null && String(l.discount).trim()!=="" ? Number(l.discount) : 0;
        const subtotal = priceNum != null && Number.isFinite(priceNum) ? (qtyNum * priceNum - (discountNum||0)) : 0;
        if (priceNum != null) total += subtotal;
        await tx.insert(s.supplierQuotationLines).values({
          quotationId,
          rfqLineId: rfqLine?.id ?? null,
          itemId: itemInternal,
          uomId: uomInternal,
          qty: String(qtyNum),
          unitPrice: priceNum != null ? String(priceNum) : null,
          discount: String(discountNum||0),
          subtotal: String(subtotal),
          note: l.note ?? null,
        });
      }
      await tx.update(s.supplierQuotations).set({ totalAmount: String(total), updatedAt: new Date() }).where(eq(s.supplierQuotations.id, quotationId));
      // update rfq status to QUOTED if needed
      if (rfq.status === "SENT") {
        await tx.update(s.rfqs).set({ status: "QUOTED", updatedAt: new Date() }).where(eq(s.rfqs.id, rfq.id));
      }
      await tx.update(s.rfqSuppliers).set({ status: "QUOTED" }).where(and(eq(s.rfqSuppliers.rfqId, rfq.id), eq(s.rfqSuppliers.supplierId, supplierInternal)));
    });
    // update PR status? For MVP we don't auto-update PR status derived; frontend will compute.
    try { await logActivity({ documentType: "RFQ", documentId: rfq.id, action: existing ? "update_quotation" : "create_quotation", fromStatus: rfq.status, toStatus: rfq.status, actorUserId: actor.internalId, actorRole: actor.role, metadata: { supplierId: supplierInternal, quotationId } }); } catch {}
    res.status(existing ? 200 : 201).json({ id: quotationPublicId, quotationId });
  } catch (e) { next(e); }
});

rfqRouter.get("/rfqs/:id/compare", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "view"))) return;
  try {
    const pid = String(req.params.id);
    const [rfq] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    const rfqLines = await db.select().from(s.rfqLines).where(eq(s.rfqLines.rfqId, rfq.id));
    const quotations = await db.select().from(s.supplierQuotations).where(eq(s.supplierQuotations.rfqId, rfq.id));
    // build matrix: per rfqLine, per supplier price
    // fetch suppliers info
    const supIds = quotations.map(q=> q.supplierId);
    let supMap = new Map<number, {publicId:string,name:string}>();
    if (supIds.length) {
      const sups = await db.select({ id: s.suppliers.id, publicId: s.suppliers.publicId, name: s.suppliers.name }).from(s.suppliers).where(inArray(s.suppliers.id, supIds));
      sups.forEach(sup=> supMap.set(sup.id, {publicId: sup.publicId, name: sup.name}));
    }
    const itemMap = new Map<number, {publicId:string, code:string, name:string}>();
    const uomMap = new Map<number, {publicId:string, name:string}>();
    const itemIds = [...new Set(rfqLines.map(l=> l.itemId))];
    if (itemIds.length) {
      const items = await db.select({ id: s.items.id, publicId: s.items.publicId, code: s.items.code, name: s.items.name }).from(s.items).where(inArray(s.items.id, itemIds));
      items.forEach(it=> itemMap.set(it.id, {publicId: it.publicId, code: it.code, name: it.name}));
    }
    const uomIds = [...new Set(rfqLines.map(l=> l.uomId))];
    if (uomIds.length) {
      const uoms = await db.select({ id: s.uom.id, publicId: s.uom.publicId, name: s.uom.name }).from(s.uom).where(inArray(s.uom.id, uomIds as number[]));
      uoms.forEach(u=> uomMap.set(u.id, {publicId: u.publicId, name: u.name}));
    }
    // per quotation lines
    const qLinesByQuot = new Map<number, any[]>();
    for (const q of quotations) {
      const qLines = await db.select().from(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, q.id));
      qLinesByQuot.set(q.id, qLines);
    }
    // build per line cheapest
    const linesMatrix = rfqLines.map(rl=> {
      const itemInfo = itemMap.get(rl.itemId);
      const uomInfo = uomMap.get(rl.uomId);
      const perSupplier = quotations.map(q=> {
        const qLines = qLinesByQuot.get(q.id) ?? [];
        const match = qLines.find((ql:any)=> ql.rfqLineId === rl.id || ql.itemId === rl.itemId);
        const supInfo = supMap.get(q.supplierId);
        return {
          quotationId: q.publicId,
          supplierId: supInfo?.publicId ?? String(q.supplierId),
          supplierName: supInfo?.name ?? "",
          quotationStatus: q.status,
          unitPrice: match?.unitPrice ?? null,
          discount: match?.discount ?? "0",
          subtotal: match?.subtotal ?? null,
          qty: match?.qty ?? rl.qty,
        };
      });
      // find cheapest subtotal
      let cheapestSupplierId: string | null = null;
      let min = Infinity;
      perSupplier.forEach(ps=> {
        const st = ps.subtotal != null ? Number(ps.subtotal) : NaN;
        if (Number.isFinite(st) && st>0 && st < min) { min = st; cheapestSupplierId = ps.supplierId; }
      });
      return {
        rfqLineId: rl.publicId,
        _internalId: rl.id,
        itemId: itemInfo?.publicId ?? String(rl.itemId),
        itemCode: itemInfo?.code ?? "",
        itemName: itemInfo?.name ?? "",
        uomId: uomInfo?.publicId ?? String(rl.uomId),
        uomName: uomInfo?.name ?? "",
        qty: rl.qty,
        note: rl.note,
        perSupplier,
        cheapestSupplierId,
      };
    });
    // grand totals per supplier
    const totals = quotations.map(q=> {
      const qLines = qLinesByQuot.get(q.id) ?? [];
      const total = qLines.reduce((sum:any, ql:any)=> sum + (ql.subtotal != null ? Number(ql.subtotal) : 0), 0);
      const supInfo = supMap.get(q.supplierId);
      return {
        quotationId: q.publicId,
        supplierId: supInfo?.publicId ?? String(q.supplierId),
        supplierName: supInfo?.name ?? "",
        total,
        status: q.status,
      };
    });
    // ranking
    const ranking = [...totals].sort((a,b)=> a.total - b.total).map((t,i)=> ({ ...t, rank: i+1 }));
    // cheapest overall (min total >0)
    let cheapestOverall: string | null = null;
    let minTotal = Infinity;
    totals.forEach(t=> { if (t.total>0 && t.total < minTotal) { minTotal=t.total; cheapestOverall=t.supplierId; }});
    res.json({
      rfq: { id: rfq.publicId, documentNo: rfq.documentNo, status: rfq.status },
      lines: linesMatrix,
      totals,
      ranking,
      cheapestOverall,
    });
  } catch (e) { next(e); }
});

// POST /rfqs/:id/award
rfqRouter.post("/rfqs/:id/award", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [rfq] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (["CANCELED","CLOSED"].includes(rfq.status)) return res.status(400).json({ error: `RFQ ${rfq.status} tidak bisa award.` });
    const b = req.body ?? {};
    if (!b.supplierId) return res.status(400).json({ error: "supplierId wajib." });
    const supplierInternal = await resolveInternalId(s.suppliers, b.supplierId);
    if (!supplierInternal) return res.status(400).json({ error: "supplierId tidak valid." });
    const [quotation] = await db.select().from(s.supplierQuotations).where(and(eq(s.supplierQuotations.rfqId, rfq.id), eq(s.supplierQuotations.supplierId, supplierInternal))).limit(1);
    if (!quotation) return res.status(400).json({ error: "Quotation supplier tidak ditemukan untuk RFQ ini." });
    if (quotation.status !== "SUBMITTED" && quotation.status !== "DRAFT") return res.status(400).json({ error: `Quotation status ${quotation.status} tidak bisa di-award.` });
    const actor = await getActorInfo(req);
    await db.transaction(async (tx)=>{
      await tx.update(s.rfqs).set({ status: "AWARDED", awardedSupplierId: supplierInternal, awardedAt: new Date(), awardedBy: actor.internalId ?? null, updatedAt: new Date() }).where(eq(s.rfqs.id, rfq.id));
      await tx.update(s.supplierQuotations).set({ status: "REJECTED", updatedAt: new Date() }).where(and(eq(s.supplierQuotations.rfqId, rfq.id)));
      await tx.update(s.supplierQuotations).set({ status: "AWARDED", updatedAt: new Date() }).where(eq(s.supplierQuotations.id, quotation.id));
    });
    try { await logActivity({ documentType: "RFQ", documentId: rfq.id, action: "award", fromStatus: rfq.status, toStatus: "AWARDED", actorUserId: actor.internalId, actorRole: actor.role, metadata: { supplierId: supplierInternal } }); } catch {}
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /rfqs/:id/create-po  (from awarded quotation)
rfqRouter.post("/rfqs/:id/create-po", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const pid = String(req.params.id);
    const [rfq] = await db.select().from(s.rfqs).where(rfqWhere(pid)).limit(1);
    if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan." });
    if (rfq.status !== "AWARDED") return res.status(400).json({ error: "RFQ harus AWARDED untuk buat PO." });
    if (!rfq.awardedSupplierId) return res.status(400).json({ error: "RFQ belum ada awarded supplier." });
    const [quotation] = await db.select().from(s.supplierQuotations).where(and(eq(s.supplierQuotations.rfqId, rfq.id), eq(s.supplierQuotations.supplierId, rfq.awardedSupplierId), eq(s.supplierQuotations.status, "AWARDED"))).limit(1);
    if (!quotation) return res.status(400).json({ error: "Quotation awarded tidak ditemukan." });
    const qLines = await db.select().from(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, quotation.id));
    if (qLines.length===0) return res.status(400).json({ error: "Quotation tidak punya lines." });
    // check if PO already created for this RFQ? prevent duplicate? Allow multiple? Check existing PO with notes contains RFQ? For MVP prevent duplicate via checking if any PO created after award with same rfq? We'll check via activity log or allow.
    const existingPos = await db.select({ id: s.purchaseOrders.id }).from(s.purchaseOrders).where(eq(s.purchaseOrders.supplierId, rfq.awardedSupplierId)).limit(1);
    // simple guard: if already has PO created from this RFQ via checking purchaseOrders created after RFQ awardedAt and same warehouse? Skip for now.

    // validate against PR sisa if RFQ has PR
    if (rfq.purchaseRequestId) {
      // For now we skip strict check, but we could validate sum PO + RFQ <= PR
    }

    const actor = await getActorInfo(req);
    const { documentNo, publicId } = await db.transaction(async (tx)=>{
      const doc = await nextDocumentNo(tx as any, "PO", { branchId: rfq.branchId ?? undefined, date: new Date() });
      const [po] = await tx.insert(s.purchaseOrders).values({
        documentNo: doc.documentNo,
        seriesId: doc.seriesId,
        supplierId: rfq.awardedSupplierId,
        warehouseId: rfq.warehouseId,
        orderDate: new Date().toISOString().slice(0,10),
        expectedDate: rfq.expectedDate ?? null,
        status: "DRAFT",
        notes: rfq.notes ?? null,
        currency: quotation.currency ?? rfq.currency ?? "IDR",
        exchangeRate: "1",
        needApproval: false,
        createdBy: actor.internalId ?? null,
        branchId: rfq.branchId,
      }).returning();
      for (const ql of qLines) {
        const price = ql.unitPrice != null ? String(ql.unitPrice) : null;
        // skip lines with no price? But we still need qty? Skip if no price
        if (price == null) continue;
        await tx.insert(s.purchaseOrderLines).values({
          purchaseOrderId: po.id,
          itemId: ql.itemId,
          uomId: ql.uomId,
          qty: ql.qty,
          unitPrice: price,
          discount: ql.discount ?? "0",
          batchNumber: null,
          note: ql.note ?? null,
        });
      }
      return { documentNo: doc.documentNo, publicId: po.publicId, id: po.id };
    });
    try { await logActivity({ documentType: "RFQ", documentId: rfq.id, action: "create_po", fromStatus: rfq.status, toStatus: rfq.status, actorUserId: actor.internalId, actorRole: actor.role, metadata: { documentNo, supplierId: rfq.awardedSupplierId } }); } catch {}
    // optional: close RFQ after PO created? Keep AWARDED, let manual close
    res.status(201).json({ id: publicId, documentNo });
  } catch (e) { next(e); }
});

// supplier-quotations patch/submit
rfqRouter.patch("/supplier-quotations/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const qid = String(req.params.id);
    let where:any = isUuid(qid) ? eq(s.supplierQuotations.publicId, qid) : eq(s.supplierQuotations.publicId, qid);
    const [cur] = await db.select().from(s.supplierQuotations).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Quotation tidak ditemukan." });
    if (cur.status === "AWARDED") return res.status(400).json({ error: "Quotation sudah awarded tidak bisa diubah." });
    const b = req.body ?? {};
    const patch: any = {};
    if (b.quotationNo !== undefined) patch.quotationNo = b.quotationNo ?? null;
    if (b.quotationDate !== undefined) patch.quotationDate = b.quotationDate;
    if (b.validUntil !== undefined) patch.validUntil = b.validUntil ?? null;
    if (b.currency !== undefined) patch.currency = String(b.currency).toUpperCase();
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.deliveryLeadTime !== undefined) patch.deliveryLeadTime = b.deliveryLeadTime ?? null;
    if (b.paymentTerm !== undefined) patch.paymentTerm = b.paymentTerm ?? null;
    if (b.status !== undefined) patch.status = b.status;
    patch.updatedAt = new Date();
    await db.update(s.supplierQuotations).set(patch).where(eq(s.supplierQuotations.id, cur.id));
    if (Array.isArray(b.lines)) {
      await db.transaction(async (tx)=>{
        await tx.delete(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, cur.id));
        // need rfq lines map
        const [rfq] = await tx.select().from(s.rfqs).where(eq(s.rfqs.id, cur.rfqId)).limit(1);
        const rfqLines = await tx.select().from(s.rfqLines).where(eq(s.rfqLines.rfqId, cur.rfqId));
        let total=0;
        for (const l of b.lines) {
          const itemInternal = await resolveInternalId(s.items, l.itemId);
          const uomInternal = await resolveInternalId(s.uom, l.uomId);
          if (!itemInternal || !uomInternal) throw new Error(`Item/UOM tidak valid`);
          const rfqLine = rfqLines.find((rl:any)=> rl.itemId===itemInternal) ?? null;
          const qtyNum = Number(l.qty ?? rfqLine?.qty ?? 0);
          const priceNum = l.unitPrice != null && String(l.unitPrice).trim()!=="" ? Number(l.unitPrice) : null;
          const discountNum = l.discount != null && String(l.discount).trim()!=="" ? Number(l.discount) : 0;
          const subtotal = priceNum != null ? (qtyNum * priceNum - (discountNum||0)) : 0;
          if (priceNum != null) total += subtotal;
          await tx.insert(s.supplierQuotationLines).values({
            quotationId: cur.id,
            rfqLineId: rfqLine?.id ?? null,
            itemId: itemInternal,
            uomId: uomInternal,
            qty: String(qtyNum),
            unitPrice: priceNum != null ? String(priceNum) : null,
            discount: String(discountNum||0),
            subtotal: String(subtotal),
            note: l.note ?? null,
          });
        }
        await tx.update(s.supplierQuotations).set({ totalAmount: String(total), updatedAt: new Date() }).where(eq(s.supplierQuotations.id, cur.id));
      });
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rfqRouter.post("/supplier-quotations/:id/submit", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "manage"))) return;
  try {
    const qid = String(req.params.id);
    const where = isUuid(qid) ? eq(s.supplierQuotations.publicId, qid) : eq(s.supplierQuotations.publicId, qid);
    const [cur] = await db.select().from(s.supplierQuotations).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Quotation tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya DRAFT yang bisa di-submit." });
    const qLines = await db.select().from(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, cur.id));
    let hasPrice = false;
    for (const l of qLines) {
      const p = l.unitPrice != null ? Number(l.unitPrice) : NaN;
      if (Number.isFinite(p) && p>0) hasPrice=true;
    }
    if (!hasPrice) return res.status(400).json({ error: "Minimal 1 line harus ada unitPrice >0" });
    await db.update(s.supplierQuotations).set({ status: "SUBMITTED", updatedAt: new Date() }).where(eq(s.supplierQuotations.id, cur.id));
    // update rfq status to QUOTED if SENT
    const [rfq] = await db.select().from(s.rfqs).where(eq(s.rfqs.id, cur.rfqId)).limit(1);
    if (rfq && rfq.status === "SENT") {
      await db.update(s.rfqs).set({ status: "QUOTED", updatedAt: new Date() }).where(eq(s.rfqs.id, rfq.id));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

rfqRouter.get("/supplier-quotations/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseRequests", "view"))) return;
  try {
    const qid = String(req.params.id);
    const where = isUuid(qid) ? eq(s.supplierQuotations.publicId, qid) : eq(s.supplierQuotations.publicId, qid);
    const [cur] = await db.select().from(s.supplierQuotations).where(where).limit(1);
    if (!cur) return res.status(404).json({ error: "Quotation tidak ditemukan." });
    const lines = await db.select().from(s.supplierQuotationLines).where(eq(s.supplierQuotationLines.quotationId, cur.id));
    const sup = await db.select({ publicId: s.suppliers.publicId, name: s.suppliers.name }).from(s.suppliers).where(eq(s.suppliers.id, cur.supplierId)).limit(1).then(r=> r[0]);
    const rfq = await db.select({ publicId: s.rfqs.publicId, documentNo: s.rfqs.documentNo }).from(s.rfqs).where(eq(s.rfqs.id, cur.rfqId)).limit(1).then(r=> r[0]);
    res.json({
      id: cur.publicId,
      _internalId: cur.id,
      rfqId: rfq?.publicId ?? String(cur.rfqId),
      rfqNo: rfq?.documentNo ?? "",
      supplierId: sup?.publicId ?? String(cur.supplierId),
      supplierName: sup?.name ?? "",
      quotationNo: cur.quotationNo,
      quotationDate: cur.quotationDate,
      validUntil: cur.validUntil,
      currency: cur.currency,
      notes: cur.notes,
      status: cur.status,
      totalAmount: cur.totalAmount,
      deliveryLeadTime: cur.deliveryLeadTime,
      paymentTerm: cur.paymentTerm,
      lines: await Promise.all(lines.map(async l=>{
        const item = await db.select({ publicId: s.items.publicId, code: s.items.code, name: s.items.name }).from(s.items).where(eq(s.items.id, l.itemId)).limit(1).then(r=> r[0]);
        const uom = await db.select({ publicId: s.uom.publicId, name: s.uom.name }).from(s.uom).where(eq(s.uom.id, l.uomId)).limit(1).then(r=> r[0]);
        return {
          id: l.publicId,
          _internalId: l.id,
          rfqLineId: l.rfqLineId,
          itemId: item?.publicId ?? String(l.itemId),
          itemCode: item?.code ?? "",
          itemName: item?.name ?? "",
          uomId: uom?.publicId ?? String(l.uomId),
          uomName: uom?.name ?? "",
          qty: l.qty,
          unitPrice: l.unitPrice,
          discount: l.discount,
          subtotal: l.subtotal,
          note: l.note,
        };
      })),
    });
  } catch (e) { next(e); }
});
