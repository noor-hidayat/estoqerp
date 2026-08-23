// Gabung baris stock_ledger duplikat (transaksi, item, gudang sama) menjadi
// satu baris (qty dijumlahkan), lalu hitung ulang semua qty_balance agar
// konsisten dengan stock_balances. Sekali jalan.
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

async function main() {
  await db.transaction(async (tx) => {
    // 1) Baris yang dipertahankan: ambil qty gabungan + metadata baris pertama.
    await tx.execute(sql`
      WITH dup AS (
        SELECT transaction_id, warehouse_id, item_id,
               MIN(id) AS keep_id,
               SUM(qty_in) AS qty_in,
               SUM(qty_out) AS qty_out,
               (array_agg(batch_id ORDER BY created_at, id))[1] AS batch_id,
               (array_agg(reference_type ORDER BY created_at, id))[1] AS reference_type,
               (array_agg(reference_id ORDER BY created_at, id))[1] AS reference_id,
               (array_agg(created_by ORDER BY created_at, id))[1] AS created_by,
               MIN(transaction_date) AS transaction_date,
               MIN(created_at) AS created_at
        FROM stock_ledger
        GROUP BY transaction_id, warehouse_id, item_id
        HAVING COUNT(*) > 1
      )
      UPDATE stock_ledger l
      SET qty_in = d.qty_in,
          qty_out = d.qty_out,
          batch_id = d.batch_id,
          reference_type = d.reference_type,
          reference_id = d.reference_id,
          created_by = d.created_by,
          transaction_date = d.transaction_date,
          created_at = d.created_at
      FROM dup d
      WHERE l.id = d.keep_id
    `);

    // 2) Hapus baris duplikat sisanya.
    await tx.execute(sql`
      DELETE FROM stock_ledger l
      USING (
        SELECT transaction_id, warehouse_id, item_id, MIN(id) AS keep_id
        FROM stock_ledger
        GROUP BY transaction_id, warehouse_id, item_id
        HAVING COUNT(*) > 1
      ) d
      WHERE l.transaction_id = d.transaction_id
        AND l.warehouse_id = d.warehouse_id
        AND l.item_id = d.item_id
        AND l.id <> d.keep_id
    `);

    // 3) Hitung ulang qty_balance seluruh ledger.
    await tx.execute(sql`
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
  });

  console.log("Ledger selesai digabung & saldo dihitung ulang.");
}

main()
  .catch((e) => {
    console.error("Gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });