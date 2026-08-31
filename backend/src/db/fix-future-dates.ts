// Geser semua timestamp dummy yang berada di masa depan (> now()) ke bawah now().
// Skema dummy 1jt TRF sebelumnya pakai baseTime = Date.now() → window now .. now+11.5d.
// Setelah fix seed, data lama tetap di masa depan → posting now() tetap 3 detik (suffix besar).
// Skrip ini: hitung overshoot = MAX(transaction_date) - now(), lalu geser semua
// stock_movements / stock_movement_details / stock_ledger uniform agar MAX = now() - 1 hari.
// Setelah geser, hitung ulang qty_balance ledger (running sum).
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

async function main() {
  const nowRes = (await db.execute(sql`SELECT now()::timestamptz as now`)) as unknown as { rows: { now: string }[] };
  const now = nowRes.rows[0].now;
  console.log(`now() DB = ${now}`);

  // ---- Deteksi overshoot ----
  const maxMovRes = (await db.execute(sql`SELECT MAX(movement_date)::text as maxmov FROM stock_movements`)) as unknown as { rows: { maxmov: string | null }[] };
  const maxMov = maxMovRes.rows[0].maxmov;
  const maxLedgerRes = (await db.execute(sql`SELECT MAX(transaction_date)::text as maxledger FROM stock_ledger`)) as unknown as { rows: { maxledger: string | null }[] };
  const maxLedger = maxLedgerRes.rows[0].maxledger;
  const maxDetailRes = (await db.execute(sql`SELECT MAX(created_at)::text as maxdetail FROM stock_movement_details`)) as unknown as { rows: { maxdetail: string | null }[] };
  const maxDetail = maxDetailRes.rows[0].maxdetail;
  console.log(`MAX movement_date   = ${maxMov}`);
  console.log(`MAX transaction_date= ${maxLedger}`);
  console.log(`MAX detail createdAt= ${maxDetail}`);

  const maxDateStr = [maxMov, maxLedger, maxDetail].filter(Boolean).sort().pop() || null;
  if (!maxDateStr) {
    console.log("Tidak ada data dummy, selesai.");
    await pool.end();
    return;
  }
  const maxDate = new Date(maxDateStr);
  const nowDate = new Date(now);
  const overshootMs = maxDate.getTime() - nowDate.getTime();
  console.log(`Overshoot = ${(overshootMs / 86400000).toFixed(2)} hari`);

  if (overshootMs <= -86_400_000) {
    console.log("MAX sudah < now() -1 hari, tidak perlu geser.");
  } else {
    // Geser agar MAX = now() -1 hari (buffer 1 hari agar posting now() tail)
    const shiftMs = overshootMs + 86_400_000; // +1 hari
    const shiftInterval = `${Math.ceil(shiftMs / 1000)} seconds`;
    console.log(`Menggeser semua dummy ke masa lalu sebesar ${shiftInterval} ...`);

    // 1) stock_movements
    const r1 = await db.execute(sql`
      UPDATE stock_movements
      SET movement_date = movement_date - ${shiftInterval}::interval,
          updated_at = LEAST(updated_at - ${shiftInterval}::interval, now() - interval '1 second'),
          created_at = LEAST(created_at - ${shiftInterval}::interval, now() - interval '1 second')
      WHERE id LIKE 'TRF-%'
    `);
    console.log(`  stock_movements terupdate: ${(r1 as any).rowCount ?? "?"}`);

    // 2) stock_movement_details
    const r2 = await db.execute(sql`
      UPDATE stock_movement_details
      SET created_at = created_at - ${shiftInterval}::interval
      WHERE movement_id LIKE 'TRF-%'
    `);
    console.log(`  stock_movement_details terupdate: ${(r2 as any).rowCount ?? "?"}`);

    // 3) stock_ledger: sinkron dari movement_date + created_at detail
    //    (transaction_date = movement_date, created_at = detail created_at)
    const r3 = await db.execute(sql`
      UPDATE stock_ledger l
      SET transaction_date = m.movement_date,
          created_at = md.created_at
      FROM stock_movements m
      JOIN stock_movement_details md ON md.movement_id = m.id
      WHERE l.transaction_id = m.id
        AND m.id LIKE 'TRF-%'
        AND md.id = (
          SELECT md2.id FROM stock_movement_details md2
          WHERE md2.movement_id = m.id LIMIT 1
        )
    `);
    console.log(`  stock_ledger terupdate: ${(r3 as any).rowCount ?? "?"}`);

    // Validasi MAX baru
    const maxMov2Res = (await db.execute(sql`SELECT MAX(movement_date)::text as maxmov2 FROM stock_movements WHERE id LIKE 'TRF-%'`)) as unknown as { rows: { maxmov2: string | null }[] };
    const maxMov2 = maxMov2Res.rows[0].maxmov2;
    const maxLedger2Res = (await db.execute(sql`SELECT MAX(transaction_date)::text as maxledger2 FROM stock_ledger`)) as unknown as { rows: { maxledger2: string | null }[] };
    const maxLedger2 = maxLedger2Res.rows[0].maxledger2;
    console.log(`MAX baru movement_date   = ${maxMov2}`);
    console.log(`MAX baru transaction_date= ${maxLedger2}`);
  }

  // 4) opname_projects deadline future -> geser ke past (deadline = created_at + 5 hari)
  const r4 = await db.execute(sql`
    UPDATE opname_projects
    SET deadline = created_at + interval '5 days',
        updated_at = LEAST(updated_at, now())
    WHERE deadline > now()
  `);
  console.log(`  opname_projects deadline future terupdate: ${(r4 as any).rowCount ?? "?"}`);

  // 5) Hitung ulang qty_balance ledger dari semua partisi yang tersentuh
  //    (full recompute per wh+item, karena urutan tanggal bergeser)
  console.log("Menghitung ulang qty_balance stock_ledger ...");
  const t0 = Date.now();
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
  console.log(`  qty_balance selesai dalam ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const sbRes = (await db.execute(sql`SELECT count(*)::int n FROM stock_balances`)) as unknown as { rows: { n: number }[] };
  const sb = sbRes.rows[0].n;
  const sldBadRes = (await db.execute(sql`
    SELECT count(*)::int n FROM stock_ledger l
    JOIN stock_balances b ON b.warehouse_id=l.warehouse_id AND b.item_id=l.item_id
    WHERE l.id IN (
      SELECT id FROM stock_ledger l2 WHERE (l2.warehouse_id,l2.item_id)=(l.warehouse_id,l.item_id)
      ORDER BY transaction_date DESC, created_at DESC, id DESC LIMIT 1
    ) AND l.qty_balance <> b.closing_qty
  `)) as unknown as { rows: { n: number }[] };
  const sldBad = sldBadRes.rows[0].n;
  console.log(`Verifikasi: stock_balances=${sb}, ledger last balance mismatch=${sldBad} (harus 0)`);

  console.log("Selesai — semua dummy kini < now() -1 hari, posting now() = tail (80ms).");
  await pool.end();
}

main().catch((e) => {
  console.error("Fix gagal:", e);
  process.exit(1);
});
