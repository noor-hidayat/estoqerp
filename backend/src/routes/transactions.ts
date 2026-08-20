import { Router } from "express";
import type { Request, Response } from "express";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import type { NodePgTransaction } from "drizzle-orm/node-postgres/session";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import {
  canAccessEntity,
  checkPermission,
  isAdminUser,
} from "../middleware/rbac";

export const transactionsRouter = Router();
export const stockLedgerRouter = Router();

type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

const MOVEMENT_STATUSES = ["DRAFT", "POSTED"] as const;
type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

interface DetailInput {
  itemId: string;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  qty: number;
  uomId?: string | null;
  batchNumber?: string | null;
}

interface EffectDetail {
  itemId: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  qty: number;
  batchId: string | null;
}

interface MovementInput {
  typeId: string;
  movementDate: string | null;
  status: MovementStatus;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  details: DetailInput[];
}

/** Error validasi yang layak dikirim ke klien (stok kurang, dll). */
class StockError extends Error {
  status = 400;
}

const DEFAULT_PAGE_SIZE = 20;

/** Validasi arah gudang berdasarkan tipe transaksi (RECEIPT/ISSUE/TRANSFER). */
function validateKindDirection(kind: string, details: DetailInput[]): void {
  const msgs: string[] = [];
  for (let i = 0; i < details.length; i++) {
    const d = details[i];
    if (kind === "RECEIPT") {
      if (d.fromWarehouseId) msgs.push(`Baris ${i + 1}: Receipt tidak boleh punya gudang asal.`);
      if (!d.toWarehouseId) msgs.push(`Baris ${i + 1}: Receipt wajib punya gudang tujuan.`);
    } else if (kind === "ISSUE") {
      if (d.toWarehouseId) msgs.push(`Baris ${i + 1}: Issue tidak boleh punya gudang tujuan.`);
      if (!d.fromWarehouseId) msgs.push(`Baris ${i + 1}: Issue wajib punya gudang asal.`);
    } else if (kind === "TRANSFER") {
      if (!d.fromWarehouseId || !d.toWarehouseId) {
        msgs.push(`Baris ${i + 1}: Transfer wajib punya gudang asal dan tujuan.`);
      }
    }
  }
  if (msgs.length > 0) throw new Error(msgs.join(" "));
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? String(v[0]) : String(v);
}

function parseBody(body: unknown): { ok: true; value: MovementInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const typeId = typeof b.typeId === "string" ? b.typeId.trim() : "";
  const status = typeof b.status === "string" ? b.status : "DRAFT";
  if (!typeId) return { ok: false, error: "Tipe transaksi wajib diisi." };
  if (!MOVEMENT_STATUSES.includes(status as MovementStatus)) {
    return { ok: false, error: `Status tidak valid: ${status}.` };
  }
  const detailsRaw = Array.isArray(b.details) ? b.details : [];
  const details: DetailInput[] = [];
  for (const raw of detailsRaw) {
    const d = (raw ?? {}) as Record<string, unknown>;
    const itemId = typeof d.itemId === "string" ? d.itemId.trim() : "";
    const qty = Number(d.qty);
    if (!itemId) return { ok: false, error: "Setiap baris wajib memilih item." };
    if (!Number.isFinite(qty) || qty <= 0) {
      return { ok: false, error: "Qty tiap baris harus lebih dari 0." };
    }
    const from = typeof d.fromWarehouseId === "string" && d.fromWarehouseId ? d.fromWarehouseId : null;
    const to = typeof d.toWarehouseId === "string" && d.toWarehouseId ? d.toWarehouseId : null;
    if (!from && !to) {
      return { ok: false, error: "Setiap baris wajib punya gudang asal atau tujuan." };
    }
    if (from && to && from === to) {
      return { ok: false, error: "Gudang asal dan tujuan tidak boleh sama." };
    }
    details.push({
      itemId,
      fromWarehouseId: from,
      toWarehouseId: to,
      qty,
      uomId: typeof d.uomId === "string" && d.uomId ? d.uomId : null,
      batchNumber:
        typeof d.batchNumber === "string" && d.batchNumber.trim()
          ? d.batchNumber.trim()
          : null,
    });
  }
  if (details.length === 0) return { ok: false, error: "Minimal 1 baris detail diperlukan." };
  return {
    ok: true,
    value: {
      typeId,
      movementDate: typeof b.movementDate === "string" && b.movementDate ? b.movementDate : null,
      status: status as MovementStatus,
      referenceType: typeof b.referenceType === "string" && b.referenceType ? b.referenceType : null,
      referenceId: typeof b.referenceId === "string" && b.referenceId ? b.referenceId : null,
      description: typeof b.description === "string" && b.description ? b.description : null,
      details,
    },
  };
}

/** Token tanggal dalam series: dd (hari), MM (bulan), yy (tahun 2 digit),
 * yyyy (tahun 4 digit), HH (jam). Contoh series "RCV-DDMMYY" → "RCV-250817". */
function expandSeriesDate(series: string, date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  let s = series.toUpperCase();
  s = s.replace(/YYYY/g, String(date.getFullYear()));
  s = s.replace(/YY/g, pad(date.getFullYear() % 100));
  s = s.replace(/DD/g, pad(date.getDate()));
  s = s.replace(/MM/g, pad(date.getMonth() + 1));
  s = s.replace(/HH/g, pad(date.getHours()));
  return s;
}

async function nextMovementNumber(tx: Tx, series: string, date: Date): Promise<string> {
  const expanded = expandSeriesDate(series, date);
  const safeSeries = /^[A-Za-z0-9_-]{1,20}$/.test(expanded) ? expanded : "SMV";
  await tx.execute(sql`LOCK TABLE stock_movements IN EXCLUSIVE MODE`);
  const rows = await tx.select({ n: schema.stockMovements.movementNumber }).from(schema.stockMovements);
  const prefix = `${safeSeries}-`;
  const max = rows.reduce((m, r) => {
    const id = String(r.n);
    if (!id.startsWith(prefix)) return m;
    const n = Number(id.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

async function validateWarehouseAccess(req: Request, res: Response, details: DetailInput[]): Promise<boolean> {
  if (await isAdminUser(req.user!.role)) return true;
  for (const d of details) {
    for (const whId of [d.fromWarehouseId, d.toWarehouseId]) {
      if (whId && !(await canAccessEntity(req.user!.role, "WAREHOUSE", whId))) {
        res.status(403).json({ error: `Tidak punya akses ke gudang ${whId}.` });
        return false;
      }
    }
  }
  return true;
}

/** Cari atau buat batch (item, batch_number) — id batch dikembalikan. */
async function resolveBatch(
  tx: Tx,
  itemId: string,
  batchNumber: string | null
): Promise<string | null> {
  if (!batchNumber) return null;
  const [existing] = await tx
    .select({ id: schema.batches.id })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.itemId, itemId),
        eq(schema.batches.batchNumber, batchNumber)
      )
    )
    .limit(1);
  if (existing) return existing.id;
  const id = `bat_${crypto.randomUUID()}`;
  await tx.insert(schema.batches).values({
    id,
    itemId,
    batchNumber,
    status: "ACTIVE",
  });
  return id;
}

/**
 * Terapkan efek stok:
 * 1. stock_balances (agregat per warehouse+item) — in/out/closing.
 * 2. stock_batches (per batch+warehouse) — hanya baris yang punya batch.
 * 3. stock_ledger — per baris efek; saldo berjalan per batch kalau ada batch,
 *    selain itu saldo agregat.
 */
async function applyMovementEffect(
  tx: Tx,
  movement: { id: string; typeId: string; movementNumber: string; referenceType: string | null; referenceId: string | null },
  typeCode: string,
  details: EffectDetail[],
  actorId: string
) {
  const now = new Date();

  // --- 0. Validasi stok gudang asal mencukupi (agregat per warehouse+item) ---
  const outNeeds = new Map<string, number>();
  const keyOf = (wh: string, it: string) => `${wh}|${it}`;
  for (const d of details) {
    if (d.fromWarehouseId) {
      const k = keyOf(d.fromWarehouseId, d.itemId);
      outNeeds.set(k, (outNeeds.get(k) ?? 0) + d.qty);
    }
  }
  for (const [k, need] of outNeeds.entries()) {
    const [warehouseId, itemId] = k.split("|");
    const [existing] = await tx
      .select({
        closingQty: schema.stockBalances.closingQty,
        itemName: schema.items.name,
        warehouseName: schema.warehouses.name,
      })
      .from(schema.stockBalances)
      .innerJoin(schema.items, eq(schema.items.id, schema.stockBalances.itemId))
      .innerJoin(schema.warehouses, eq(schema.warehouses.id, schema.stockBalances.warehouseId))
      .where(
        and(
          eq(schema.stockBalances.warehouseId, warehouseId),
          eq(schema.stockBalances.itemId, itemId)
        )
      )
      .for("update")
      .limit(1);
    const available = Number(existing?.closingQty ?? 0);
    if (available < need) {
      const itemName = existing?.itemName ?? itemId;
      const whName = existing?.warehouseName ?? warehouseId;
      const shortage = need - available;
      throw new StockError(
        `Stok "${itemName}" di ${whName} tidak mencukupi: tersedia ${available}, dibutuhkan ${need}, kurang ${shortage}.`
      );
    }
  }

  // --- 1. Update stock_balances agregat ---
  const aggSeen = new Map<string, number>();
  for (const d of details) {
    if (d.fromWarehouseId) {
      const k = keyOf(d.fromWarehouseId, d.itemId);
      aggSeen.set(k, (aggSeen.get(k) ?? 0) - d.qty);
    }
    if (d.toWarehouseId) {
      const k = keyOf(d.toWarehouseId, d.itemId);
      aggSeen.set(k, (aggSeen.get(k) ?? 0) + d.qty);
    }
  }
  const aggClosing = new Map<string, number>();
  for (const [k, delta] of aggSeen.entries()) {
    if (delta === 0) continue;
    const [warehouseId, itemId] = k.split("|");
    const [existing] = await tx
      .select()
      .from(schema.stockBalances)
      .where(
        and(
          eq(schema.stockBalances.warehouseId, warehouseId),
          eq(schema.stockBalances.itemId, itemId)
        )
      )
      .limit(1);
    const prevIn = existing?.inQty ?? 0;
    const prevOut = existing?.outQty ?? 0;
    const prevClosing = existing?.closingQty ?? 0;
    const inDelta = Math.max(delta, 0);
    const outDelta = Math.max(-delta, 0);
    const newClosing = prevClosing + inDelta - outDelta;
    if (existing) {
      await tx
        .update(schema.stockBalances)
        .set({
          inQty: prevIn + inDelta,
          outQty: prevOut + outDelta,
          closingQty: newClosing,
          updatedAt: now,
        })
        .where(eq(schema.stockBalances.id, existing.id));
    } else {
      await tx.insert(schema.stockBalances).values({
        id: `sb_${crypto.randomUUID()}`,
        warehouseId,
        itemId,
        openingQty: 0,
        inQty: inDelta,
        outQty: outDelta,
        closingQty: newClosing,
        updatedAt: now,
      });
    }
    aggClosing.set(k, newClosing);
  }

  // --- 2. Update stock_batches per (batch, warehouse) ---
  const batchSeen = new Map<string, { batchId: string; warehouseId: string; delta: number }>();
  for (const d of details) {
    if (!d.batchId) continue;
    if (d.fromWarehouseId) {
      const bk = `${d.batchId}|${d.fromWarehouseId}`;
      const cur = batchSeen.get(bk);
      if (cur) cur.delta -= d.qty;
      else batchSeen.set(bk, { batchId: d.batchId, warehouseId: d.fromWarehouseId, delta: -d.qty });
    }
    if (d.toWarehouseId) {
      const bk = `${d.batchId}|${d.toWarehouseId}`;
      const cur = batchSeen.get(bk);
      if (cur) cur.delta += d.qty;
      else batchSeen.set(bk, { batchId: d.batchId, warehouseId: d.toWarehouseId, delta: d.qty });
    }
  }
  const batchBalance = new Map<string, number>();
  for (const { batchId, warehouseId, delta } of batchSeen.values()) {
    if (delta === 0) continue;
    const [row] = await tx
      .select()
      .from(schema.stockBatches)
      .where(
        and(
          eq(schema.stockBatches.batchId, batchId),
          eq(schema.stockBatches.warehouseId, warehouseId)
        )
      )
      .for("update")
      .limit(1);
    const prev = Number(row?.qty ?? 0);
    const next = prev + delta;
    if (next < 0) {
      throw new StockError(
        `Stok batch tidak mencukupi di gudang asal: tersedia ${prev}, dibutuhkan ${-delta} untuk batch ${batchId}.`
      );
    }
    if (row) {
      await tx
        .update(schema.stockBatches)
        .set({ qty: String(next), updatedAt: now })
        .where(eq(schema.stockBatches.id, row.id));
    } else {
      await tx.insert(schema.stockBatches).values({
        id: `stb_${crypto.randomUUID()}`,
        batchId,
        warehouseId,
        qty: String(next),
        updatedAt: now,
      });
    }
    batchBalance.set(`${batchId}|${warehouseId}`, next);
    await tx
      .update(schema.batches)
      .set({ status: next === 0 ? "EMPTY" : "ACTIVE", updatedAt: now })
      .where(eq(schema.batches.id, batchId));
  }

  // --- 3. Ledger — per baris efek (out & in) ---
  for (const d of details) {
    const sides: { warehouseId: string; sign: -1 | 1 }[] = [];
    if (d.fromWarehouseId) sides.push({ warehouseId: d.fromWarehouseId, sign: -1 });
    if (d.toWarehouseId) sides.push({ warehouseId: d.toWarehouseId, sign: 1 });
    for (const side of sides) {
      const inDelta = side.sign > 0 ? d.qty : 0;
      const outDelta = side.sign < 0 ? d.qty : 0;
      const balance = d.batchId
        ? (batchBalance.get(`${d.batchId}|${side.warehouseId}`) ?? 0)
        : (aggClosing.get(keyOf(side.warehouseId, d.itemId)) ?? 0);
      await tx.insert(schema.stockLedger).values({
        id: `sld_${crypto.randomUUID()}`,
        transactionId: movement.id,
        transactionType: typeCode,
        transactionDate: now,
        itemId: d.itemId,
        warehouseId: side.warehouseId,
        qtyIn: String(inDelta),
        qtyOut: String(outDelta),
        qtyBalance: String(balance),
        referenceType: movement.referenceType ?? "STOCK_MOVEMENT",
        referenceId: movement.referenceId ?? movement.movementNumber,
        batchId: d.batchId,
        createdBy: actorId,
      });
    }
  }
}

async function insertMovementWithDetails(
  tx: Tx,
  input: MovementInput,
  actorId: string
): Promise<string> {
  const movementId = `smv_${crypto.randomUUID()}`;

  const [type] = await tx
    .select({ code: schema.movementTypes.code, kind: schema.movementTypes.kind, series: schema.movementTypes.series })
    .from(schema.movementTypes)
    .where(eq(schema.movementTypes.id, input.typeId))
    .limit(1);
  if (!type) throw new Error("Tipe transaksi tidak ditemukan.");

  validateKindDirection(type.kind, input.details);

  const movementDate = input.movementDate ? new Date(input.movementDate) : new Date();
  const movementNumber = await nextMovementNumber(tx, type.series, movementDate);

  await tx.insert(schema.stockMovements).values({
    id: movementId,
    movementNumber,
    typeId: input.typeId,
    movementDate,
    status: input.status,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    description: input.description,
    createdBy: actorId,
  });

  const effectDetails: EffectDetail[] = [];
  for (const d of input.details) {
    const batchId = await resolveBatch(tx, d.itemId, d.batchNumber ?? null);
    await tx.insert(schema.stockMovementDetails).values({
      id: `smd_${crypto.randomUUID()}`,
      movementId,
      itemId: d.itemId,
      fromWarehouseId: d.fromWarehouseId,
      toWarehouseId: d.toWarehouseId,
      qty: String(d.qty),
      uomId: d.uomId,
      batchId,
    });
    effectDetails.push({
      itemId: d.itemId,
      fromWarehouseId: d.fromWarehouseId ?? null,
      toWarehouseId: d.toWarehouseId ?? null,
      qty: d.qty,
      batchId,
    });
  }

  if (input.status === "POSTED") {
    await applyMovementEffect(
      tx,
      { id: movementId, typeId: input.typeId, movementNumber, referenceType: input.referenceType, referenceId: input.referenceId },
      type.code,
      effectDetails,
      actorId
    );
  }

  return movementId;
}

async function movementScope(req: Request) {
  if (!req.user) return undefined;
  if (req.user.role === "role_sys_admin") return undefined;
  const warehouseIds = req.accessibleWarehouseIds ?? [];
  if (warehouseIds.length === 0) return sql`FALSE`;
  const s = schema;
  return inArray(
    s.stockMovements.id,
    db
      .select({ id: s.stockMovements.id })
      .from(s.stockMovements)
      .innerJoin(s.stockMovementDetails, eq(s.stockMovementDetails.movementId, s.stockMovements.id))
      .where(
        or(
          inArray(s.stockMovementDetails.fromWarehouseId, warehouseIds),
          inArray(s.stockMovementDetails.toWarehouseId, warehouseIds)
        )
      )
  );
}

/* ------------------------------------------------------------------ */
/* GET  /api/transactions                                             */
/* ------------------------------------------------------------------ */
transactionsRouter.get("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "view"))) return;

  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 1), 100);

  const conditions: ReturnType<typeof sql>[] = [];
  const scope = await movementScope(req);
  if (scope) conditions.push(scope);

  const q = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (q) {
    const p = `%${q}%`;
    const s = schema;
    conditions.push(sql`${s.stockMovements.movementNumber}::text ILIKE ${p}`);
  }
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : null;
  if (status) conditions.push(sql`${schema.stockMovements.status} = ${status}`);
  const typeId = typeof req.query.typeId === "string" && req.query.typeId ? req.query.typeId : null;
  if (typeId) conditions.push(eq(schema.stockMovements.typeId, typeId));

  const fromWarehouseId = typeof req.query.fromWarehouseId === "string" && req.query.fromWarehouseId ? req.query.fromWarehouseId : null;
  if (fromWarehouseId) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${schema.stockMovementDetails}
      WHERE ${schema.stockMovementDetails.movementId} = ${schema.stockMovements.id}
        AND ${schema.stockMovementDetails.fromWarehouseId} = ${fromWarehouseId}
    )`);
  }
  const toWarehouseId = typeof req.query.toWarehouseId === "string" && req.query.toWarehouseId ? req.query.toWarehouseId : null;
  if (toWarehouseId) {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${schema.stockMovementDetails}
      WHERE ${schema.stockMovementDetails.movementId} = ${schema.stockMovements.id}
        AND ${schema.stockMovementDetails.toWarehouseId} = ${toWarehouseId}
    )`);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const s = schema;
  const agg = db
    .select({
      movementId: s.stockMovementDetails.movementId,
      detailCount: count(s.stockMovementDetails.id).as("detail_count"),
      totalQty: sql<number>`COALESCE(SUM(${s.stockMovementDetails.qty}), 0)::float`.as("total_qty"),
    })
    .from(s.stockMovementDetails)
    .groupBy(s.stockMovementDetails.movementId)
    .as("agg");

  const [{ total }] = await db
    .select({ total: count() })
    .from(s.stockMovements)
    .where(where);

  const rows = await db
    .select({
      id: s.stockMovements.id,
      movementNumber: s.stockMovements.movementNumber,
      typeId: s.stockMovements.typeId,
      typeCode: s.movementTypes.code,
      typeName: s.movementTypes.name,
      movementDate: s.stockMovements.movementDate,
      status: s.stockMovements.status,
      referenceType: s.stockMovements.referenceType,
      referenceId: s.stockMovements.referenceId,
      description: s.stockMovements.description,
      createdBy: s.stockMovements.createdBy,
      createdByName: s.users.name,
      createdAt: s.stockMovements.createdAt,
      detailCount: agg.detailCount,
      totalQty: agg.totalQty,
    })
    .from(s.stockMovements)
    .leftJoin(s.movementTypes, eq(s.movementTypes.id, s.stockMovements.typeId))
    .leftJoin(s.users, eq(s.users.id, s.stockMovements.createdBy))
    .leftJoin(agg, eq(agg.movementId, s.stockMovements.id))
    .where(where)
    .orderBy(desc(s.stockMovements.movementDate), desc(s.stockMovements.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    rows: rows.map((r) => ({
      ...r,
      detailCount: Number(r.detailCount ?? 0),
      totalQty: Number(r.totalQty ?? 0),
    })),
    total: Number(total),
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(Number(total) / pageSize), 1),
  });
});

