// Backfill stock_barcodes dari riwayat scan transaksi (stock_movement_details)
// menggunakan FULL barcode (barcode mentah hasil scan, tanpa diparsing/terpotong).
//
// Logika mengikuti trigger trg_stock_barcodes (migration 0025) namun dijalankan
// sekaligus lewat SQL agar memperbaiki data lama yang pernah divergensi:
//   - untuk tiap barcode unik, ambil baris terakhir (created_at DESC);
//   - bila baris terakhir punya to_warehouse_id  -> barcode masih IN (simpan);
//   - bila hanya from_warehouse_id (issue/out)    -> barcode sudah keluar (buang).
//
// Flag opsional:
//   --with-balances  rebuild juga stock_balances, stock_batches, stock_ledger
//                   (logika apply-transfer-effects) agar saldo ikut konsisten.
//
// Script idempoten: boleh dijalankan berulang.
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import { applyTransferEffects } from "./apply-transfer-effects";

async function main() {
  const withBalances = process.argv.includes("--with-balances");

  // 1) Rebuild stock_barcodes dari scan history transaksi (full barcode).
  console.log("Menonaktifkan trigger trg_stock_barcodes sementara...");
  await db.execute(sql`ALTER TABLE stock_movement_details DISABLE TRIGGER trg_stock_barcodes`);

  console.log("Reset stock_barcodes...");
  await db.execute(sql`TRUNCATE TABLE stock_barcodes`);

  console.log("Backfill stock_barcodes dari stock_movement_details (full barcode)...");
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

  const [{ n: bc }] = ((await db.execute(
    sql`SELECT count(*)::int n FROM stock_barcodes`
  )) as any).rows;
  const [{ n: distinctSm }] = ((await db.execute(
    sql`SELECT count(distinct barcode)::int n FROM stock_movement_details WHERE barcode IS NOT NULL AND to_warehouse_id IS NOT NULL`
  )) as any).rows;
  console.log(
    `stock_barcodes = ${bc.toLocaleString("id-ID")} (dari ${distinctSm.toLocaleString("id-ID")} barcode unik IN di riwayat scan).`
  );

  console.log("Mengaktifkan kembali trigger trg_stock_barcodes...");
  await db.execute(sql`ALTER TABLE stock_movement_details ENABLE TRIGGER trg_stock_barcodes`);

  // 2) Opsional: rebuild saldo agar konsisten dengan posisi barcode terbaru.
  if (withBalances) {
    console.log("Rebuild stock_balances / stock_batches / stock_ledger...");
    await applyTransferEffects();
  }

  await pool.end();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Backfill gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
