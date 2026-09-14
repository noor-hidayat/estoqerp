// @ts-nocheck
import { Router } from "express";
import type { Request, Response } from "express";
import {
  and,
  asc,
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
import { parseBatchNumber, type BatchFormatLike } from "../lib/batch-parse";
import { nextRowId, yymmOf } from "../lib/id";
import {
  canAccessEntity,
  checkPermission,
  isAdminUser,
} from "../middleware/rbac";
import { logActivity, getActorInfo } from "../lib/activity-log";
import { computeDiff, diffLines, DIFF_DENYLIST } from "../lib/diff";

export const transactionsRouter = Router();
export const stockLedgerRouter = Router();

type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

const MOVEMENT_STATUSES = ["DRAFT", "POSTED", "CANCELED"] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export interface DetailInput {
  itemId: string;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  qty: number;
  uomId?: string | null;
  batchNumber?: string | null;
  barcode?: string | null;
  serialNumber?: string | null;
  incomingRate?: number | null;
}

interface EffectDetail {
  itemId: string;
  fromWarehouseId: string | null;
  toWarehouseId: string | null;
  qty: number;
  batchId: string | null;
  incomingRate?: number | null;
}

export interface MovementInput {
  typeId: string;
  movementDate: string | null;
  status: MovementStatus;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  customerId?: string | null;
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
      const r = d.incomingRate;
      if (r == null || !Number.isFinite(r) || r <= 0) msgs.push(`Baris ${i + 1}: Receipt wajib ada harga (incomingRate > 0).`);
    } else if (kind === "ISSUE") {
      if (d.toWarehouseId) msgs.push(`Baris ${i + 1}: Issue tidak boleh punya gudang tujuan.`);
      if (!d.fromWarehouseId) msgs.push(`Baris ${i + 1}: Issue wajib punya gudang asal.`);
    } else if (kind === "TRANSFER") {
      if (!d.fromWarehouseId || !d.toWarehouseId) {
        msgs.push(`Baris ${i + 1}: Transfer wajib punya gudang asal dan tujuan.`);
      }
    }
  }
  if (msgs.length > 0) throw new StockError(msgs.join(" "));
}

function param(req: Request, name: string): string {
  const v = req.params[name];
  return Array.isArray(v) ? String(v[0]) : String(v);
}
function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function isDocumentNo(v: string): boolean {
  return /^[A-Z]{2,5}-\d{2,4}-?\d{1,6}$/i.test(v) || /^[A-Z]{2,5}-\d{4,}-\d+$/i.test(v) || /^[A-Z]+\-\d+.*$/i.test(v);
}
function movementWhere(pid: string) {
  if (isUuid(pid)) return eq(schema.stockMovements.publicId, pid);
  if (isDocumentNo(pid)) return eq(schema.stockMovements.documentNo, pid);
  if (/^\d+$/.test(pid)) return eq(schema.stockMovements.id, Number(pid) as any);
  return eq(schema.stockMovements.documentNo, pid);
}

function parseBody(body: unknown): { ok: true; value: MovementInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const typeId = typeof b.typeId === "string" ? b.typeId.trim() : "";
  const status = typeof b.status === "string" ? b.status : "DRAFT";
  if (!typeId) return { ok: false, error: "Tipe transaksi wajib diisi." };
  if (!MOVEMENT_STATUSES.includes(status as MovementStatus)) {
    return { ok: false, error: `Status tidak valid: ${status}.` };
  }
  const customerId = typeof b.customerId === "string" && b.customerId.trim() ? b.customerId.trim() : null;
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
      barcode:
        typeof d.barcode === "string" && d.barcode.trim()
          ? d.barcode.trim()
          : null,
      serialNumber:
        typeof d.serialNumber === "string" && d.serialNumber.trim()
          ? d.serialNumber.trim()
          : null,
      incomingRate:
        d.incomingRate != null && String(d.incomingRate).trim() !== ""
          ? Number(d.incomingRate)
          : d.unitPrice != null && String(d.unitPrice).trim() !== ""
            ? Number(d.unitPrice)
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
      customerId,
      details,
    },
  };
}

async function nextMovementNumber(tx: Tx, _series: string, date: Date): Promise<{documentNo: string, seriesId: number}> {
  const { nextDocumentNo } = await import("../lib/document-number");
  return nextDocumentNo(tx as any, "SMV", { date });
}

async function validateWarehouseAccess(req: Request, res: Response, details: DetailInput[]): Promise<boolean> {
  if (await isAdminUser(req.user!.role)) return true;
  // resolve publicIds to internal for check
  const resolveWh = async (v: string): Promise<number> => {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      const [r] = await db.select({ id: schema.warehouses.id }).from(schema.warehouses).where(eq(schema.warehouses.publicId, v)).limit(1);
      return r?.id ?? Number(v);
    }
    return Number(v);
  };
  const rawIds = [...new Set(details.flatMap((d) => [d.fromWarehouseId, d.toWarehouseId].filter(Boolean) as string[]))];
  const whIds = await Promise.all(rawIds.map(resolveWh));
  if (whIds.length === 0) return true;
  const rows = await db
    .select({ entityId: schema.branchAccesses.entityId })
    .from(schema.branchAccesses)
    .where(and(eq(schema.branchAccesses.roleId, req.user!.role), eq(schema.branchAccesses.entityType, "WAREHOUSE"), inArray(schema.branchAccesses.entityId, whIds)));
  const allowed = new Set(rows.map((r) => r.entityId));
  for (const whId of whIds) {
    if (!allowed.has(whId)) {
      res.status(403).json({ error: `Tidak punya akses ke gudang ${whId}.` });
      return false;
    }
  }
  return true;
}

/** Cek apakah string barcode cocok dengan format barcode aktif ber-flag
 *  uniqueBarcode (kriteria panjang segmen sama dengan lookup item). */
async function isUniqueBarcode(barcode: string): Promise<boolean> {
  const formats = await db
    .select({
      uniqueBarcode: schema.barcodeFormats.uniqueBarcode,
      segments: schema.barcodeFormats.segments,
    })
    .from(schema.barcodeFormats)
    .where(eq(schema.barcodeFormats.isActive, true));
  return formats.some((f) => {
    if (!f.uniqueBarcode) return false;
    const segs = (f.segments ?? []) as { end?: number }[];
    const maxEnd = segs.reduce((m, s) => Math.max(m, s.end ?? 0), 0);
    return maxEnd > 0 && barcode.length >= maxEnd;
  });
}

/** Validasi barcode unik terhadap statusnya di sistem (hanya transaksi
 *  POSTED yang menentukan lokasi barcode):
 *  - RECEIPT: barcode baru boleh; barcode masih aktif di gudang → tolak;
 *    barcode sudah keluar (issue) → boleh re-receipt.
 *  - ISSUE/TRANSFER/OTHER: barcode wajib pernah dibuat & berada di gudang
 *    asal. excludeMovementId untuk edit draft sendiri. */
async function assertUniqueBarcodes(
  details: DetailInput[],
  typeId: string,
  excludeMovementId?: string
): Promise<void> {
  let kind = "OTHER";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(typeId))) {
    const [r] = await db.select({ kind: schema.movementTypes.kind }).from(schema.movementTypes).where(eq(schema.movementTypes.publicId, String(typeId))).limit(1);
    kind = r?.kind ?? "OTHER";
  } else {
    const [type] = await db.select({ kind: schema.movementTypes.kind }).from(schema.movementTypes).where(eq(schema.movementTypes.id, Number(typeId) as any)).limit(1);
    kind = type?.kind ?? "OTHER";
  }

  for (const d of details) {
    if (!d.barcode) continue;
    if (!(await isUniqueBarcode(d.barcode))) continue;
    const conds: ReturnType<typeof sql>[] = [
      eq(schema.stockMovementDetails.barcode, d.barcode),
    ];
    if (excludeMovementId) {
      conds.push(
        sql`${schema.stockMovementDetails.movementId} != ${excludeMovementId}`
      );
    }
    const [row] = await db
      .select({
        toWarehouseId: schema.stockMovementDetails.toWarehouseId,
        warehouseCode: schema.warehouses.code,
        warehouseName: schema.warehouses.name,
      })
      .from(schema.stockMovementDetails)
      .innerJoin(
        schema.stockMovements,
        eq(schema.stockMovements.id, schema.stockMovementDetails.movementId)
      )
      .leftJoin(
        schema.warehouses,
        eq(schema.warehouses.id, schema.stockMovementDetails.toWarehouseId)
      )
      .where(and(...conds, eq(schema.stockMovements.status, "POSTED")))
      .orderBy(desc(schema.stockMovementDetails.createdAt))
      .limit(1);

    const loc =
      row && row.toWarehouseId
        ? row.warehouseCode ?? row.warehouseName ?? row.toWarehouseId
        : null;

    if (kind === "RECEIPT") {
      if (row?.toWarehouseId) {
        throw new StockError(
          `Barcode "${d.barcode}" sudah pernah dibuat dan masih ada di gudang ${loc} — tidak bisa di-receipt lagi.`
        );
      }
      continue;
    }
    if (!row) {
      throw new StockError(
        `Barcode "${d.barcode}" belum pernah dibuat (receipt) — tidak ada di sistem.`
      );
    }
    if (row.toWarehouseId && row.toWarehouseId !== d.fromWarehouseId) {
      throw new StockError(
        `Barcode "${d.barcode}" ada di gudang ${loc} — bukan gudang asal yang dipilih.`
      );
    }
    if (!row.toWarehouseId) {
      throw new StockError(
        `Barcode "${d.barcode}" sudah keluar dari sistem — tidak bisa di-issue/ditransfer.`
      );
    }
  }
}

/** Cari atau buat batch (item, batch_number) — id batch dikembalikan.
 *  Metadata (tanggal produksi/shift/custom) diisi otomatis dari parse format
 *  batch bila batch baru dan field-nya masih kosong. Bila batch number
 *  meng-encode kode alternatif item (segmen ALTERNATIVE_CODE), kode itu wajib
 *  cocok dengan item — kalau beda, posting ditolak (StockError). */
async function resolveBatch(
  tx: Tx,
  itemId: string,
  batchNumber: string | null,
  cachedFormats?: BatchFormatLike[] | null
): Promise<string | null> {
  if (!batchNumber) return null;
  const [item] = await tx
    .select({ alternativeCode: schema.items.alternativeCode })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .limit(1);
  const formats = cachedFormats ?? ((await db
    .select()
    .from(schema.batchFormats)
    .where(eq(schema.batchFormats.isActive, true))) as unknown as BatchFormatLike[]);
  const parsed = parseBatchNumber(batchNumber, formats);
  assertBatchItemMatch(parsed, item?.alternativeCode ?? null, batchNumber);
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
  if (existing) {
    await maybeFillBatchMeta(tx, existing.id, formats);
    return existing.id;
  }
  // id auto via identity - no manual id
  const values: typeof schema.batches.$inferInsert = {
    itemId,
    batchNumber,
    status: "ACTIVE",
  };
  if (parsed) {
    if (parsed.productionDate) values.productionDate = parsed.productionDate;
    if (parsed.shift) values.shift = parsed.shift;
    if (Object.keys(parsed.meta).length > 0) values.meta = parsed.meta;
  }
  await tx.insert(schema.batches).values(values).returning();
  const [created] = await tx
    .select({ id: schema.batches.id })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.itemId, itemId),
        eq(schema.batches.batchNumber, batchNumber)
      )
    )
    .limit(1);
  return created?.id ?? null;
}

/** Validasi kode alternatif item yang ter-encode di batch number. */
function assertBatchItemMatch(
  parsed: ReturnType<typeof parseBatchNumber>,
  itemAltCode: string | null,
  batchNumber: string
): void {
  const alt = parsed?.alternativeCode;
  if (!alt) return;
  if (!itemAltCode) return; // item belum punya kode alternatif — tidak bisa diverifikasi
  if (alt.trim().toLowerCase() !== itemAltCode.trim().toLowerCase()) {
    throw new StockError(
      `Batch "${batchNumber}" meng-encode kode alternatif "${alt}" tetapi item ini punya kode alternatif "${itemAltCode}" — batch tidak cocok dengan item.`
    );
  }
}

/** Isi metadata batch yang kosong dari parse batch number — hanya field yang
 *  belum terisi, agar edit manual tidak ditimpa. */
