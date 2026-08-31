// Seed massal: 1.000.000 transaksi transfer antargudang (INTER-WAREHOUSE)
// beserta barcode yang benar-benar berpindah gudang.
//
// Model:
//   - Pool barcode unik (NUM_BARCODES) yang masing-masing punya gudang terkini.
//   - Setiap transaksi memilih satu barcode, memindahkannya dari gudang terkini
//     ke gudang lain (berbeda), lalu memperbarui gudang terkini barcode tsb.
//   - Tiap transaksi = 1 header stock_movements + 1 baris stock_movement_details.
//   - stock_barcodes disinkron via backfill sekali jalan (sama seperti migration
//     0025) agar cepat untuk 1 juta baris; trigger dimatikan selama bulk insert.
//
// Konfigurasi via env (dengan default):
//   COUNT=1000000            jumlah transaksi transfer
//   NUM_BARCODES=250000      jumlah barcode unik yang berpindah-pindah
//   BATCHES_PER_ITEM=8       batch per item (untuk realistic batch_id)
//   CHUNK=10000              ukuran insert per batch
//   RESET=0                  bila 1, truncate dulu (bersihkan data lama)
//
// Jalankan: npm run db:seed-transfer  (atau COUNT=... npm run db:seed-transfer)
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  batches,
  items,
  movementTypes,
  stockMovements,
  stockMovementDetails,
  warehouses,
} from "./schema";
import { applyTransferEffects } from "./apply-transfer-effects";

const COUNT = Number(process.env.COUNT ?? 1_000_000);
const NUM_BARCODES = Number(process.env.NUM_BARCODES ?? 250_000);
const BATCHES_PER_ITEM = Number(process.env.BATCHES_PER_ITEM ?? 8);
const CHUNK = Number(process.env.CHUNK ?? 5_000);
const RESET = process.env.RESET === "1" || process.env.RESET === "true";
// Base date untuk dummy: default 60 hari lalu agar posting now() selalu di tail (> MAX).
// Bisa di-override via env SEED_BASE_DATE (ISO string, mis. 2024-01-01T00:00:00Z).
// Jika SEED_BASE_DATE tidak di-set, dummy berakhir 1 hari sebelum now -> suffix posting now() = 1-5 rows (80ms).
const SEED_BASE_DATE_RAW = process.env.SEED_BASE_DATE;
const SEED_BASE_DATE = SEED_BASE_DATE_RAW ? new Date(SEED_BASE_DATE_RAW) : null;
if (SEED_BASE_DATE_RAW && Number.isNaN(SEED_BASE_DATE!.getTime())) {
  throw new Error(`SEED_BASE_DATE tidak valid: ${SEED_BASE_DATE_RAW}`);
}
const FIXED_BASE_TIME = SEED_BASE_DATE
  ? SEED_BASE_DATE.getTime()
  : Date.now() - 60 * 86_400_000 - COUNT * 1_000; // berakhir kemarin
const FIXED_BASE_DATE = new Date(FIXED_BASE_TIME);

const yymm = (() => {
  const d = FIXED_BASE_DATE;
  return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, "0")}`;
})();

// Id deterministik, unik. Format: {PREFIX}-{YYMM}-{serial padded}.
function movementId(n: number) {
  return `TRF-${yymm}-${String(n).padStart(7, "0")}`;
}
function detailId(n: number) {
  return `TRFD-${yymm}-${String(n).padStart(7, "0")}`;
}
function batchId(itemSerial: number, k: number) {
  return `TRFB-${yymm}-${String(itemSerial).padStart(4, "0")}${String(k).padStart(2, "0")}`;
}
function barcodeStr(itemCode: string, seq: number) {
  return `TB${String(itemCode).padStart(5, "0")}${String(seq).padStart(7, "0")}`;
}

// PRNG deterministik sederhana (LCG) — tidak butuh crypto, cukup untuk dummy.
let rngState = 0x9e3779b9 >>> 0;
function rnd() {
  rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0;
  return rngState / 0xffffffff;
}
function rndInt(maxExclusive: number) {
  return Math.floor(rnd() * maxExclusive);
}

async function main() {
  console.log(
    `Konfigurasi: COUNT=${COUNT.toLocaleString("id-ID")}, NUM_BARCODES=${NUM_BARCODES.toLocaleString("id-ID")}, BATCHES_PER_ITEM=${BATCHES_PER_ITEM}, CHUNK=${CHUNK}`
  );

  // ---- Master data ----
  const whs = (await db.select({ id: warehouses.id, code: warehouses.code }).from(warehouses)).filter(
    (w) => w.id
  );
  if (whs.length < 2) {
    throw new Error("Perlu minimal 2 gudang untuk transfer antargudang.");
  }
  const itemsAll = await db
    .select({ id: items.id, code: items.code, uomId: items.uomId })
    .from(items);
  if (!itemsAll.length) throw new Error("Tidak ada item di database.");

  const [transferType] = await db
    .select({ id: movementTypes.id })
    .from(movementTypes)
    .where(sql`${movementTypes.code} = 'TRANSFER'`)
    .limit(1);
  if (!transferType) throw new Error("Movement type TRANSFER tidak ditemukan.");
  const transferTypeId = transferType.id;

  // ---- Pastikan batch ada per item (realistic batch_id di detail) ----
  const itemBatchMap = new Map<string, string[]>();
  for (let i = 0; i < itemsAll.length; i++) {
    const it = itemsAll[i];
    const list: string[] = [];
    for (let k = 0; k < BATCHES_PER_ITEM; k++) {
      const id = batchId(i + 1, k);
      list.push(id);
    }
    itemBatchMap.set(it.id, list);
  }
  // Insert batch yang belum ada (onConflictDoNothing aman bila sudah ada).
  const batchRows = itemsAll.flatMap((it, i) =>
    itemBatchMap.get(it.id)!.map((id, k) => ({
      id,
      itemId: it.id,
      batchNumber: `LOT${String(k + 1).padStart(2, "0")}`,
      status: "ACTIVE" as const,
    }))
  );
  await db.insert(batches).values(batchRows).onConflictDoNothing();
  console.log(`Batch tersedia: ${batchRows.length.toLocaleString("id-ID")} (${itemsAll.length} item × ${BATCHES_PER_ITEM}).`);

  // ---- Reset bila diminta ----
  if (RESET) {
    console.log("RESET=1 → truncate stock_movement_details, stock_movements, stock_barcodes...");
    await db.execute(sql`TRUNCATE TABLE stock_movement_details, stock_movements, stock_barcodes CASCADE`);
  }

  // ---- Bangun pool barcode ----
  // Array paralel demi kecepatan & memori rendah.
  const bcCode = new Array<string>(NUM_BARCODES);
  const bcItem = new Array<string>(NUM_BARCODES);
  const bcBatch = new Array<string>(NUM_BARCODES);
  const bcWh = new Array<string>(NUM_BARCODES);
  for (let i = 0; i < NUM_BARCODES; i++) {
    const it = itemsAll[i % itemsAll.length];
    const bList = itemBatchMap.get(it.id)!;
    bcCode[i] = barcodeStr(it.code, i + 1);
    bcItem[i] = it.id;
    bcBatch[i] = bList[rndInt(bList.length)];
    bcWh[i] = whs[rndInt(whs.length)].id;
  }
  console.log(`Pool barcode: ${NUM_BARCODES.toLocaleString("id-ID")} barcode unik (akan berpindah gudang rata-rata ${(COUNT / NUM_BARCODES).toFixed(1)}x).`);

  // ---- Matikan trigger sinkron agar bulk insert cepat ----
  let triggerDisabled = false;
  try {
    await db.execute(sql`ALTER TABLE stock_movement_details DISABLE TRIGGER trg_stock_barcodes`);
    triggerDisabled = true;
    console.log("Trigger trg_stock_barcodes dinonaktifkan selama bulk insert.");
  } catch (e) {
    console.warn(
      "Gagal menonaktifkan trigger (lanjut dengan trigger aktif — lebih lambat):",
      e instanceof Error ? e.message : e
    );
  }

  // ---- Loop transaksi ----
  const start = Date.now();
  let headerBuf: (typeof stockMovements.$inferInsert)[] = [];
  let detailBuf: (typeof stockMovementDetails.$inferInsert)[] = [];
  let added = 0;

  const baseTime = FIXED_BASE_TIME;
  console.log(
    `Base dummy date: ${FIXED_BASE_DATE.toISOString()} → ${new Date(FIXED_BASE_TIME + (COUNT - 1) * 1000).toISOString()} (MAX < now, posting now() = tail)`
  );
  const flush = async () => {
    if (headerBuf.length) {
      await db.insert(stockMovements).values(headerBuf);
      headerBuf = [];
    }
    if (detailBuf.length) {
      await db.insert(stockMovementDetails).values(detailBuf);
      detailBuf = [];
    }
  };

  for (let i = 0; i < COUNT; i++) {
    const idx = i % NUM_BARCODES;
    const fromWh = bcWh[idx];
    // Pilih gudang tujuan yang berbeda dari asal.
    let toWh = whs[rndInt(whs.length)].id;
    if (toWh === fromWh) toWh = whs[(whs.findIndex((w) => w.id === fromWh) + 1) % whs.length].id;
    bcWh[idx] = toWh;

    const itemId = bcItem[idx];
    const it = itemsAll.find((x) => x.id === itemId)!;
    const ts = new Date(baseTime + i * 1000); // monoton naik → backfill ambil posisi terakhir
    const n = i + 1;

    headerBuf.push({
      id: movementId(n),
      typeId: transferTypeId,
      movementDate: ts,
      status: "POSTED",
      referenceType: "TRANSFER",
      description: `Transfer antargudang ${whs.find((w) => w.id === fromWh)!.code} → ${whs.find((w) => w.id === toWh)!.code}`,
      createdAt: ts,
      updatedAt: ts,
    });
    detailBuf.push({
      id: detailId(n),
      movementId: movementId(n),
      itemId,
      fromWarehouseId: fromWh,
      toWarehouseId: toWh,
      qty: "1",
      uomId: it.uomId,
      batchId: bcBatch[idx],
      barcode: bcCode[idx],
      createdAt: ts,
    });

    if (headerBuf.length >= CHUNK) {
      await flush();
      added += CHUNK;
      const pct = Math.round((added / COUNT) * 100);
      const rate = Math.round(added / ((Date.now() - start) / 1000));
      console.log(
        `  ${added.toLocaleString("id-ID")}/${COUNT.toLocaleString("id-ID")} (${pct}%) · ${rate.toLocaleString("id-ID")} trx/detik`
      );
    }
  }
  await flush();
  added = COUNT;

  // ---- Backfill stock_barcodes (posisi terakhir tiap barcode) ----
  if (triggerDisabled) {
    await db.execute(sql`ALTER TABLE stock_movement_details ENABLE TRIGGER trg_stock_barcodes`);
  }
  console.log("Backfill stock_barcodes dari stock_movement_details...");
  await db.execute(sql`
    INSERT INTO stock_barcodes (barcode, batch_id, item_id, warehouse_id, updated_at)
    SELECT DISTINCT ON (md.barcode) md.barcode, md.batch_id, md.item_id, md.to_warehouse_id, now()
    FROM stock_movement_details md
    WHERE md.barcode IS NOT NULL AND md.to_warehouse_id IS NOT NULL
    ORDER BY md.barcode, md.created_at DESC
    ON CONFLICT (barcode) DO UPDATE SET
      batch_id = EXCLUDED.batch_id,
      item_id = EXCLUDED.item_id,
      warehouse_id = EXCLUDED.warehouse_id,
      updated_at = now();
  `);

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  const bc = Number(((await db.execute(sql`SELECT count(*)::int n FROM stock_barcodes`)) as any).rows[0].n);
  const det = Number(((await db.execute(sql`SELECT count(*)::int n FROM stock_movement_details`)) as any).rows[0].n);
  const mv = Number(((await db.execute(sql`SELECT count(*)::int n FROM stock_movements`)) as any).rows[0].n);
  console.log(
    `Selesai insert dalam ${seconds}s → stock_movements=${mv.toLocaleString("id-ID")}, stock_movement_details=${det.toLocaleString("id-ID")}, stock_barcodes=${bc.toLocaleString("id-ID")}.`
  );

  // ---- Sinkron stock_balances, stock_batches, stock_ledger dari detail ----
  console.log("Membangun stock_balances / stock_batches / stock_ledger...");
  const t0 = Date.now();
  await applyTransferEffects();
  const sb = Number(((await db.execute(sql`SELECT count(*)::int n FROM stock_balances`)) as any).rows[0].n);
  const stb = Number(((await db.execute(sql`SELECT count(*)::int n FROM stock_batches`)) as any).rows[0].n);
  const sld = Number(((await db.execute(sql`SELECT count(*)::int n FROM stock_ledger`)) as any).rows[0].n);
  console.log(
    `Selesai → stock_balances=${sb.toLocaleString("id-ID")}, stock_batches=${stb.toLocaleString("id-ID")}, stock_ledger=${sld.toLocaleString("id-ID")} (dalam ${((Date.now() - t0) / 1000).toFixed(1)}s).`
  );
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
