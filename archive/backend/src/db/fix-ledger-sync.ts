import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

async function main() {
  console.log("Mulai sync stock_ledger TRF future -> past ...");
  const t0 = Date.now();
  // Batched 100k per iterasi untuk hindari long lock
  let total = 0;
  while (true) {
    const start = Date.now();
    const res = (await db.execute(sql`
      UPDATE stock_ledger l
      SET transaction_date = m.movement_date,
          created_at = m.movement_date
      FROM stock_movements m
      WHERE l.transaction_id = m.id
        AND m.id LIKE 'TRF-%'
        AND l.transaction_date > now()
        AND l.ctid IN (
          SELECT ctid FROM stock_ledger WHERE transaction_date > now() LIMIT 100000
        )
    `)) as unknown as { rowCount: number };
    const cnt = res.rowCount ?? 0;
    total += cnt;
    console.log(`  batch: ${cnt} rows (${((Date.now()-start)/1000).toFixed(1)}s) total ${total}`);
    if (cnt === 0) break;
    // kecil pause biar tidak bloat WAL
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(`Sync selesai ${total} rows dalam ${((Date.now()-t0)/1000).toFixed(1)}s`);

  // Fix opname deadlines future
  const r2 = await db.execute(sql`
    UPDATE opname_projects SET deadline = created_at + interval '5 days', updated_at = LEAST(updated_at, now()) WHERE deadline > now()
  `);
  console.log(`opname_projects deadline fix: ${(r2 as any).rowCount}`);

  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1)});