/* ------------------------------------------------------------------ */
/* GET  /api/transactions/:id                                         */
/* ------------------------------------------------------------------ */
transactionsRouter.get("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "view"))) return;

  const s = schema;
  const [movement] = await db
    .select({
      id: s.stockMovements.id,
      movementNumber: s.stockMovements.movementNumber,
      typeId: s.stockMovements.typeId,
      typeCode: s.movementTypes.code,
      typeName: s.movementTypes.name,
      movementDate: s.stockMovements.movementDate,
      status: s.stockMovements.status,
      referenceType: s.stockMovements.referenceType,
      referenceId: s.stockMovements.referenceId,
      description: s.stockMovements.description,
      createdBy: s.stockMovements.createdBy,
      createdByName: s.users.name,
      createdAt: s.stockMovements.createdAt,
      updatedAt: s.stockMovements.updatedAt,
    })
    .from(s.stockMovements)
    .leftJoin(s.movementTypes, eq(s.movementTypes.id, s.stockMovements.typeId))
    .leftJoin(s.users, eq(s.users.id, s.stockMovements.createdBy))
    .where(eq(s.stockMovements.id, param(req, "id")))
    .limit(1);

  if (!movement) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }

  const fromWh = alias(s.warehouses, "from_wh");
  const toWh = alias(s.warehouses, "to_wh");

  const details = await db
    .select({
      id: s.stockMovementDetails.id,
      movementId: s.stockMovementDetails.movementId,
      itemId: s.stockMovementDetails.itemId,
      itemCode: s.items.code,
      itemName: s.items.name,
      unit: s.items.unit,
      fromWarehouseId: s.stockMovementDetails.fromWarehouseId,
      fromWarehouseCode: fromWh.code,
      fromWarehouseName: fromWh.name,
      toWarehouseId: s.stockMovementDetails.toWarehouseId,
      toWarehouseCode: toWh.code,
      toWarehouseName: toWh.name,
      qty: s.stockMovementDetails.qty,
      uomId: s.stockMovementDetails.uomId,
      uomCode: s.uom.code,
      uomName: s.uom.name,
      batchId: s.stockMovementDetails.batchId,
      batchNumber: s.batches.batchNumber,
      createdAt: s.stockMovementDetails.createdAt,
    })
    .from(s.stockMovementDetails)
    .leftJoin(s.items, eq(s.items.id, s.stockMovementDetails.itemId))
    .leftJoin(s.uom, eq(s.uom.id, s.stockMovementDetails.uomId))
    .leftJoin(s.batches, eq(s.batches.id, s.stockMovementDetails.batchId))
    .leftJoin(fromWh, eq(fromWh.id, s.stockMovementDetails.fromWarehouseId))
    .leftJoin(toWh, eq(toWh.id, s.stockMovementDetails.toWarehouseId))
    .where(eq(s.stockMovementDetails.movementId, movement.id))
    .orderBy(s.stockMovementDetails.createdAt);

  res.json({
    ...movement,
    details: details.map((d) => ({
      ...d,
      qty: Number(d.qty),
      fromWarehouseCode: d.fromWarehouseCode ?? null,
      fromWarehouseName: d.fromWarehouseName ?? null,
      toWarehouseCode: d.toWarehouseCode ?? null,
      toWarehouseName: d.toWarehouseName ?? null,
      batchNumber: d.batchNumber ?? null,
    })),
  });
});

/* ------------------------------------------------------------------ */
/* POST /api/transactions                                             */
/* ------------------------------------------------------------------ */
transactionsRouter.post("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "create"))) return;

  const parsed = parseBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const input = parsed.value;
  if (!(await validateWarehouseAccess(req, res, input.details))) return;

  try {
    const id = await db.transaction((tx) => insertMovementWithDetails(tx, input, req.user!.id));
    res.status(201).json({ id });
  } catch (e) {
    console.error("POST /transactions", e);
    if (e instanceof StockError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Gagal membuat transaksi." });
  }
});

/* ------------------------------------------------------------------ */
/* PATCH /api/transactions/:id — hanya DRAFT (ganti header + detail)  */
/* ------------------------------------------------------------------ */
transactionsRouter.patch("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "update"))) return;

  const [existing] = await db
    .select({ status: schema.stockMovements.status, movementNumber: schema.stockMovements.movementNumber })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.id, param(req, "id")))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }
  if (existing.status !== "DRAFT") {
    res.status(400).json({ error: "Hanya transaksi berstatus DRAFT yang bisa diubah." });
    return;
  }

  const parsed = parseBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const input = parsed.value;
  if (!(await validateWarehouseAccess(req, res, input.details))) return;

  try {
    const [type] = await db
      .select({ code: schema.movementTypes.code, kind: schema.movementTypes.kind })
      .from(schema.movementTypes)
      .where(eq(schema.movementTypes.id, input.typeId))
      .limit(1);
    if (!type) {
      res.status(400).json({ error: "Tipe transaksi tidak ditemukan." });
      return;
    }
    try {
      validateKindDirection(type.kind, input.details);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    await db.transaction(async (tx) => {
      await tx.delete(schema.stockMovementDetails).where(eq(schema.stockMovementDetails.movementId, param(req, "id")));
      await tx
        .update(schema.stockMovements)
        .set({
          typeId: input.typeId,
          movementDate: input.movementDate ? new Date(input.movementDate) : new Date(),
          status: input.status,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          description: input.description,
          updatedAt: new Date(),
        })
        .where(eq(schema.stockMovements.id, param(req, "id")));
      const effectDetails: EffectDetail[] = [];
      for (const d of input.details) {
        const batchId = await resolveBatch(tx, d.itemId, d.batchNumber ?? null);
        await tx.insert(schema.stockMovementDetails).values({
          id: `smd_${crypto.randomUUID()}`,
          movementId: param(req, "id"),
          itemId: d.itemId,
          fromWarehouseId: d.fromWarehouseId,
          toWarehouseId: d.toWarehouseId,
          qty: String(d.qty),
          uomId: d.uomId,
          batchId,
        });
        effectDetails.push({
          itemId: d.itemId,
          fromWarehouseId: d.fromWarehouseId ?? null,
          toWarehouseId: d.toWarehouseId ?? null,
          qty: d.qty,
          batchId,
        });
      }
      if (input.status === "POSTED") {
        await applyMovementEffect(
          tx,
          { id: param(req, "id"), typeId: input.typeId, movementNumber: existing.movementNumber, referenceType: input.referenceType, referenceId: input.referenceId },
          type.code,
          effectDetails,
          req.user!.id
        );
      }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH /transactions", e);
    if (e instanceof StockError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Gagal menyimpan transaksi." });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/transactions/:id/post — posting DRAFT → terapkan stok    */
/* ------------------------------------------------------------------ */
transactionsRouter.post("/:id/post", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "update"))) return;

  const [movement] = await db
    .select({
      id: schema.stockMovements.id,
      movementNumber: schema.stockMovements.movementNumber,
      typeId: schema.stockMovements.typeId,
      status: schema.stockMovements.status,
      referenceType: schema.stockMovements.referenceType,
      referenceId: schema.stockMovements.referenceId,
    })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.id, param(req, "id")))
    .limit(1);
  if (!movement) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }
  if (movement.status !== "DRAFT") {
    res.status(400).json({ error: "Transaksi sudah diposting." });
    return;
  }

  const detailsRaw = await db
    .select({
      itemId: schema.stockMovementDetails.itemId,
      fromWarehouseId: schema.stockMovementDetails.fromWarehouseId,
      toWarehouseId: schema.stockMovementDetails.toWarehouseId,
      qty: schema.stockMovementDetails.qty,
      uomId: schema.stockMovementDetails.uomId,
      batchId: schema.stockMovementDetails.batchId,
    })
    .from(schema.stockMovementDetails)
    .where(eq(schema.stockMovementDetails.movementId, movement.id));
  const details: EffectDetail[] = detailsRaw.map((d) => ({
    itemId: d.itemId,
    fromWarehouseId: d.fromWarehouseId,
    toWarehouseId: d.toWarehouseId,
    qty: Number(d.qty),
    batchId: d.batchId,
  }));

  if (details.length === 0) {
    res.status(400).json({ error: "Transaksi tanpa detail tidak bisa diposting." });
    return;
  }
  if (!(await validateWarehouseAccess(req, res, details))) return;

  try {
    await db.transaction(async (tx) => {
      const [type] = await tx
        .select({ code: schema.movementTypes.code })
        .from(schema.movementTypes)
        .where(eq(schema.movementTypes.id, movement.typeId))
        .limit(1);
      if (!type) throw new Error("Tipe transaksi tidak ditemukan.");
      await applyMovementEffect(
        tx,
        movement,
        type.code,
        details,
        req.user!.id
      );
      await tx
        .update(schema.stockMovements)
        .set({ status: "POSTED", updatedAt: new Date() })
        .where(eq(schema.stockMovements.id, movement.id));
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /transactions/:id/post", e);
    if (e instanceof StockError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    res.status(500).json({ error: "Gagal memposting transaksi." });
  }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/transactions/:id — hanya DRAFT                          */
/* ------------------------------------------------------------------ */
transactionsRouter.delete("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "delete"))) return;

  const [movement] = await db
    .select({ status: schema.stockMovements.status })
    .from(schema.stockMovements)
    .where(eq(schema.stockMovements.id, param(req, "id")))
    .limit(1);
  if (!movement) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }
  if (movement.status !== "DRAFT") {
    res.status(400).json({ error: "Hanya transaksi berstatus DRAFT yang bisa dihapus." });
    return;
  }
  try {
    await db.delete(schema.stockMovements).where(eq(schema.stockMovements.id, param(req, "id")));
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /transactions", e);
    res.status(500).json({ error: "Gagal menghapus transaksi." });
  }
});

/* ------------------------------------------------------------------ */
/* GET  /api/stock-ledger                                             */
/* ------------------------------------------------------------------ */
stockLedgerRouter.get("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.stockLedger", "view"))) return;

  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || DEFAULT_PAGE_SIZE, 1), 100);

  const s = schema;
  const conditions: ReturnType<typeof sql>[] = [];
  const warehouseIds = req.accessibleWarehouseIds ?? [];
  if (req.user && req.user.role !== "role_sys_admin") {
    if (warehouseIds.length === 0) conditions.push(sql`FALSE`);
    else conditions.push(inArray(s.stockLedger.warehouseId, warehouseIds));
  }
  const warehouseId = typeof req.query.warehouseId === "string" && req.query.warehouseId ? req.query.warehouseId : null;
  if (warehouseId) conditions.push(eq(s.stockLedger.warehouseId, warehouseId));
  const itemId = typeof req.query.itemId === "string" && req.query.itemId ? req.query.itemId : null;
  if (itemId) conditions.push(eq(s.stockLedger.itemId, itemId));
  const from = typeof req.query.from === "string" && req.query.from ? req.query.from : null;
  if (from) conditions.push(gte(s.stockLedger.transactionDate, new Date(`${from}T00:00:00`)));
  const to = typeof req.query.to === "string" && req.query.to ? req.query.to : null;
  if (to) conditions.push(lte(s.stockLedger.transactionDate, new Date(`${to}T23:59:59`)));
  const q = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (q) {
    const p = `%${q}%`;
    conditions.push(sql`(
      ${s.stockLedger.transactionId}::text ILIKE ${p}
      OR ${s.stockLedger.transactionType}::text ILIKE ${p}
      OR ${s.stockLedger.referenceId}::text ILIKE ${p}
      OR EXISTS (
        SELECT 1 FROM ${s.items} WHERE ${s.items.id} = ${s.stockLedger.itemId}
          AND (${s.items.code}::text ILIKE ${p} OR ${s.items.name}::text ILIKE ${p})
      )
    )`);
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: count() })
    .from(s.stockLedger)
    .where(where);

  const rows = await db
    .select({
      id: s.stockLedger.id,
      transactionId: s.stockLedger.transactionId,
      transactionType: s.stockLedger.transactionType,
      transactionDate: s.stockLedger.transactionDate,
      itemId: s.stockLedger.itemId,
      itemCode: s.items.code,
      itemName: s.items.name,
      unit: s.items.unit,
      warehouseId: s.stockLedger.warehouseId,
      warehouseCode: s.warehouses.code,
      warehouseName: s.warehouses.name,
      locationId: s.stockLedger.locationId,
      locationName: s.locations.name,
      qtyIn: s.stockLedger.qtyIn,
      qtyOut: s.stockLedger.qtyOut,
      qtyBalance: s.stockLedger.qtyBalance,
      referenceType: s.stockLedger.referenceType,
      referenceId: s.stockLedger.referenceId,
      batchId: s.stockLedger.batchId,
      batchNumber: s.batches.batchNumber,
      createdBy: s.stockLedger.createdBy,
      createdByName: s.users.name,
      createdAt: s.stockLedger.createdAt,
    })
    .from(s.stockLedger)
    .leftJoin(s.items, eq(s.items.id, s.stockLedger.itemId))
    .leftJoin(s.warehouses, eq(s.warehouses.id, s.stockLedger.warehouseId))
    .leftJoin(s.locations, eq(s.locations.id, s.stockLedger.locationId))
    .leftJoin(s.batches, eq(s.batches.id, s.stockLedger.batchId))
    .leftJoin(s.users, eq(s.users.id, s.stockLedger.createdBy))
    .where(where)
    .orderBy(desc(s.stockLedger.transactionDate), desc(s.stockLedger.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    rows: rows.map((r) => ({
      ...r,
      qtyIn: Number(r.qtyIn),
      qtyOut: Number(r.qtyOut),
      qtyBalance: Number(r.qtyBalance),
    })),
    total: Number(total),
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(Number(total) / pageSize), 1),
  });
});