async function maybeFillBatchMeta(tx: Tx, batchId: string, cachedFormats?: BatchFormatLike[] | null) {
  const [row] = await tx
    .select({
      batchNumber: schema.batches.batchNumber,
      productionDate: schema.batches.productionDate,
      expiryDate: schema.batches.expiryDate,
      shift: schema.batches.shift,
      meta: schema.batches.meta,
    })
    .from(schema.batches)
    .where(eq(schema.batches.id, batchId))
    .limit(1);
  if (!row) return;
  const formats = cachedFormats ?? ((await db
    .select()
    .from(schema.batchFormats)
    .where(eq(schema.batchFormats.isActive, true))) as unknown as BatchFormatLike[]);
  const parsed = parseBatchNumber(row.batchNumber, formats);
  if (!parsed) return;
  const patch: Record<string, unknown> = {};
  if (!row.productionDate && parsed.productionDate) {
    patch.productionDate = parsed.productionDate;
  }
  if (!row.shift && parsed.shift) patch.shift = parsed.shift;
  if (parsed.meta && Object.keys(parsed.meta).length > 0) {
    const merged = { ...((row.meta ?? {}) as Record<string, string>), ...parsed.meta };
    patch.meta = merged;
  }
  if (Object.keys(patch).length > 0) {
    await tx
      .update(schema.batches)
      .set(patch)
      .where(eq(schema.batches.id, batchId));
  }
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
  movement: { id: string; typeId: string; movementDate: Date; referenceType: string | null; referenceId: string | null },
  typeCode: string,
  details: EffectDetail[],
  actorId: string
) {
  const t0 = Date.now();
  const now = new Date();

  // Resolve actorId (uuid publicId atau internal bigint) ke internal id untuk createdBy.
  let actorInternal: number | null = null;
  if (actorId != null && String(actorId).trim() !== "") {
    const s = String(actorId).trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      const [u] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.publicId, s))
        .limit(1);
      actorInternal = u?.id ?? null;
    } else if (/^\d+$/.test(s)) {
      actorInternal = Number(s);
    }
  }

  // --- 0 & 1. Validasi & Update stock_balances agregat (batch, incremental) ---
  const outNeeds = new Map<string, number>();
  const keyOf = (wh: string, it: string) => `${wh}|${it}`;
  for (const d of details) {
    if (d.fromWarehouseId) {
      const k = keyOf(d.fromWarehouseId, d.itemId);
      outNeeds.set(k, (outNeeds.get(k) ?? 0) + d.qty);
    }
  }
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
  // --- Valuation BEFORE stock_balances update so totalBefore is before movement
  const itemValuation = new Map<string, number>(); // itemId -> newRate
  const distinctItemIds = [...new Set(details.map((d) => d.itemId))];
  for (const itemId of distinctItemIds) {
    const [itemRow] = await tx
      .select({ valuationRate: schema.items.valuationRate })
      .from(schema.items)
      .where(eq(schema.items.id, itemId))
      .for("update")
      .limit(1);
    const curRate = Number(itemRow?.valuationRate ?? 0);
    const curRateNum = Number.isFinite(curRate) ? curRate : 0;
    const [qtyRow] = await tx
      .select({ totalQty: sql<string>`COALESCE(SUM(${schema.stockBalances.closingQty}),0)::text` })
      .from(schema.stockBalances)
      .where(eq(schema.stockBalances.itemId, itemId));
    const totalQtyBefore = Number(qtyRow?.totalQty ?? 0);
    let incomingQty = 0;
    let incomingValue = 0;
    let outgoingQty = 0;
    for (const d of details) {
      if (d.itemId !== itemId) continue;
      if (d.toWarehouseId) {
        incomingQty += d.qty;
        if (d.incomingRate != null && Number.isFinite(d.incomingRate)) incomingValue += d.qty * d.incomingRate;
      }
      if (d.fromWarehouseId) outgoingQty += d.qty;
    }
    const newTotalQty = totalQtyBefore + incomingQty - outgoingQty;
    let newRate = curRateNum;
    if (incomingQty > 0) {
      const curValue = curRateNum * totalQtyBefore;
      const newValue = curValue + incomingValue - outgoingQty * curRateNum;
      if (newTotalQty > 0) newRate = newValue / newTotalQty;
      else newRate = curRateNum;
      newRate = Math.round(newRate * 100) / 100;
      if (newRate < 0) newRate = 0;
      if (newRate !== curRateNum) {
        await tx.update(schema.items).set({ valuationRate: String(newRate) }).where(eq(schema.items.id, itemId));
      }
    }
    itemValuation.set(itemId, newRate);
  }

  if (aggSeen.size > 0) {
    const aggKeys = [...aggSeen.keys()];
    const aggValues = sql.join(
      aggKeys.map((k) => {
        const [wh, it] = k.split("|");
        return sql`(${wh}, ${it})`;
      }),
      sql`, `
    );
    // Batch SELECT FOR UPDATE for all wh+item combos
    const existingBalances = await tx
      .select()
      .from(schema.stockBalances)
      .where(sql`(warehouse_id, item_id) IN (VALUES ${aggValues})`)
      .for("update");
    const balMap = new Map(existingBalances.map((r) => [keyOf(r.warehouseId, r.itemId), r]));
    // Validasi stok mencukupi untuk outNeeds
    for (const [k, need] of outNeeds.entries()) {
      const existing = balMap.get(k);
      const available = Number(existing?.closingQty ?? 0);
      if (available < need) {
        const [warehouseId, itemId] = k.split("|");
        const [meta] = await tx
          .select({ itemName: schema.items.name, warehouseName: schema.warehouses.name })
          .from(schema.items)
          .innerJoin(schema.warehouses, sql`true`)
          .where(and(eq(schema.items.id, itemId), eq(schema.warehouses.id, warehouseId)))
          .limit(1);
        // Fallback simple names if join fails
        const itemName = meta?.itemName ?? itemId;
        const whName = meta?.warehouseName ?? warehouseId;
        const shortage = need - available;
        throw new StockError(
          `Stok "${itemName}" di ${whName} tidak mencukupi: tersedia ${available}, dibutuhkan ${need}, kurang ${shortage}.`
        );
      }
    }
    // Update balances (parallel)
    await Promise.all(
      [...aggSeen.entries()].map(async ([k, delta]) => {
        if (delta === 0) return;
        const [warehouseId, itemId] = k.split("|");
        const existing = balMap.get(k);
        const prevIn = Number(existing?.inQty ?? 0);
        const prevOut = Number(existing?.outQty ?? 0);
        const prevClosing = Number(existing?.closingQty ?? 0);
        const inDelta = Math.max(delta, 0);
        const outDelta = Math.max(-delta, 0);
        const newClosing = prevClosing + inDelta - outDelta;
        if (existing) {
          await tx
            .update(schema.stockBalances)
            .set({ inQty: prevIn + inDelta, outQty: prevOut + outDelta, closingQty: newClosing, updatedAt: now })
            .where(eq(schema.stockBalances.id, existing.id));
        } else {
          await tx.insert(schema.stockBalances).values({
            // id auto
            warehouseId,
            itemId,
            openingQty: 0,
            inQty: inDelta,
            outQty: outDelta,
            closingQty: newClosing,
            updatedAt: now,
          });
        }
      })
    );
  }

  // --- 2. Update stock_batches per (batch, warehouse) (batch) ---
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
  if (batchSeen.size > 0) {
    const batchKeys = [...batchSeen.values()];
    const batchValues = sql.join(
      batchKeys.map((b) => sql`(${b.batchId}, ${b.warehouseId})`),
      sql`, `
    );
    const existingBatches = await tx
      .select()
      .from(schema.stockBatches)
      .where(sql`(batch_id, warehouse_id) IN (VALUES ${batchValues})`)
      .for("update");
    const batchMap = new Map(existingBatches.map((r) => [`${r.batchId}|${r.warehouseId}`, r]));
    await Promise.all(
      [...batchSeen.values()].map(async ({ batchId, warehouseId, delta }) => {
        if (delta === 0) return;
        const row = batchMap.get(`${batchId}|${warehouseId}`);
        const prev = Number(row?.qty ?? 0);
        const next = prev + delta;
        if (next < 0) {
          throw new StockError(
            `Stok batch tidak mencukupi di gudang asal: tersedia ${prev}, dibutuhkan ${-delta} untuk batch ${batchId}.`
          );
        }
        if (row) {
          await tx.update(schema.stockBatches).set({ qty: String(next), updatedAt: now }).where(eq(schema.stockBatches.id, row.id));
        } else {
          await tx.insert(schema.stockBatches).values({
            // id auto
            batchId,
            warehouseId,
            qty: String(next),
            updatedAt: now,
          });
        }
        await tx.update(schema.batches).set({ status: next === 0 ? "EMPTY" : "ACTIVE", updatedAt: now }).where(eq(schema.batches.id, batchId));
      })
    );
  }

  // --- 3. Ledger — satu baris per (transaksi, item, gudang), qty dijumlahkan ---
  const ledAgg = new Map<
    string,
    { itemId: string; warehouseId: string; qtyIn: number; qtyOut: number; batchId: string | null }
  >();
  for (const d of details) {
    if (d.fromWarehouseId) {
      const k = keyOf(d.fromWarehouseId, d.itemId);
      const cur = ledAgg.get(k) ?? { itemId: d.itemId, warehouseId: d.fromWarehouseId, qtyIn: 0, qtyOut: 0, batchId: null };
      cur.qtyOut += d.qty;
      if (!cur.batchId && d.batchId) cur.batchId = d.batchId;
      ledAgg.set(k, cur);
    }
    if (d.toWarehouseId) {
      const k = keyOf(d.toWarehouseId, d.itemId);
      const cur = ledAgg.get(k) ?? { itemId: d.itemId, warehouseId: d.toWarehouseId, qtyIn: 0, qtyOut: 0, batchId: null };
      cur.qtyIn += d.qty;
      if (!cur.batchId && d.batchId) cur.batchId = d.batchId;
      ledAgg.set(k, cur);
    }
  }
  if (ledAgg.size > 0) {
    // Batch nextRowId for ledger: fetch max once, generate sequential in memory (avoid 5x LOCK)
    const yymm = yymmOf(movement.movementDate);
    const base = `sld-${yymm}-`;
    const [lastLedger] = await tx
      .select({ id: schema.stockLedger.id })
      .from(schema.stockLedger)
      .where(sql`${schema.stockLedger.id} LIKE ${base + "%"}`)
      .orderBy(desc(schema.stockLedger.id))
      .limit(1);
    let nextN = lastLedger
      ? (Number(String(lastLedger.id).slice(base.length).split("-")[0]) || 0) + 1
      : 1;
    // Acquire advisory lock once per movement for sld YYMM (instead of per row)
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${base.slice(0, -1)}::text)::bigint)`);
    const ledgerRows = [...ledAgg.values()]
      .filter(({ qtyIn, qtyOut }) => qtyIn !== 0 || qtyOut !== 0)
      .map(({ itemId, warehouseId, qtyIn, qtyOut, batchId }) => {
        // ledgerId auto
        const vRate = itemValuation.get(itemId) ?? 0;
        return {
          // id auto
          transactionId: movement.id,
          transactionType: typeCode,
          transactionDate: movement.movementDate,
          itemId,
          warehouseId,
          qtyIn: String(qtyIn),
          qtyOut: String(qtyOut),
          qtyBalance: "0",
          valuationRate: String(vRate),
          stockValue: "0",
          referenceType: movement.referenceType ?? "STOCK_MOVEMENT",
          referenceId: movement.referenceId ?? movement.id,
          batchId,
          createdBy: actorInternal,
        };
      });
    if (ledgerRows.length > 0) {
      await tx.insert(schema.stockLedger).values(ledgerRows);
    }
  }

  // --- 4. Hitung ulang saldo berjalan suffix dari postingDate sampai MAX (incremental, tidak full scan 1jt)
  const tRecompute0 = Date.now();
  await recomputeLedgerBalances(
    tx,
    [...ledAgg.values()].map(({ warehouseId, itemId }) => ({ warehouseId, itemId })),
    movement.movementDate
  );
  const totalMs = Date.now()-t0;
  const recomputeMs = Date.now()-tRecompute0;
  console.log(`[TIMING] applyMovementEffect ${movement.id} total=${totalMs}ms recompute=${recomputeMs}ms keys=${ledAgg.size}`);
}

/** Hitung ulang stock_ledger.qty_balance incremental:
 *  Hanya hitung ulang suffix dari postingDate sampai MAX, bukan full scan.
 *  prev = balance terakhir sebelum postingDate (Index Scan LIMIT 1)
 *  suffix = rows dengan transaction_date >= postingDate (max 20k, bukan 1jt)
 *  new_balance = prev + running SUM suffix.
 *  Jika postingDate >= MAX, cuma 1-5 rows baru (80ms). */
async function recomputeLedgerBalances(
  tx: Tx,
  keys: { warehouseId: string; itemId: string }[],
  postingDate?: Date | null
) {
  if (keys.length === 0) return;
  const values = sql.join(
    keys.map((k) => sql`(${k.warehouseId}, ${k.itemId})`),
    sql`, `
  );
  // Jika postingDate null, fallback ke full recompute lama (jarang)
  if (!postingDate) {
    await tx.execute(sql`
      WITH calc AS (
        SELECT l.id,
          (COALESCE(b.closing_qty, 0) - COALESCE(t.total, 0) + SUM(l.qty_in - l.qty_out) OVER (PARTITION BY l.warehouse_id, l.item_id ORDER BY l.transaction_date, l.created_at, l.id)::numeric)::numeric(15,3) AS new_balance
        FROM stock_ledger l
        JOIN (VALUES ${values}) AS k(warehouse_id, item_id) ON k.warehouse_id = l.warehouse_id AND k.item_id = l.item_id
        LEFT JOIN (SELECT warehouse_id, item_id, SUM(qty_in - qty_out)::numeric AS total FROM stock_ledger GROUP BY warehouse_id, item_id) t ON t.warehouse_id = l.warehouse_id AND t.item_id = l.item_id
        LEFT JOIN stock_balances b ON b.warehouse_id = l.warehouse_id AND b.item_id = l.item_id
      )
      UPDATE stock_ledger l SET qty_balance = c.new_balance FROM calc c WHERE l.id = c.id
    `);
    await tx.execute(sql`
      UPDATE stock_ledger l SET stock_value = (l.qty_balance * l.valuation_rate)::numeric(15,2)
      FROM (VALUES ${values}) AS k(warehouse_id, item_id)
      WHERE l.warehouse_id = k.warehouse_id AND l.item_id = k.item_id
    `);
    return;
  }
  const pd = postingDate.toISOString();
  await tx.execute(sql`
    WITH keys(warehouse_id, item_id) AS (VALUES ${values}),
    prev AS (
      SELECT k.warehouse_id, k.item_id, l.qty_balance
      FROM keys k
      LEFT JOIN LATERAL (
        SELECT qty_balance FROM stock_ledger
        WHERE warehouse_id = k.warehouse_id AND item_id = k.item_id
          AND transaction_date < ${pd}::timestamptz
        ORDER BY transaction_date DESC, created_at DESC, id DESC LIMIT 1
      ) l ON true
    ),
    suffix AS (
      SELECT l.id, l.warehouse_id, l.item_id,
        SUM(l.qty_in - l.qty_out) OVER (PARTITION BY l.warehouse_id, l.item_id ORDER BY l.transaction_date, l.created_at, l.id)::numeric AS running
      FROM stock_ledger l
      JOIN keys k ON k.warehouse_id = l.warehouse_id AND k.item_id = l.item_id
      WHERE l.transaction_date >= ${pd}::timestamptz
    ),
    calc AS (
      SELECT s.id, (COALESCE(p.qty_balance, 0) + s.running)::numeric(15,3) AS new_balance
      FROM suffix s
      LEFT JOIN prev p ON p.warehouse_id = s.warehouse_id AND p.item_id = s.item_id
    )
    UPDATE stock_ledger l SET qty_balance = c.new_balance FROM calc c WHERE l.id = c.id
  `);
  await tx.execute(sql`
    UPDATE stock_ledger l SET stock_value = (l.qty_balance * l.valuation_rate)::numeric(15,2)
    FROM (VALUES ${values}) AS k(warehouse_id, item_id)
    WHERE l.warehouse_id = k.warehouse_id AND l.item_id = k.item_id
      AND l.transaction_date >= ${pd}::timestamptz
  `);
}

export async function insertMovementWithDetails(
  tx: Tx,
  input: MovementInput,
  actorId: string
): Promise<string> {
  // resolve typeId publicId -> internal bigint if needed
  let typeIdInternal: number | null = null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input.typeId))) {
    const [r] = await tx.select({ id: schema.movementTypes.id, code: schema.movementTypes.code, kind: schema.movementTypes.kind, series: schema.movementTypes.series }).from(schema.movementTypes).where(eq(schema.movementTypes.publicId, String(input.typeId))).limit(1);
    if (r) { typeIdInternal = r.id; var type = r; } else { throw new Error("Tipe transaksi tidak ditemukan."); }
  } else if (/^\d+$/.test(String(input.typeId))) {
    typeIdInternal = Number(input.typeId);
    const [r] = await tx.select({ code: schema.movementTypes.code, kind: schema.movementTypes.kind, series: schema.movementTypes.series }).from(schema.movementTypes).where(eq(schema.movementTypes.id, typeIdInternal)).limit(1);
    if (!r) throw new Error("Tipe transaksi tidak ditemukan.");
    var type = r;
  } else {
    const [typeTmp] = await tx.select({ code: schema.movementTypes.code, kind: schema.movementTypes.kind, series: schema.movementTypes.series }).from(schema.movementTypes).where(eq(schema.movementTypes.id, input.typeId as any)).limit(1);
    if (!typeTmp) throw new Error("Tipe transaksi tidak ditemukan.");
    var type = typeTmp;
    typeIdInternal = Number(input.typeId);
  }
  // resolve detail FKs publicId -> internal
  const resolve = async (val: any, table: any): Promise<any> => {
    if (!val) return val;
    const str = String(val);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
      const colPublic = (table as any).publicId;
      const colId = (table as any).id;
      if (!colPublic || !colId) return val;
      const [row] = await tx.select({ id: colId }).from(table).where(eq(colPublic, str)).limit(1);
      return (row as any)?.id ?? val;
    }
    if (/^\d+$/.test(str)) return Number(str);
    return val;
  };
  // resolve all detail ids
  for (const d of input.details) {
    d.itemId = await resolve(d.itemId, schema.items);
    if (d.fromWarehouseId) d.fromWarehouseId = await resolve(d.fromWarehouseId, schema.warehouses) as any;
    if (d.toWarehouseId) d.toWarehouseId = await resolve(d.toWarehouseId, schema.warehouses) as any;
    if (d.uomId) d.uomId = await resolve(d.uomId, schema.uom) as any;
  }
  input.typeId = String(typeIdInternal) as any;
  // resolve actorId uuid -> internal bigint for createdBy
  let actorInternal: number | null = null;
  if (actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(actorId))) {
    const [u] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.publicId, String(actorId))).limit(1);
    actorInternal = u?.id ?? null;
  } else if (actorId && /^\d+$/.test(String(actorId))) {
    actorInternal = Number(actorId);
  } else if (typeof actorId === "number") {
    actorInternal = actorId;
  }
  // use actorInternal later for createdBy
  // original type fetch now already done above, skip duplicate
  if (!type) throw new Error("Tipe transaksi tidak ditemukan.");

  if (!type) throw new Error("Tipe transaksi tidak ditemukan.");

  validateKindDirection(type.kind, input.details);
  // Return hanya untuk finish good
  if (type.code === "RETURN_CUSTOMER") {
    if (!input.customerId) throw new StockError("Customer wajib diisi untuk return.");
    // validasi finish good per line
    for (const d of input.details) {
      const [it] = await tx.select({ isFinishGood: schema.items.isFinishGood }).from(schema.items).where(eq(schema.items.id, d.itemId)).limit(1);
      if (!it?.isFinishGood) {
        const [meta] = await tx.select({ code: schema.items.code, name: schema.items.name }).from(schema.items).where(eq(schema.items.id, d.itemId)).limit(1);
        throw new StockError(`Item ${meta?.code ?? d.itemId} - ${meta?.name ?? ""} bukan finish good, tidak bisa di-return.`);
      }
    }
    // pastikan toWarehouse adalah retur warehouse (code LIKE %RET%)
    for (const d of input.details) {
      if (d.toWarehouseId) {
        const [wh] = await tx.select({ code: schema.warehouses.code }).from(schema.warehouses).where(eq(schema.warehouses.id, d.toWarehouseId)).limit(1);
        if (wh && !wh.code.includes("RET")) {
          // auto-allow but warn; tidak blokir keras agar fleksibel
        }
      }
    }
  }

  const movementDate = input.movementDate ? new Date(input.movementDate) : new Date();
  const doc = await nextMovementNumber(tx, type.series, movementDate);
  const movementNumber = doc.documentNo;
  const movementSeriesId = doc.seriesId;
  // movementId will be generated auto, capture via returning
  const [insertedMovement] = await tx.insert(schema.stockMovements).values({
    documentNo: movementNumber,
    seriesId: movementSeriesId,
    typeId: Number(input.typeId) as any,
    movementDate,
    status: input.status,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    description: input.description,
    customerId: (input as any).customerId ? Number((input as any).customerId) as any : null,
    createdBy: actorInternal,
  }).returning();

  const effectDetails: EffectDetail[] = [];
  const batchFormatsCache = (await db
    .select()
    .from(schema.batchFormats)
    .where(eq(schema.batchFormats.isActive, true))) as unknown as BatchFormatLike[];
  const detailRows: typeof schema.stockMovementDetails.$inferInsert[] = [];
  for (const d of input.details) {
    const batchId = await resolveBatch(tx, d.itemId as any, d.batchNumber ?? null, batchFormatsCache);
    detailRows.push({
      movementId: insertedMovement.id,
      itemId: d.itemId,
      fromWarehouseId: d.fromWarehouseId,
      toWarehouseId: d.toWarehouseId,
      qty: String(d.qty),
      uomId: d.uomId,
      batchId,
      barcode: d.barcode,
      serialNumber: d.serialNumber,
      incomingRate: d.incomingRate != null ? String(d.incomingRate) : null,
    });
    effectDetails.push({
      itemId: d.itemId,
      fromWarehouseId: d.fromWarehouseId ?? null,
      toWarehouseId: d.toWarehouseId ?? null,
      qty: d.qty,
      batchId,
      incomingRate: d.incomingRate ?? null,
    });
  }
  if (detailRows.length > 0) {
    await tx.insert(schema.stockMovementDetails).values(detailRows);
  }

  if (input.status === "POSTED") {
    await applyMovementEffect(
      tx,
      { id: insertedMovement.id, typeId: input.typeId, movementDate, referenceType: input.referenceType, referenceId: String(insertedMovement.id) },
      type.code,
      effectDetails,
      actorId
    );
  }

  return insertedMovement.publicId;
}

function isSysAdminRole(role: string | undefined): boolean {
  return role === "role_sys_admin" || role === "SYS_ADMIN";
}
async function movementScope(req: Request) {
  if (!req.user) return undefined;
  if (isSysAdminRole(req.user.role)) return undefined;
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

  // Load More: limit (20|100|500|2500) + cursor, no COUNT, no full agg, sort lazy
  const rawLimit = Number(req.query.limit ?? req.query.pageSize ?? DEFAULT_PAGE_SIZE);
  const limit = Math.min(Math.max(rawLimit || DEFAULT_PAGE_SIZE, 1), 2500);
  const cursorRaw = typeof req.query.cursor === "string" ? req.query.cursor : null;
  // Backward compat: page/pageSize -> cursor-less offset
  const page = Math.max(Number(req.query.page) || 1, 1);
  const useCursor = !!cursorRaw;

  const conditions: ReturnType<typeof sql>[] = [];
  const scope = await movementScope(req);
  if (scope) conditions.push(scope);

  const q = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (q) {
    const p = `%${q}%`;
    const s = schema;
    conditions.push(sql`${s.stockMovements.id}::text ILIKE ${p}`);
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

  // Cursor: base64(JSON.stringify({createdAt, id})) untuk default sort createdAt DESC, id DESC
  if (useCursor && cursorRaw) {
    try {
      const decoded = JSON.parse(Buffer.from(cursorRaw, "base64").toString("utf8")) as { createdAt: string; id: string };
      if (decoded?.createdAt && decoded?.id) {
        // Tuple comparison: (created_at, id) < (cursor) untuk DESC
        conditions.push(sql`(${schema.stockMovements.createdAt}, ${schema.stockMovements.id}) < (${decoded.createdAt}::timestamptz, ${decoded.id}::text)`);
      }
    } catch {
      // abaikan cursor invalid
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const s = schema;

  // Sort lazy: hanya ORDER BY jika user klik header (sort param ada). Default: createdAt DESC, id DESC (index)
  const rawSort = typeof req.query.sort === "string" ? req.query.sort.trim() : "";
  const hasSort = !!rawSort;
  // Untuk LATERAL agg, tetap perlu alias kolom sort yang join, tapi default tidak join agg jika tidak sort by agg
  const needsAggForSort = rawSort === "detailCount" || rawSort === "totalQty";
  const sortDir = req.query.dir === "asc" ? asc : desc;

  // LATERAL agg per 20 row (bukan global GROUP BY)
  // Fetch 20 rows tanpa agg (no full GROUP BY) — agg diambil terpisah per 20 ids
  let qb = db
    .select({
      id: s.stockMovements.publicId,
      publicId: s.stockMovements.publicId,
      documentNo: s.stockMovements.documentNo,
      internalId: s.stockMovements.id,
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
    })
    .from(s.stockMovements)
    .leftJoin(s.movementTypes, eq(s.movementTypes.id, s.stockMovements.typeId))
    .leftJoin(s.users, eq(s.users.id, s.stockMovements.createdBy))
    .where(where)
    .$dynamic();

  if (hasSort) {
    const SORT_MAP: Record<string, unknown> = {
      id: s.stockMovements.id,
      typeCode: s.movementTypes.code,
      typeName: s.movementTypes.name,
      movementDate: s.stockMovements.movementDate,
      status: s.stockMovements.status,
      referenceId: s.stockMovements.referenceId,
      createdByName: s.users.name,
      createdAt: s.stockMovements.createdAt,
    };
    // detailCount/totalQty sort tidak didukung di mode no-agg — fallback ke createdAt
    const col = (SORT_MAP[rawSort] ?? s.stockMovements.createdAt) as never;
    qb = qb.orderBy(sortDir(col));
  } else {
    qb = qb.orderBy(desc(s.stockMovements.createdAt), desc(s.stockMovements.id));
  }

  const rawRows = await qb.limit(limit + 1).offset(useCursor ? 0 : (page - 1) * limit);

  const hasNext = rawRows.length > limit;
  const sliced = hasNext ? rawRows.slice(0, limit) : rawRows;
  // Ambil agg hanya untuk 20 ids (bukan full table)
  const ids = (sliced as any).map((r: any) => r.internalId ?? r.id);
  const aggMap = new Map<string, { cnt: number; tot: number }>();
  if (ids.length > 0) {
    const aggRows = await db
      .select({
        movementId: s.stockMovementDetails.movementId,
        cnt: sql<number>`count(*)::int`.as("cnt"),
        tot: sql<number>`COALESCE(SUM(${s.stockMovementDetails.qty}),0)::float`.as("tot"),
      })
      .from(s.stockMovementDetails)
      .where(inArray(s.stockMovementDetails.movementId, ids))
      .groupBy(s.stockMovementDetails.movementId);
    for (const a of aggRows) aggMap.set(a.movementId, { cnt: Number(a.cnt), tot: Number(a.tot) });
  }
  const rows = sliced.map((r) => ({
    ...r,
    detailCount: aggMap.get((r as any).internalId)?.cnt ?? 0,
    totalQty: aggMap.get((r as any).internalId)?.tot ?? 0,
  }));

  const nextCursor = hasNext
    ? Buffer.from(JSON.stringify({ createdAt: (sliced as any)[sliced.length - 1].createdAt, id: (sliced as any)[sliced.length - 1].internalId ?? sliced[sliced.length - 1].id })).toString("base64")
    : null;

  res.json({
    rows: rows.map((r) => ({
      ...r,
      detailCount: Number(r.detailCount ?? 0),
      totalQty: Number(r.totalQty ?? 0),
    })),
    hasNext,
    nextCursor,
    limit,
    // Backward compat untuk page mode lama
    page: useCursor ? undefined : page,
    pageSize: limit,
    total: undefined,
    totalPages: undefined,
  });
});

/* ------------------------------------------------------------------ */
/* GET  /api/transactions/scan-history                                */
/* Riwayat baris transaksi yang berasal dari scan barcode — kolom      */
/* barcode, batch, item code, serial number.                           */
/* ------------------------------------------------------------------ */
transactionsRouter.get("/scan-history", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "view"))) return;

  const page = Math.max(Number(req.query.page) || 1, 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
  const s = schema;

  const conditions: ReturnType<typeof sql>[] = [
    sql`${s.stockMovementDetails.barcode} IS NOT NULL`,
  ];
  const scope = await movementScope(req);
  if (scope) conditions.push(scope);

  const q = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (q) {
    const p = `%${q}%`;
    conditions.push(
      sql`(
        ${s.stockMovementDetails.barcode}::text ILIKE ${p}
        OR ${s.stockMovementDetails.serialNumber}::text ILIKE ${p}
        OR ${s.batches.batchNumber}::text ILIKE ${p}
        OR ${s.items.code}::text ILIKE ${p}
        OR ${s.items.name}::text ILIKE ${p}
        OR ${s.stockMovements.id}::text ILIKE ${p}
      )`
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count: total }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(s.stockMovementDetails)
    .leftJoin(s.stockMovements, eq(s.stockMovements.id, s.stockMovementDetails.movementId))
    .leftJoin(s.items, eq(s.items.id, s.stockMovementDetails.itemId))
    .leftJoin(s.batches, eq(s.batches.id, s.stockMovementDetails.batchId))
    .where(where);

  const rows = await db
    .select({
      id: s.stockMovementDetails.id,
      movementId: s.stockMovementDetails.movementId,
      movementDate: s.stockMovements.movementDate,
      movementType: s.movementTypes.name,
      movementStatus: s.stockMovements.status,
      barcode: s.stockMovementDetails.barcode,
      batchNumber: s.batches.batchNumber,
      itemCode: s.items.code,
      itemName: s.items.name,
      unit: s.uom.name,
      serialNumber: s.stockMovementDetails.serialNumber,
      qty: s.stockMovementDetails.qty,
      createdAt: s.stockMovementDetails.createdAt,
    })
    .from(s.stockMovementDetails)
    .leftJoin(s.stockMovements, eq(s.stockMovements.id, s.stockMovementDetails.movementId))
    .leftJoin(s.movementTypes, eq(s.movementTypes.id, s.stockMovements.typeId))
    .leftJoin(s.items, eq(s.items.id, s.stockMovementDetails.itemId))
    .leftJoin(s.uom, eq(s.uom.id, s.items.uomId))
    .leftJoin(s.batches, eq(s.batches.id, s.stockMovementDetails.batchId))
    .where(where)
    .orderBy(desc(s.stockMovementDetails.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  res.json({
    rows: rows.map((r) => ({
      ...r,
      qty: Number(r.qty),
      batchNumber: r.batchNumber ?? null,
      serialNumber: r.serialNumber ?? null,
    })),
    total: Number(total),
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(Number(total) / pageSize), 1),
  });
});

/* ------------------------------------------------------------------ */
/* GET  /api/transactions/barcode-check?barcode=&excludeMovementId=   */
/* Cek cepat apakah barcode sudah dipakai transaksi lain (pas scan).   */
/* Mengembalikan lokasi gudang terakhir barcode (toWarehouse dari      */
/* detail terakhir) — untuk pesan "barcode ada di gudang X".           */
/* ------------------------------------------------------------------ */
transactionsRouter.get("/barcode-check", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "view"))) return;
  try {
    const barcode =
      typeof req.query.barcode === "string" ? req.query.barcode.trim() : "";
    const excludeMovementId =
      typeof req.query.excludeMovementId === "string"
        ? req.query.excludeMovementId
        : "";
    if (!barcode) {
      res.json({ exists: false });
      return;
    }
    const conds: ReturnType<typeof sql>[] = [
      eq(schema.stockMovementDetails.barcode, barcode),
    ];
    if (excludeMovementId) {
      conds.push(sql`${schema.stockMovementDetails.movementId} != ${excludeMovementId}`);
    }
    const [row] = await db
      .select({
        movementId: schema.stockMovementDetails.movementId,
        toWarehouseId: schema.stockMovementDetails.toWarehouseId,
        warehouseCode: schema.warehouses.code,
        warehouseName: schema.warehouses.name,
      })
      .from(schema.stockMovementDetails)
      .innerJoin(
        schema.stockMovements,
        eq(schema.stockMovements.id, schema.stockMovementDetails.movementId)
      )
      .leftJoin(
        schema.warehouses,
        eq(schema.warehouses.id, schema.stockMovementDetails.toWarehouseId)
      )
      .where(and(...conds, eq(schema.stockMovements.status, "POSTED")))
      .orderBy(desc(schema.stockMovementDetails.createdAt))
      .limit(1);
    res.json({
      exists: !!row,
      movementId: row?.movementId ?? null,
      warehouseId: row?.toWarehouseId ?? null,
      warehouseCode: row?.warehouseCode ?? null,
      warehouseName: row?.warehouseName ?? null,
    });
  } catch (e) {
    console.error("GET /transactions/barcode-check", e);
    res.status(500).json({ error: "Gagal memeriksa barcode." });
  }
});

/* ------------------------------------------------------------------ */
/* GET  /api/transactions/:id                                         */
/* ------------------------------------------------------------------ */
transactionsRouter.get("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "view"))) return;

  const s = schema;
  const pid = param(req, "id");
  const whereMov = movementWhere(pid);
  const [movement] = await db
    .select({
      id: s.stockMovements.id,
      publicId: s.stockMovements.publicId,
      documentNo: s.stockMovements.documentNo,
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
    .where(whereMov)
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
      unit: s.uom.name,
      fromWarehouseId: s.stockMovementDetails.fromWarehouseId,
      fromWarehouseCode: fromWh.code,
      fromWarehouseName: fromWh.name,
      toWarehouseId: s.stockMovementDetails.toWarehouseId,
      toWarehouseCode: toWh.code,
      toWarehouseName: toWh.name,
      qty: s.stockMovementDetails.qty,
      incomingRate: s.stockMovementDetails.incomingRate,
      uomId: s.stockMovementDetails.uomId,
      uomCode: s.uom.code,
      uomName: s.uom.name,
      batchId: s.stockMovementDetails.batchId,
      batchNumber: s.batches.batchNumber,
      barcode: s.stockMovementDetails.barcode,
      serialNumber: s.stockMovementDetails.serialNumber,
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
      incomingRate: d.incomingRate != null ? Number(d.incomingRate) : null,
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
    await assertUniqueBarcodes(input.details, input.typeId);
    const id = await db.transaction((tx) => insertMovementWithDetails(tx, input, (req as any).user?.internalId ?? req.user!.id));
    const [row] = await db.select({ id: schema.stockMovements.id, documentNo: schema.stockMovements.documentNo, status: schema.stockMovements.status }).from(schema.stockMovements).where(eq(schema.stockMovements.publicId, id)).limit(1);
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "SMV", documentId: row?.id ?? 0, action: "create", fromStatus: null, toStatus: row?.status ?? input.status ?? "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo: row?.documentNo ?? null, publicId: id } });
    } catch {}
    res.status(201).json({ id, documentNo: row?.documentNo ?? null });
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

  const pidPatch = param(req, "id");
  const wherePatch = movementWhere(pidPatch);
  const [existing] = await db
    .select({ id: schema.stockMovements.id, status: schema.stockMovements.status })
    .from(schema.stockMovements)
    .where(wherePatch)
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }
  if (existing.status !== "DRAFT") {
    res.status(400).json({ error: "Hanya transaksi berstatus DRAFT yang bisa diubah." });
    return;
  }
  // fetch old row + old details for diff
  const [oldRowFull] = await db.select().from(schema.stockMovements).where(wherePatch).limit(1);
  let oldDetails: any[] = [];
  try { oldDetails = await db.select().from(schema.stockMovementDetails).where(eq(schema.stockMovementDetails.movementId, existing.id)); } catch {}

  const parsed = parseBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const input = parsed.value;
  if (!(await validateWarehouseAccess(req, res, input.details))) return;

  try {
    await assertUniqueBarcodes(input.details, input.typeId, param(req, "id"));
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
      await tx.delete(schema.stockMovementDetails).where(eq(schema.stockMovementDetails.movementId, existing.id));
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
        .where(eq(schema.stockMovements.id, existing.id));
      const effectDetails: EffectDetail[] = [];
      const batchFormatsCache = (await db
        .select()
        .from(schema.batchFormats)
        .where(eq(schema.batchFormats.isActive, true))) as unknown as BatchFormatLike[];
      // Batch smd ids
      const yymmSmdPatch = yymmOf(input.movementDate ? new Date(input.movementDate) : new Date());
      const baseSmdPatch = `smd-${yymmSmdPatch}-`;
      const [lastSmdPatch] = await tx
        .select({ id: schema.stockMovementDetails.id })
        .from(schema.stockMovementDetails)
        .where(sql`${schema.stockMovementDetails.id} LIKE ${baseSmdPatch + "%"}`)
        .orderBy(desc(schema.stockMovementDetails.id))
        .limit(1);
      let nextSmdPatchN = lastSmdPatch
        ? (Number(String(lastSmdPatch.id).slice(baseSmdPatch.length).split("-")[0]) || 0) + 1
        : 1;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${baseSmdPatch.slice(0, -1)}::text)::bigint)`);
      const detailRowsPatch: typeof schema.stockMovementDetails.$inferInsert[] = [];
      for (const d of input.details) {
        const batchId = await resolveBatch(tx, d.itemId, d.batchNumber ?? null, batchFormatsCache);
        const detailId = `${baseSmdPatch}${String(nextSmdPatchN++).padStart(4, "0")}`;
        detailRowsPatch.push({
          id: detailId,
          movementId: existing.id,
          itemId: d.itemId,
          fromWarehouseId: d.fromWarehouseId,
          toWarehouseId: d.toWarehouseId,
          qty: String(d.qty),
          uomId: d.uomId,
          batchId,
          barcode: d.barcode,
          serialNumber: d.serialNumber,
          incomingRate: d.incomingRate != null ? String(d.incomingRate) : null,
        });
        effectDetails.push({
          itemId: d.itemId,
          fromWarehouseId: d.fromWarehouseId ?? null,
          toWarehouseId: d.toWarehouseId ?? null,
          qty: d.qty,
          batchId,
          incomingRate: d.incomingRate ?? null,
        });
      }
      if (detailRowsPatch.length > 0) {
        await tx.insert(schema.stockMovementDetails).values(detailRowsPatch);
      }
      if (input.status === "POSTED") {
        await applyMovementEffect(
          tx,
          {
            id: existing.id,
            typeId: input.typeId,
            movementDate: input.movementDate ? new Date(input.movementDate) : new Date(),
            referenceType: input.referenceType,
            referenceId: input.referenceId,
          },
          type.code,
          effectDetails,
          (req as any).user?.internalId ?? req.user!.id
        );
      }
    });
    try {
      const { internalId, role } = await getActorInfo(req);
      const changes = computeDiff(oldRowFull as any, { typeId: input.typeId, status: input.status, referenceType: input.referenceType, referenceId: input.referenceId, description: input.description } as any, { denylist: DIFF_DENYLIST });
      let linesDiff: any = null;
      try { linesDiff = diffLines(oldDetails as any, input.details as any); } catch {}
      const meta: Record<string, unknown> = {};
      if (Object.keys(changes).length) meta.changes = changes;
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
      await logActivity({ documentType: "SMV", documentId: existing.id, action: "update", fromStatus: existing.status, toStatus: input.status ?? existing.status, actorUserId: internalId, actorRole: role, metadata: meta });
    } catch {}
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

  const pidPost = param(req, "id");
  const wherePost = movementWhere(pidPost);
  const [movement] = await db
    .select({
      id: schema.stockMovements.id,
      typeId: schema.stockMovements.typeId,
      movementDate: schema.stockMovements.movementDate,
      status: schema.stockMovements.status,
      referenceType: schema.stockMovements.referenceType,
      referenceId: schema.stockMovements.referenceId,
    })
    .from(schema.stockMovements)
    .where(wherePost)
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
        (req as any).user?.internalId ?? req.user!.id
      );
      await tx
        .update(schema.stockMovements)
        .set({ status: "POSTED", updatedAt: new Date() })
        .where(eq(schema.stockMovements.id, movement.id));
    });
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "SMV", documentId: movement.id, action: "post", fromStatus: "DRAFT", toStatus: "POSTED", actorUserId: internalId, actorRole: role });
    } catch {}
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
/* POST /api/transactions/:id/unpost — batalkan posting, kembalikan ke DRAFT */
/* ------------------------------------------------------------------ */
transactionsRouter.post("/:id/unpost", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "update"))) return;

  const pidUnpost = param(req, "id");
  const whereUnpost = movementWhere(pidUnpost);
  const [movement] = await db
    .select({ id: schema.stockMovements.id, status: schema.stockMovements.status, movementDate: schema.stockMovements.movementDate })
    .from(schema.stockMovements)
    .where(whereUnpost)
    .limit(1);
  if (!movement) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }
  if (movement.status !== "POSTED") {
    res.status(400).json({ error: "Hanya transaksi berstatus POSTED yang bisa dibatalkan." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      // --- 1. Balik stock_balances agregat berdasarkan ledger efek ---
      const ledgerRows = await tx
        .select({
          itemId: schema.stockLedger.itemId,
          warehouseId: schema.stockLedger.warehouseId,
          qtyIn: schema.stockLedger.qtyIn,
          qtyOut: schema.stockLedger.qtyOut,
          batchId: schema.stockLedger.batchId,
        })
        .from(schema.stockLedger)
        .where(eq(schema.stockLedger.transactionId, movement.id));

      const aggSeen = new Map<string, { itemId: string; warehouseId: string; in: number; out: number }>();
      const keyOf = (wh: string, it: string) => `${wh}|${it}`;
      for (const l of ledgerRows) {
        const k = keyOf(l.warehouseId, l.itemId);
        const cur = aggSeen.get(k);
        const qIn = Number(l.qtyIn);
        const qOut = Number(l.qtyOut);
        if (cur) {
          cur.in += qIn;
          cur.out += qOut;
        } else {
          aggSeen.set(k, { itemId: l.itemId, warehouseId: l.warehouseId, in: qIn, out: qOut });
        }
      }
      for (const { itemId, warehouseId, in: qIn, out: qOut } of aggSeen.values()) {
        const [balance] = await tx
          .select()
          .from(schema.stockBalances)
          .where(
            and(
              eq(schema.stockBalances.warehouseId, warehouseId),
              eq(schema.stockBalances.itemId, itemId)
            )
          )
          .for("update")
          .limit(1);
        if (!balance) continue;
        await tx
          .update(schema.stockBalances)
          .set({
            inQty: Number(balance.inQty) - qIn,
            outQty: Number(balance.outQty) - qOut,
            closingQty: Number(balance.closingQty) - qIn + qOut,
            updatedAt: new Date(),
          })
          .where(eq(schema.stockBalances.id, balance.id));
      }

      // --- 2. Balik stock_batches per (batch, warehouse) ---
      const batchSeen = new Map<string, { batchId: string; warehouseId: string; in: number; out: number }>();
      for (const l of ledgerRows) {
        if (!l.batchId) continue;
        const bk = `${l.batchId}|${l.warehouseId}`;
        const cur = batchSeen.get(bk);
        const qIn = Number(l.qtyIn);
        const qOut = Number(l.qtyOut);
        if (cur) {
          cur.in += qIn;
          cur.out += qOut;
        } else {
          batchSeen.set(bk, { batchId: l.batchId, warehouseId: l.warehouseId, in: qIn, out: qOut });
        }
      }
      for (const { batchId, warehouseId, in: qIn, out: qOut } of batchSeen.values()) {
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
        if (!row) continue;
        const next = Number(row.qty) - qIn + qOut;
        await tx
          .update(schema.stockBatches)
          .set({ qty: String(next), updatedAt: new Date() })
          .where(eq(schema.stockBatches.id, row.id));
        await tx
          .update(schema.batches)
          .set({ status: next === 0 ? "EMPTY" : "ACTIVE", updatedAt: new Date() })
          .where(eq(schema.batches.id, batchId));
      }

      // --- 3. Hapus ledger transaksi ini ---
      await tx
        .delete(schema.stockLedger)
        .where(eq(schema.stockLedger.transactionId, movement.id));

      // --- 3b. Hitung ulang suffix dari postingDate sampai MAX (incremental, tidak full 1jt) ---
      await recomputeLedgerBalances(
        tx,
        [...aggSeen.keys()].map((k) => {
          const [warehouseId, itemId] = k.split("|");
          return { warehouseId, itemId };
        }),
        movement.movementDate
      );

      // --- 4. Ubah status menjadi CANCELED ---
      await tx
        .update(schema.stockMovements)
        .set({ status: "CANCELED", updatedAt: new Date() })
        .where(eq(schema.stockMovements.id, movement.id));
    });
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "SMV", documentId: movement.id, action: "cancel", fromStatus: "POSTED", toStatus: "CANCELED", actorUserId: internalId, actorRole: role });
    } catch {}
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /transactions/:id/unpost", e);
    res.status(500).json({ error: "Gagal membatalkan transaksi." });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/transactions/:id/amend — buka kembali CANCELED → DRAFT    */
/* ------------------------------------------------------------------ */
transactionsRouter.post("/:id/amend", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "update"))) return;

  const pidAmend = param(req, "id");
  const whereAmend = movementWhere(pidAmend);
  const [movement] = await db
    .select({ id: schema.stockMovements.id, status: schema.stockMovements.status })
    .from(schema.stockMovements)
    .where(whereAmend)
    .limit(1);
  if (!movement) {
    res.status(404).json({ error: "Transaksi tidak ditemukan." });
    return;
  }
  if (movement.status !== "CANCELED") {
    res.status(400).json({ error: "Hanya transaksi berstatus CANCELED yang bisa dibuka kembali." });
    return;
  }
  try {
    await db
      .update(schema.stockMovements)
      .set({ status: "DRAFT", updatedAt: new Date() })
      .where(eq(schema.stockMovements.id, movement.id));
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "SMV", documentId: movement.id, action: "amend", fromStatus: "CANCELED", toStatus: "DRAFT", actorUserId: internalId, actorRole: role });
    } catch {}
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /transactions/:id/amend", e);
    res.status(500).json({ error: "Gagal membuka kembali transaksi." });
  }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/transactions/:id — hanya DRAFT                          */
/* ------------------------------------------------------------------ */
transactionsRouter.delete("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "inventory.transactions", "delete"))) return;

  const pidDel = param(req, "id");
  const whereDel = movementWhere(pidDel);
  const [movement] = await db
    .select({ id: schema.stockMovements.id, status: schema.stockMovements.status })
    .from(schema.stockMovements)
    .where(whereDel)
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
    try {
      const { internalId, role } = await getActorInfo(req);
      await logActivity({ documentType: "SMV", documentId: movement.id, action: "cancel", fromStatus: movement.status, toStatus: "CANCELED", actorUserId: internalId, actorRole: role });
    } catch {}
    await db.delete(schema.stockMovements).where(eq(schema.stockMovements.id, movement.id));
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
  if (req.user && !isSysAdminRole(req.user.role)) {
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
    conditions.push(sql`EXISTS (
      SELECT 1 FROM ${s.items} WHERE ${s.items.id} = ${s.stockLedger.itemId}
        AND (${s.items.code}::text ILIKE ${p} OR ${s.items.name}::text ILIKE ${p})
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
      unit: s.uom.name,
      warehouseId: s.stockLedger.warehouseId,
      warehouseCode: s.warehouses.code,
      warehouseName: s.warehouses.name,
      locationId: s.stockLedger.locationId,
      locationName: s.locations.name,
      qtyIn: s.stockLedger.qtyIn,
      qtyOut: s.stockLedger.qtyOut,
      qtyBalance: s.stockLedger.qtyBalance,
      valuationRate: s.stockLedger.valuationRate,
      stockValue: s.stockLedger.stockValue,
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
    .leftJoin(s.uom, eq(s.uom.id, s.items.uomId))
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
      valuationRate: Number(r.valuationRate ?? 0),
      stockValue: Number(r.stockValue ?? 0),
    })),
    total: Number(total),
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(Number(total) / pageSize), 1),
  });
});
