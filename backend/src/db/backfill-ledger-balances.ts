// @ts-nocheck
// Backfill stock_ledger.qty_balance menjadi saldo berjalan agregat yang
// konsisten dengan stock_balances (sebelumnya campur saldo batch vs agregat).
//
// Formula per (warehouse_id, item_id):
//   base = stock_balances.closing_qty - SUM(qty_in - qty_out) seluruh ledger
//   balance baris = base + kumulatif (qty_in - qty_out) urut (transaction_date, id)
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

async function main() {
  await db.execute(sql`
    WITH calc AS (
      SELECT
        l.id,
        (
          COALESCE(b.closing_qty, 0)
          - COALESCE(t.total, 0)
          + SUM(l.qty_in - l.qty_out) OVER (
              PARTITION BY l.warehouse_id, l.item_id
              ORDER BY l.transaction_date, l.id
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
  console.log("Backfill qty_balance ledger selesai.");
}

main()
  .catch((e) => {
    console.error("Backfill gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });