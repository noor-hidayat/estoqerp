import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

async function main() {
  console.log("Recompute qty_balance full (2M rows) ...");
  const t0 = Date.now();
  // Increase work_mem for this session to handle window sort faster
  await db.execute(sql`SET LOCAL work_mem = '512MB'`);
  await db.execute(sql`SET LOCAL statement_timeout = '600s'`);
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
  console.log(`Recompute selesai dalam ${((Date.now()-t0)/1000).toFixed(1)}s`);

  const res = await db.execute(sql`
    SELECT count(*)::int n FROM stock_ledger l
    JOIN stock_balances b ON b.warehouse_id=l.warehouse_id AND b.item_id=l.item_id
    WHERE l.id IN (
      SELECT id FROM stock_ledger l2 WHERE (l2.warehouse_id,l2.item_id)=(l.warehouse_id,l.item_id)
      ORDER BY transaction_date DESC, created_at DESC, id DESC LIMIT 1
    ) AND l.qty_balance <> b.closing_qty
  `) as unknown as { rows: { n:number }[] };
  console.log(`Mismatch last balance vs closing_qty: ${res.rows[0].n} (harus 0)`);
  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1)});
