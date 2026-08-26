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

async function replacePoLines(tx: any, poId: string, lines: any[]) {
  await tx.delete(s.purchaseOrderLines).where(eq(s.purchaseOrderLines.purchaseOrderId, poId));
  for (const l of lines) {
    await tx.insert(s.purchaseOrderLines).values({
      id: await nextRowId(tx, s.purchaseOrderLines, "pol"),
      purchaseOrderId: poId,
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice != null ? String(l.unitPrice) : null,
      batchNumber: l.batchNumber ?? null,
      note: l.note ?? null,
    });
  }
}

supplyChainRouter.post("/purchase-orders", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.supplierId || !b.warehouseId || !b.orderDate)
      return res.status(400).json({ error: "supplierId, warehouseId, orderDate wajib." });
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
      .select()
      .from(s.purchaseOrders)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(s.purchaseOrders.orderDate));
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

supplyChainRouter.get("/purchase-orders/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "supply.purchaseOrders", "view"))) return;
  try {
    const [row] = await db
      .select()
      .from(s.purchaseOrders)
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
    const typeId = await getMovementTypeId("RECEIPT");
    const details: DetailInput[] = lines.map((l: any) => ({
      itemId: l.itemId,
      fromWarehouseId: null,
      toWarehouseId: gr.warehouseId,
      qty: Number(l.qty),
      uomId: l.uomId,
      batchNumber: l.batchNumber ?? null,
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
