import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { nextRowId } from "../lib/id";
import { checkPermission } from "../middleware/rbac";
import {
  insertMovementWithDetails,
  type DetailInput,
  type MovementInput,
} from "./transactions";

export const supplyChainRouter = Router();

type DocStatus = "DRAFT" | "POSTED" | "CANCELED";

async function getMovementTypeId(code: string): Promise<string> {
  const [row] = await db
    .select({ id: s.movementTypes.id })
    .from(s.movementTypes)
    .where(eq(s.movementTypes.code, code))
    .limit(1);
  if (!row) throw new Error(`Movement type "${code}" tidak ditemukan.`);
  return row.id;
}

// ---------------------------------------------------------------------------
// PURCHASE ORDERS
// ---------------------------------------------------------------------------

async function poLines(tx: any, poId: string) {
  return tx.select().from(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.purchaseOrderId, poId));
}

function validateRequireUnitPrice(lines: any[], context: string) {
  for (let i = 0; i < lines.length; i++) {
    const v = lines[i]?.unitPrice;
    const n = v != null && String(v).trim() !== "" ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`${context} baris ${i + 1}: Harga (unitPrice) wajib diisi dan > 0.`);
    }
  }
}

async function replacePoLines(tx: any, poId: string, lines: any[]) {
  validateRequireUnitPrice(lines, "PO");
  await tx.delete(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.purchaseOrderId, poId));
  for (const l of lines) {
    const deliveryDate = l.deliveryDate ?? l.expectedDate ?? l.tanggalKirim ?? null;
    await tx.insert(s.purchaseOrderLines).values({
      id: await nextRowId(tx, s.purchaseOrderLines, "pol"),
      purchaseOrderId: poId,
      itemId: l.itemId,
      uomId: l.uomId,
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
    if (!b.supplierId || !b.warehouseId || !b.orderDate)
      return res.status(400).json({ error: "supplierId, warehouseId, orderDate wajib." });
    if (Array.isArray(b.lines) && b.lines.length > 0) {
      try { validateRequireUnitPrice(b.lines, "PO"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
    }
    const id = await nextRowId(db, s.purchaseOrders, "po");
    await db.insert(s.purchaseOrders).values({
      id,
      poNo: id,
      supplierId: b.supplierId,
      warehouseId: b.warehouseId,
      orderDate: b.orderDate,
      expectedDate: b.expectedDate ?? null,
      status: "DRAFT",
      notes: b.notes ?? null,
      createdBy: (req as any).user?.id ?? null,
      branchId: b.branchId ?? null,
    });
    if (Array.isArray(b.lines)) await replacePoLines(db, id, b.lines);
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/purchase-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.purchaseOrders.status as any, String(req.query.status)));
    if (req.query.warehouseId) conds.push(eq(s.purchaseOrders.warehouseId, String(req.query.warehouseId)));
    if (req.query.supplierId) conds.push(eq(s.purchaseOrders.supplierId, String(req.query.supplierId)));
    const rows = await db
      .select({
        id: s.purchaseOrders.id,
        poNo: s.purchaseOrders.poNo,
        supplierId: s.purchaseOrders.supplierId,
        warehouseId: s.purchaseOrders.warehouseId,
        orderDate: s.purchaseOrders.orderDate,
        expectedDate: s.purchaseOrders.expectedDate,
        status: s.purchaseOrders.status,
        notes: s.purchaseOrders.notes,
        createdBy: s.purchaseOrders.createdBy,
        createdByName: s.users.name,
        branchId: s.purchaseOrders.branchId,
        createdAt: s.purchaseOrders.createdAt,
        updatedAt: s.purchaseOrders.updatedAt,
      })
      .from(s.purchaseOrders)
      .leftJoin(s.users, eq(s.users.id, s.purchaseOrders.createdBy))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(s.purchaseOrders.orderDate));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET last purchase price per item (global)
supplyChainRouter.get("/purchase-orders/last-price", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const itemId = String(req.query.itemId ?? "").trim();
    const itemIdsRaw = String(req.query.itemIds ?? "").trim();
    const ids = itemId ? [itemId] : itemIdsRaw ? itemIdsRaw.split(",").map((v) => v.trim()).filter(Boolean) : [];
    if (ids.length === 0) return res.json({});
    const rows = await db
      .select({
        itemId: s.purchaseOrderLines.itemId,
        unitPrice: s.purchaseOrderLines.unitPrice,
        orderDate: s.purchaseOrders.orderDate,
      })
      .from(s.purchaseOrderLines)
      .innerJoin(s.purchaseOrders, eq(s.purchaseOrders.id, s.purchaseOrderLines.purchaseOrderId))
      .where(inArray(s.purchaseOrderLines.itemId, ids))
      .orderBy(desc(s.purchaseOrders.orderDate), desc(s.purchaseOrders.createdAt));
    const map: Record<string, string | null> = {};
    for (const r of rows) {
      if (!(r.itemId in map)) map[r.itemId] = r.unitPrice != null ? String(r.unitPrice) : null;
    }
    // fill missing
    for (const id of ids) if (!(id in map)) map[id] = null;
    if (itemId) return res.json({ itemId, unitPrice: map[itemId] });
    return res.json(map);
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const [row] = await db
      .select({
        id: s.purchaseOrders.id,
        poNo: s.purchaseOrders.poNo,
        supplierId: s.purchaseOrders.supplierId,
        warehouseId: s.purchaseOrders.warehouseId,
        orderDate: s.purchaseOrders.orderDate,
        expectedDate: s.purchaseOrders.expectedDate,
        status: s.purchaseOrders.status,
        notes: s.purchaseOrders.notes,
        createdBy: s.purchaseOrders.createdBy,
        createdByName: s.users.name,
        branchId: s.purchaseOrders.branchId,
        createdAt: s.purchaseOrders.createdAt,
        updatedAt: s.purchaseOrders.updatedAt,
      })
      .from(s.purchaseOrders)
      .leftJoin(s.users, eq(s.users.id, s.purchaseOrders.createdBy))
      .where(eq(s.purchaseOrders.id, req.params.id))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    const lines = await poLines(db, req.params.id);
    const receipts = await db
      .select()
      .from(s.goodsReceipts)
      .where(eq(s.goodsReceipts.purchaseOrderId, req.params.id));
    res.json({ ...row, lines, receipts });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.put("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const [cur] = await db
      .select({ status: s.purchaseOrders.status })
      .from(s.purchaseOrders)
      .where(eq(s.purchaseOrders.id, req.params.id))
      .limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status !== "DRAFT")
      return res.status(400).json({ error: "Hanya PO berstatus DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) {
      try { validateRequireUnitPrice(b.lines, "PO"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
    }
    const patch: Record<string, any> = {};
    if (b.supplierId !== undefined) patch.supplierId = b.supplierId;
    if (b.warehouseId !== undefined) patch.warehouseId = b.warehouseId;
    if (b.orderDate !== undefined) patch.orderDate = b.orderDate;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    patch.updatedAt = new Date();
    await db.update(s.purchaseOrders).set(patch).where(eq(s.purchaseOrders.id, req.params.id));
    if (Array.isArray(b.lines)) await replacePoLines(db, req.params.id, b.lines);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.delete("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    await db.delete(s.purchaseOrders).where(eq(s.purchaseOrders.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.post("/purchase-orders/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const [cur] = await db
      .select({ status: s.purchaseOrders.status })
      .from(s.purchaseOrders)
      .where(eq(s.purchaseOrders.id, req.params.id))
      .limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status === "CANCELED")
      return res.status(400).json({ error: "PO dibatalkan tidak dapat diposting." });
    await db
      .update(s.purchaseOrders)
      .set({ status: "POSTED", updatedAt: new Date() })
      .where(eq(s.purchaseOrders.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.post("/purchase-orders/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const [cur] = await db
      .select({ status: s.purchaseOrders.status })
      .from(s.purchaseOrders)
      .where(eq(s.purchaseOrders.id, req.params.id))
      .limit(1);
    if (!cur) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (cur.status === "CANCELED")
      return res.status(400).json({ error: "PO sudah dibatalkan." });
    await db
      .update(s.purchaseOrders)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(eq(s.purchaseOrders.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Buat Goods Receipt (inbound) dari PO — menyalin baris PO.
supplyChainRouter.post("/purchase-orders/:id/create-receipt", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const [po] = await db
      .select()
      .from(s.purchaseOrders)
      .where(eq(s.purchaseOrders.id, req.params.id))
      .limit(1);
    if (!po) return res.status(404).json({ error: "Purchase Order tidak ditemukan." });
    if (po.status === "CANCELED")
      return res.status(400).json({ error: "PO dibatalkan tidak dapat dibuatkan penerimaan." });
    const lines = await poLines(db, req.params.id);
    const id = await nextRowId(db, s.goodsReceipts, "gr");
    await db.insert(s.goodsReceipts).values({
      id,
      grNo: id,
      purchaseOrderId: po.id,
      supplierId: po.supplierId,
      warehouseId: po.warehouseId,
      receiptDate: (req.body?.receiptDate as string) || new Date().toISOString().slice(0, 10),
      status: "DRAFT",
      notes: req.body?.notes ?? null,
      createdBy: (req as any).user?.id ?? null,
      branchId: po.branchId,
    });
    for (const l of lines) {
      await db.insert(s.goodsReceiptLines).values({
        id: await nextRowId(db, s.goodsReceiptLines, "grl"),
        goodsReceiptId: id,
        itemId: l.itemId,
        uomId: l.uomId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        batchNumber: l.batchNumber,
        note: l.note,
      });
    }
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// SALES ORDERS
// ---------------------------------------------------------------------------

async function soLines(tx: any, soId: string) {
  return tx.select().from(s.salesOrderLines).where(eq(s.salesOrderLines.salesOrderId, soId));
}

async function replaceSoLines(tx: any, soId: string, lines: any[]) {
  await tx.delete(s.salesOrderLines).where(eq(s.salesOrderLines.salesOrderId, soId));
  for (const l of lines) {
    await tx.insert(s.salesOrderLines).values({
      id: await nextRowId(tx, s.salesOrderLines, "sol"),
      salesOrderId: soId,
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
      batchNumber: l.batchNumber ?? null,
      note: l.note ?? null,
    });
  }
}

supplyChainRouter.post("/sales-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.customerId || !b.warehouseId || !b.orderDate)
      return res.status(400).json({ error: "customerId, warehouseId, orderDate wajib." });
    const id = await nextRowId(db, s.salesOrders, "so");
    await db.insert(s.salesOrders).values({
      id,
      soNo: id,
      customerId: b.customerId,
      warehouseId: b.warehouseId,
      orderDate: b.orderDate,
      expectedDate: b.expectedDate ?? null,
      status: "DRAFT",
      notes: b.notes ?? null,
      createdBy: (req as any).user?.id ?? null,
      branchId: b.branchId ?? null,
    });
    if (Array.isArray(b.lines)) await replaceSoLines(db, id, b.lines);
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/sales-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.salesOrders.status as any, String(req.query.status)));
    if (req.query.warehouseId) conds.push(eq(s.salesOrders.warehouseId, String(req.query.warehouseId)));
    if (req.query.customerId) conds.push(eq(s.salesOrders.customerId, String(req.query.customerId)));
    const rows = await db
      .select()
      .from(s.salesOrders)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(s.salesOrders.orderDate));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "view"))) return;
  try {
    const [row] = await db
      .select()
      .from(s.salesOrders)
      .where(eq(s.salesOrders.id, req.params.id))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    const lines = await soLines(db, req.params.id);
    res.json({ ...row, lines });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.put("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const [cur] = await db
      .select({ status: s.salesOrders.status })
      .from(s.salesOrders)
      .where(eq(s.salesOrders.id, req.params.id))
      .limit(1);
    if (!cur) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    if (cur.status !== "DRAFT")
      return res.status(400).json({ error: "Hanya SO berstatus DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.customerId !== undefined) patch.customerId = b.customerId;
    if (b.warehouseId !== undefined) patch.warehouseId = b.warehouseId;
    if (b.orderDate !== undefined) patch.orderDate = b.orderDate;
    if (b.expectedDate !== undefined) patch.expectedDate = b.expectedDate ?? null;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    patch.updatedAt = new Date();
    await db.update(s.salesOrders).set(patch).where(eq(s.salesOrders.id, req.params.id));
    if (Array.isArray(b.lines)) await replaceSoLines(db, req.params.id, b.lines);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.delete("/sales-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    await db.delete(s.salesOrders).where(eq(s.salesOrders.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Post SO → keluar stok (ISSUE movement).
supplyChainRouter.post("/sales-orders/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const [so] = await db
      .select()
      .from(s.salesOrders)
      .where(eq(s.salesOrders.id, req.params.id))
      .limit(1);
    if (!so) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    if (so.status === "CANCELED")
      return res.status(400).json({ error: "SO dibatalkan tidak dapat diposting." });
    if (so.status === "POSTED")
      return res.status(400).json({ error: "SO sudah diposting." });
    const lines = await soLines(db, req.params.id);
    const typeId = await getMovementTypeId("ISSUE");
    const details: DetailInput[] = lines.map((l: any) => ({
      itemId: l.itemId,
      fromWarehouseId: so.warehouseId,
      toWarehouseId: null,
      qty: Number(l.qty),
      uomId: l.uomId,
      batchNumber: l.batchNumber ?? null,
    }));
    const input: MovementInput = {
      typeId,
      movementDate: so.orderDate,
      status: "POSTED",
      referenceType: "SALES_ORDER",
      referenceId: so.id,
      description: `Sales Order ${so.soNo}`,
      details,
    };
    await db.transaction(async (tx) => {
      await insertMovementWithDetails(tx, input, (req as any).user?.id ?? "system");
    });
    await db
      .update(s.salesOrders)
      .set({ status: "POSTED", updatedAt: new Date() })
      .where(eq(s.salesOrders.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.post("/sales-orders/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.salesOrders", "manage"))) return;
  try {
    const [cur] = await db
      .select({ status: s.salesOrders.status })
      .from(s.salesOrders)
      .where(eq(s.salesOrders.id, req.params.id))
      .limit(1);
    if (!cur) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    if (cur.status === "CANCELED")
      return res.status(400).json({ error: "SO sudah dibatalkan." });

    // Jika sudah POSTED, balikkan stok (RECEIPT kompensasi).
    if (cur.status === "POSTED") {
      const so = await db
        .select()
        .from(s.salesOrders)
        .where(eq(s.salesOrders.id, req.params.id))
        .limit(1)
        .then((r) => r[0]);
      const lines = await soLines(db, req.params.id);
      const typeId = await getMovementTypeId("RECEIPT");
      const details: DetailInput[] = lines.map((l: any) => ({
        itemId: l.itemId,
        fromWarehouseId: null,
        toWarehouseId: so.warehouseId,
        qty: Number(l.qty),
        uomId: l.uomId,
        batchNumber: l.batchNumber ?? null,
      }));
      const input: MovementInput = {
        typeId,
        movementDate: so.orderDate,
        status: "POSTED",
        referenceType: "SALES_ORDER_CANCEL",
        referenceId: so.id,
        description: `Batal Sales Order ${so.soNo}`,
        details,
      };
      await db.transaction(async (tx) => {
        await insertMovementWithDetails(tx, input, (req as any).user?.id ?? "system");
      });
    }
    await db
      .update(s.salesOrders)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(eq(s.salesOrders.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// GOODS RECEIPTS (Inbound) — selalu reference PO
// ---------------------------------------------------------------------------

async function grLines(tx: any, grId: string) {
  return tx.select().from(s.goodsReceiptLines).where(eq(s.goodsReceiptLines.goodsReceiptId, grId));
}

async function replaceGrLines(tx: any, grId: string, lines: any[]) {
  validateRequireUnitPrice(lines, "GR");
  await tx.delete(s.goodsReceiptLines).where(eq(s.goodsReceiptLines.goodsReceiptId, grId));
  for (const l of lines) {
    await tx.insert(s.goodsReceiptLines).values({
      id: await nextRowId(tx, s.goodsReceiptLines, "grl"),
      goodsReceiptId: grId,
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
      batchNumber: l.batchNumber ?? null,
      note: l.note ?? null,
    });
  }
}

supplyChainRouter.post("/goods-receipts", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.purchaseOrderId || !b.warehouseId || !b.receiptDate)
      return res.status(400).json({ error: "purchaseOrderId, warehouseId, receiptDate wajib." });
    if (Array.isArray(b.lines) && b.lines.length > 0) {
      try { validateRequireUnitPrice(b.lines, "GR"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
    }
    const [po] = await db
      .select({ supplierId: s.purchaseOrders.supplierId, branchId: s.purchaseOrders.branchId })
      .from(s.purchaseOrders)
      .where(eq(s.purchaseOrders.id, b.purchaseOrderId))
      .limit(1);
    if (!po) return res.status(400).json({ error: "Purchase Order tidak ditemukan." });
    const id = await nextRowId(db, s.goodsReceipts, "gr");
    await db.insert(s.goodsReceipts).values({
      id,
      grNo: id,
      purchaseOrderId: b.purchaseOrderId,
      supplierId: po.supplierId,
      warehouseId: b.warehouseId,
      receiptDate: b.receiptDate,
      status: "DRAFT",
      notes: b.notes ?? null,
      createdBy: (req as any).user?.id ?? null,
      branchId: po.branchId,
    });
    if (Array.isArray(b.lines)) await replaceGrLines(db, id, b.lines);
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/goods-receipts", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.goodsReceipts.status as any, String(req.query.status)));
    if (req.query.warehouseId) conds.push(eq(s.goodsReceipts.warehouseId, String(req.query.warehouseId)));
    if (req.query.purchaseOrderId) conds.push(eq(s.goodsReceipts.purchaseOrderId, String(req.query.purchaseOrderId)));
    const rows = await db
      .select()
      .from(s.goodsReceipts)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(s.goodsReceipts.receiptDate));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "view"))) return;
  try {
    const [row] = await db
      .select()
      .from(s.goodsReceipts)
      .where(eq(s.goodsReceipts.id, req.params.id))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    const lines = await grLines(db, req.params.id);
    res.json({ ...row, lines });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.put("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const [cur] = await db
      .select({ status: s.goodsReceipts.status })
      .from(s.goodsReceipts)
      .where(eq(s.goodsReceipts.id, req.params.id))
      .limit(1);
    if (!cur) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (cur.status !== "DRAFT")
      return res.status(400).json({ error: "Hanya GR berstatus DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    if (Array.isArray(b.lines) && b.lines.length > 0) {
      try { validateRequireUnitPrice(b.lines, "GR"); } catch (e) { return res.status(400).json({ error: (e as Error).message }); }
    }
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = b.warehouseId;
    if (b.receiptDate !== undefined) patch.receiptDate = b.receiptDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.purchaseOrderId !== undefined) patch.purchaseOrderId = b.purchaseOrderId;
    patch.updatedAt = new Date();
    await db.update(s.goodsReceipts).set(patch).where(eq(s.goodsReceipts.id, req.params.id));
    if (Array.isArray(b.lines)) await replaceGrLines(db, req.params.id, b.lines);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.delete("/goods-receipts/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    await db.delete(s.goodsReceipts).where(eq(s.goodsReceipts.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Post GR → masuk stok (RECEIPT movement).
supplyChainRouter.post("/goods-receipts/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const [gr] = await db
      .select()
      .from(s.goodsReceipts)
      .where(eq(s.goodsReceipts.id, req.params.id))
      .limit(1);
    if (!gr) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (gr.status === "CANCELED")
      return res.status(400).json({ error: "GR dibatalkan tidak dapat diposting." });
    if (gr.status === "POSTED")
      return res.status(400).json({ error: "GR sudah diposting." });
    const lines = await grLines(db, req.params.id);
    // GR wajib harga: validasi sebelum posting
    validateRequireUnitPrice(lines, "GR");
    const typeId = await getMovementTypeId("RECEIPT");
    const details: DetailInput[] = lines.map((l: any) => ({
      itemId: l.itemId,
      fromWarehouseId: null,
      toWarehouseId: gr.warehouseId,
      qty: Number(l.qty),
      uomId: l.uomId,
      batchNumber: l.batchNumber ?? null,
      incomingRate: l.unitPrice != null ? Number(l.unitPrice) : null,
    }));
    const input: MovementInput = {
      typeId,
      movementDate: gr.receiptDate,
      status: "POSTED",
      referenceType: "GOODS_RECEIPT",
      referenceId: gr.id,
      description: `Penerimaan ${gr.grNo}`,
      details,
    };
    await db.transaction(async (tx) => {
      await insertMovementWithDetails(tx, input, (req as any).user?.id ?? "system");
    });
    await db
      .update(s.goodsReceipts)
      .set({ status: "POSTED", updatedAt: new Date() })
      .where(eq(s.goodsReceipts.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.post("/goods-receipts/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.goodsReceipts", "manage"))) return;
  try {
    const [cur] = await db
      .select({ status: s.goodsReceipts.status })
      .from(s.goodsReceipts)
      .where(eq(s.goodsReceipts.id, req.params.id))
      .limit(1);
    if (!cur) return res.status(404).json({ error: "Goods Receipt tidak ditemukan." });
    if (cur.status === "CANCELED")
      return res.status(400).json({ error: "GR sudah dibatalkan." });

    // Jika sudah POSTED, balikkan stok (ISSUE kompensasi).
    if (cur.status === "POSTED") {
      const gr = await db
        .select()
        .from(s.goodsReceipts)
        .where(eq(s.goodsReceipts.id, req.params.id))
        .limit(1)
        .then((r) => r[0]);
      const lines = await grLines(db, req.params.id);
      const typeId = await getMovementTypeId("ISSUE");
      const details: DetailInput[] = lines.map((l: any) => ({
        itemId: l.itemId,
        fromWarehouseId: gr.warehouseId,
        toWarehouseId: null,
        qty: Number(l.qty),
        uomId: l.uomId,
        batchNumber: l.batchNumber ?? null,
      }));
      const input: MovementInput = {
        typeId,
        movementDate: gr.receiptDate,
        status: "POSTED",
        referenceType: "GOODS_RECEIPT_CANCEL",
        referenceId: gr.id,
        description: `Batal Penerimaan ${gr.grNo}`,
        details,
      };
      await db.transaction(async (tx) => {
        await insertMovementWithDetails(tx, input, (req as any).user?.id ?? "system");
      });
    }
    await db
      .update(s.goodsReceipts)
      .set({ status: "CANCELED", updatedAt: new Date() })
      .where(eq(s.goodsReceipts.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------------------------------------------------------------------
// DELIVERIES (Outbound) — dari Sales Order
// ---------------------------------------------------------------------------

async function deliveryLines(tx: any, deliveryId: string) {
  return tx.select().from(s.deliveryLines).where(eq(s.deliveryLines.deliveryId, deliveryId));
}

async function replaceDeliveryLines(tx: any, deliveryId: string, lines: any[]) {
  await tx.delete(s.deliveryLines).where(eq(s.deliveryLines.deliveryId, deliveryId));
  for (const l of lines) {
    await tx.insert(s.deliveryLines).values({
      id: await nextRowId(tx, s.deliveryLines, "dll"),
      deliveryId,
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
      batchNumber: l.batchNumber ?? null,
      note: l.note ?? null,
    });
  }
}

supplyChainRouter.post("/deliveries", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.warehouseId || !b.deliveryDate)
      return res.status(400).json({ error: "warehouseId, deliveryDate wajib." });
    // salesOrderId optional tapi jika ada validasi
    if (b.salesOrderId) {
      const [so] = await db.select({ id: s.salesOrders.id }).from(s.salesOrders).where(eq(s.salesOrders.id, b.salesOrderId)).limit(1);
      if (!so) return res.status(400).json({ error: "Sales Order tidak ditemukan." });
    }
    const id = await nextRowId(db, s.deliveries, "dlv");
    // ambil customerId dari SO jika tidak diisi
    let customerId = b.customerId ?? null;
    let salesOrderId = b.salesOrderId ?? null;
    if (salesOrderId && !customerId) {
      const [so] = await db.select({ customerId: s.salesOrders.customerId }).from(s.salesOrders).where(eq(s.salesOrders.id, salesOrderId)).limit(1);
      if (so) customerId = so.customerId;
    }
    await db.insert(s.deliveries).values({
      id,
      deliveryNo: id,
      salesOrderId,
      customerId,
      warehouseId: b.warehouseId,
      deliveryDate: b.deliveryDate,
      status: "DRAFT",
      notes: b.notes ?? b.remarks ?? null,
      createdBy: (req as any).user?.id ?? null,
      branchId: b.branchId ?? null,
    });
    if (Array.isArray(b.lines)) await replaceDeliveryLines(db, id, b.lines);
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/deliveries", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "view"))) return;
  try {
    const conds: any[] = [];
    if (req.query.status) conds.push(eq(s.deliveries.status as any, String(req.query.status)));
    if (req.query.warehouseId) conds.push(eq(s.deliveries.warehouseId, String(req.query.warehouseId)));
    if (req.query.salesOrderId) conds.push(eq(s.deliveries.salesOrderId, String(req.query.salesOrderId)));
    if (req.query.customerId) conds.push(eq(s.deliveries.customerId, String(req.query.customerId)));
    const rows = await db
      .select()
      .from(s.deliveries)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(s.deliveries.deliveryDate));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "view"))) return;
  try {
    const [row] = await db.select().from(s.deliveries).where(eq(s.deliveries.id, req.params.id)).limit(1);
    if (!row) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    const lines = await deliveryLines(db, req.params.id);
    res.json({ ...row, lines });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.put("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const [cur] = await db.select({ status: s.deliveries.status }).from(s.deliveries).where(eq(s.deliveries.id, req.params.id)).limit(1);
    if (!cur) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    if (cur.status !== "DRAFT") return res.status(400).json({ error: "Hanya delivery DRAFT yang dapat diubah." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.warehouseId !== undefined) patch.warehouseId = b.warehouseId;
    if (b.deliveryDate !== undefined) patch.deliveryDate = b.deliveryDate;
    if (b.notes !== undefined) patch.notes = b.notes ?? null;
    if (b.salesOrderId !== undefined) patch.salesOrderId = b.salesOrderId ?? null;
    if (b.customerId !== undefined) patch.customerId = b.customerId ?? null;
    patch.updatedAt = new Date();
    await db.update(s.deliveries).set(patch).where(eq(s.deliveries.id, req.params.id));
    if (Array.isArray(b.lines)) await replaceDeliveryLines(db, req.params.id, b.lines);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.delete("/deliveries/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    await db.delete(s.deliveries).where(eq(s.deliveries.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.post("/deliveries/:id/post", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const [dlv] = await db.select().from(s.deliveries).where(eq(s.deliveries.id, req.params.id)).limit(1);
    if (!dlv) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    if (dlv.status === "CANCELED") return res.status(400).json({ error: "Delivery dibatalkan tidak dapat diposting." });
    if (dlv.status === "POSTED") return res.status(400).json({ error: "Delivery sudah diposting." });
    const lines = await deliveryLines(db, req.params.id);
    if (lines.length === 0) return res.status(400).json({ error: "Delivery tanpa lines." });
    const typeId = await getMovementTypeId("ISSUE");
    const details: DetailInput[] = lines.map((l: any) => ({
      itemId: l.itemId,
      fromWarehouseId: dlv.warehouseId,
      toWarehouseId: null,
      qty: Number(l.qty),
      uomId: l.uomId,
      batchNumber: l.batchNumber ?? null,
    }));
    const input: MovementInput = {
      typeId,
      movementDate: dlv.deliveryDate,
      status: "POSTED",
      referenceType: "DELIVERY",
      referenceId: dlv.id,
      description: `Delivery ${dlv.deliveryNo}`,
      details,
    };
    await db.transaction(async (tx) => {
      await insertMovementWithDetails(tx, input, (req as any).user?.id ?? "system");
    });
    await db.update(s.deliveries).set({ status: "POSTED", updatedAt: new Date() }).where(eq(s.deliveries.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.post("/deliveries/:id/cancel", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const [cur] = await db.select({ status: s.deliveries.status }).from(s.deliveries).where(eq(s.deliveries.id, req.params.id)).limit(1);
    if (!cur) return res.status(404).json({ error: "Delivery tidak ditemukan." });
    if (cur.status === "CANCELED") return res.status(400).json({ error: "Delivery sudah dibatalkan." });
    if (cur.status === "POSTED") {
      const dlv = await db.select().from(s.deliveries).where(eq(s.deliveries.id, req.params.id)).limit(1).then((r) => r[0]);
      const lines = await deliveryLines(db, req.params.id);
      const typeId = await getMovementTypeId("RECEIPT");
      const details: DetailInput[] = lines.map((l: any) => ({
        itemId: l.itemId,
        fromWarehouseId: null,
        toWarehouseId: dlv.warehouseId,
        qty: Number(l.qty),
        uomId: l.uomId,
        batchNumber: l.batchNumber ?? null,
      }));
      const input: MovementInput = {
        typeId,
        movementDate: dlv.deliveryDate,
        status: "POSTED",
        referenceType: "DELIVERY_CANCEL",
        referenceId: dlv.id,
        description: `Batal Delivery ${dlv.deliveryNo}`,
        details,
      };
      await db.transaction(async (tx) => {
        await insertMovementWithDetails(tx, input, (req as any).user?.id ?? "system");
      });
    }
    await db.update(s.deliveries).set({ status: "CANCELED", updatedAt: new Date() }).where(eq(s.deliveries.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Buat Delivery dari SO — copy lines SO
supplyChainRouter.post("/sales-orders/:id/create-delivery", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.deliveries", "manage"))) return;
  try {
    const [so] = await db.select().from(s.salesOrders).where(eq(s.salesOrders.id, req.params.id)).limit(1);
    if (!so) return res.status(404).json({ error: "Sales Order tidak ditemukan." });
    const lines = await soLines(db, req.params.id);
    const id = await nextRowId(db, s.deliveries, "dlv");
    await db.insert(s.deliveries).values({
      id,
      deliveryNo: id,
      salesOrderId: so.id,
      customerId: so.customerId,
      warehouseId: so.warehouseId,
      deliveryDate: (req.body?.deliveryDate as string) || new Date().toISOString().slice(0, 10),
      status: "DRAFT",
      notes: req.body?.notes ?? null,
      createdBy: (req as any).user?.id ?? null,
      branchId: so.branchId,
    });
    for (const l of lines) {
      await db.insert(s.deliveryLines).values({
        id: await nextRowId(db, s.deliveryLines, "dll"),
        deliveryId: id,
        itemId: l.itemId,
        uomId: l.uomId,
        qty: l.qty,
        unitPrice: l.unitPrice,
        batchNumber: l.batchNumber,
        note: l.note,
      });
    }
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});
