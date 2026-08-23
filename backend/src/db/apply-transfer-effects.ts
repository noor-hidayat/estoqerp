// Backfill stock_balances, stock_batches, dan stock_ledger dari
// stock_movement_details — mereplikasi efek applyMovementEffect()
// (routes/transactions.ts) secara agregat lewat SQL agar cepat untuk jutaan baris.
//
// Penting: gerakan yang dibuat seed-transfer adalah TRANSFER murni (tidak ada
// penerimaan awal), sehingga bila dijumlahkan (in - out) saldo akan mendekati 0
// dan bisa negatif. Agar stok tercatat sebagai "stok fisik saat ini" yang positif
// dan konsisten dengan stock_barcodes, kita tetapkan:
//   - closing_qty (stock_balances) / qty (stock_batches) = jumlah barcode per
//     (item/ batch, gudang) yang SEDANG berada di sana (dari stock_barcodes).
//   - opening_qty = closing - in + out  (saldo awal implisit agar buku seimbang).
//   - ledger berisi arus per transaksi; qty_balance dihitung ulang berakhir di
//     closing (stok fisik).
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

export async function applyTransferEffects() {
  await db.execute(sql`TRUNCATE TABLE stock_ledger, stock_batches, stock_balances RESTART IDENTITY;`);

  // 1) stock_balances — arus (in/out) dari detail, closing = stok fisik saat ini
  console.log("Membangun stock_balances (closing = stok fisik dari stock_barcodes)...");
  await db.execute(sql`
    WITH flow AS (
      SELECT warehouse_id, item_id, SUM(qin) AS in_qty, SUM(qout) AS out_qty
      FROM (
        SELECT to_warehouse_id AS warehouse_id, item_id, qty::numeric AS qin, 0::numeric AS qout
        FROM stock_movement_details WHERE to_warehouse_id IS NOT NULL
        UNION ALL
        SELECT from_warehouse_id AS warehouse_id, item_id, 0::numeric, qty::numeric
        FROM stock_movement_details WHERE from_warehouse_id IS NOT NULL
      ) e GROUP BY warehouse_id, item_id
    ),
    cur AS (
      SELECT warehouse_id, item_id, COUNT(*) AS closing
      FROM stock_barcodes GROUP BY warehouse_id, item_id
    )
    INSERT INTO stock_balances
      (id, warehouse_id, item_id, opening_qty, in_qty, out_qty, closing_qty, created_at, updated_at)
    SELECT
      'sb_bulk_' || (row_number() OVER ())::text,
      COALESCE(c.warehouse_id, f.warehouse_id),
      COALESCE(c.item_id, f.item_id),
      (COALESCE(c.closing,0) - COALESCE(f.in_qty,0) + COALESCE(f.out_qty,0))::int AS opening_qty,
      COALESCE(f.in_qty,0)::int,
      COALESCE(f.out_qty,0)::int,
      COALESCE(c.closing,0)::int AS closing_qty,
      now(), now()
    FROM cur c
    FULL OUTER JOIN flow f ON f.warehouse_id = c.warehouse_id AND f.item_id = c.item_id;
  `);

  // 2) stock_batches — qty = jumlah barcode per (batch, gudang) saat ini
  console.log("Membangun stock_batches (qty = stok fisik per batch)...");
  await db.execute(sql`
    INSERT INTO stock_batches (id, batch_id, warehouse_id, qty, updated_at)
    SELECT 'stb_bulk_' || (row_number() OVER ())::text, batch_id, warehouse_id, closing::int, now()
    FROM (
      SELECT warehouse_id, batch_id, COUNT(*) AS closing
      FROM stock_barcodes WHERE batch_id IS NOT NULL GROUP BY warehouse_id, batch_id
    ) g;
  `);

  // 3) stock_ledger — 1 baris per (transaksi, item, gudang): IN di tujuan, OUT di asal
  console.log("Membangun stock_ledger (2 baris per transaksi)...");
  await db.execute(sql`
    INSERT INTO stock_ledger
      (id, transaction_id, transaction_type, transaction_date, item_id, warehouse_id,
       qty_in, qty_out, qty_balance, reference_type, reference_id, batch_id, created_by, created_at)
    SELECT
      'sld_bulk_' || (row_number() OVER ())::text,
      movement_id, 'TRANSFER', movement_date, item_id, warehouse_id,
      qty_in, qty_out, '0', 'TRANSFER', movement_id, batch_id, NULL, created_at
    FROM (
      SELECT md.movement_id, m.movement_date, md.item_id, md.batch_id, md.created_at,
             md.to_warehouse_id AS warehouse_id, md.qty::numeric AS qty_in, 0::numeric AS qty_out
      FROM stock_movement_details md JOIN stock_movements m ON m.id = md.movement_id
      WHERE md.to_warehouse_id IS NOT NULL
      UNION ALL
      SELECT md.movement_id, m.movement_date, md.item_id, md.batch_id, md.created_at,
             md.from_warehouse_id AS warehouse_id, 0::numeric, md.qty::numeric
      FROM stock_movement_details md JOIN stock_movements m ON m.id = md.movement_id
      WHERE md.from_warehouse_id IS NOT NULL
    ) x;
  `);

  // 4) Hitung ulang qty_balance ledger (sama seperti backfill-ledger-balances.ts)
  console.log("Menghitung ulang saldo berjalan stock_ledger...");
  await db.execute(sql`
    WITH calc AS (
      SELECT
        l.id,
        (
          COALESCE(b.closing_qty, 0)
          - COALESCE(t.total, 0)
          + SUM(l.qty_in - l.qty_out) OVER (
              PARTITION BY l.warehouse_id, l.item_id
              ORDER BY l.transaction_date, l.created_at, l.id
            )::numeric
        )::numeric(15,3) AS new_balance
      FROM stock_ledger l
      LEFT JOIN (
        SELECT warehouse_id, item_id, SUM(qty_in - qty_out)::numeric AS total
        FROM stock_ledger
        GROUP BY warehouse_id, item_id
      ) t ON t.warehouse_id = l.warehouse_id AND t.item_id = l.item_id
      LEFT JOIN stock_balances b
        ON b.warehouse_id = l.warehouse_id AND b.item_id = l.item_id
    )
    UPDATE stock_ledger l
    SET qty_balance = c.new_balance
    FROM calc c
    WHERE l.id = c.id
  `);
}

async function main() {
  await applyTransferEffects();
  const [{ n: sb }] = (await db.execute(sql`SELECT count(*)::int n FROM stock_balances`)) as any;
  const [{ n: stb }] = (await db.execute(sql`SELECT count(*)::int n FROM stock_batches`)) as any;
  const [{ n: sld }] = (await db.execute(sql`SELECT count(*)::int n FROM stock_ledger`)) as any;
  const [{ n: openNeg }] = (await db.execute(sql`SELECT count(*)::int n FROM stock_balances WHERE opening_qty < 0`)) as any;
  console.log(
    `Selesai → stock_balances=${sb.toLocaleString("id-ID")} (opening negatif: ${openNeg}), ` +
      `stock_batches=${stb.toLocaleString("id-ID")}, stock_ledger=${sld.toLocaleString("id-ID")}.`
  );
  await pool.end();
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("Backfill gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}
