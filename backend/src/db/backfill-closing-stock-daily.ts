// Backfill closing stock harian untuk item finish good (total semua warehouse)
// Generate 90 hari terakhir (2026-06-05 s/d 2026-09-03) dengan random walk
// Jalankan: npm run db:backfill-closing-stock-daily -w backend (add script) atau npx tsx src/db/backfill-closing-stock-daily.ts
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import { items, stockBalances, warehouses } from "./schema";
import { yymmOf } from "../lib/id";

function randomInt(min:number,max:number){ return Math.floor(Math.random()*(max-min+1))+min; }
function fmtDate(d:Date){ return d.toISOString().slice(0,10); }

async function main(){
  console.log("=== Backfill closing stock harian finish good (stock_balances) ===");
  // Ambil Finish Good items
  const fgItems = await db.select().from(items).where(sql`${items.isFinishGood} = true`);
  console.log(`FG items: ${fgItems.length} (${fgItems.map(i=>i.code).join(",")})`);
  const whs = await db.select().from(warehouses);
  console.log(`Warehouses: ${whs.length} (${whs.map(w=>w.code).join(",")})`);

  // Ambil base closingQty per wh+item dari snapshot terbaru (MAX balance_date per wh+item)
  // Kita ambil dari existing stock_balances terbaru per wh+item sebagai base
  const baseMap = new Map<string, number>(); // key whId:itemId -> qty
  const existing = await db.execute(sql`SELECT warehouse_id, item_id, closing_qty FROM stock_balances WHERE (warehouse_id, item_id, balance_date) IN (SELECT warehouse_id, item_id, MAX(balance_date) FROM stock_balances GROUP BY warehouse_id, item_id)`) as any;
  const rows = (existing.rows ?? existing) as any[];
  console.log(`Existing snapshot rows: ${rows.length}`);
  for(const r of rows){
    const key = `${r.warehouse_id}:${r.item_id}`;
    // hanya FG
    const it = fgItems.find(i=>i.id===r.item_id);
    if(it) baseMap.set(key, Number(r.closing_qty));
  }
  // Jika ada FG yang belum punya snapshot, assign base 5000
  for(const wh of whs){
    for(const it of fgItems){
      const key = `${wh.id}:${it.id}`;
      if(!baseMap.has(key)){
        baseMap.set(key, randomInt(3000, 8000));
        console.log(`  base missing ${wh.code}:${it.code} -> ${baseMap.get(key)}`);
      }
    }
  }

  // Generate 90 hari: 2026-06-05 .. 2026-09-03
  const end = new Date("2026-09-03");
  const start = new Date("2026-06-05");
  const days: string[] = [];
  for(let d=new Date(start); d<=end; d.setDate(d.getDate()+1)){
    days.push(fmtDate(new Date(d)));
  }
  console.log(`Generate ${days.length} days from ${days[0]} to ${days[days.length-1]}`);

  // Counter untuk id serial per YYMM
  const counters = new Map<string, number>();
  function nextId(prefix:string, date:Date){
    const yymm = yymmOf(date);
    const key = `${prefix}-${yymm}`;
    const n = (counters.get(key) ?? 0)+1;
    counters.set(key, n);
    return `${prefix}-${yymm}-${String(n).padStart(4,"0")}`;
  }

  // Hapus historis FG lama untuk rentang ini agar idempotent (optional)
  // Kita hapus yang balance_date antara start-end dan item FG untuk menghindari duplikat saat rerun
  // Tapi kita pakai ON CONFLICT DO UPDATE, jadi bisa upsert tanpa hapus
  let inserted=0, updated=0;
  for(const dateStr of days){
    const dateObj = new Date(dateStr);
    for(const wh of whs){
      for(const it of fgItems){
        const key = `${wh.id}:${it.id}`;
        const base = baseMap.get(key) ?? 5000;
        // Random walk: variasi +/- 8% per hari, plus trend kecil
        // Kita pakai base + sin + random
        const dayIdx = days.indexOf(dateStr);
        const trend = Math.sin(dayIdx/15)* base*0.05; // gelombang 5%
        const noise = randomInt(-Math.floor(base*0.08), Math.floor(base*0.08));
        let qty = Math.round(base + trend + noise);
        qty = Math.max(500, qty); // minimal 500
        const id = nextId("stb", dateObj);
        // Cek existing untuk wh+item+date
        // Pakai insert ON CONFLICT (wh,item,date) DO UPDATE
        try{
          await db.execute(sql`
            INSERT INTO stock_balances (id, warehouse_id, item_id, balance_date, closing_qty, opening_qty, in_qty, out_qty)
            VALUES (${id}, ${wh.id}, ${it.id}, ${dateStr}::date, ${qty}, 0, 0, 0)
            ON CONFLICT (warehouse_id, item_id, balance_date) DO UPDATE SET closing_qty = EXCLUDED.closing_qty, updated_at = now()
          ` as any);
          inserted++;
        }catch(e){
          console.error(`  fail ${wh.code} ${it.code} ${dateStr}`, e);
        }
      }
    }
    if(days.indexOf(dateStr) % 20===0) console.log(`  progress ${dateStr} (${days.indexOf(dateStr)+1}/${days.length})`);
  }
  console.log(`Done inserted/upserted ${inserted} rows`);

  // Verifikasi per hari total finish good
  const verify = await db.execute(sql`
    SELECT balance_date, SUM(closing_qty)::int as total, COUNT(*) as cnt
    FROM stock_balances
    WHERE balance_date BETWEEN ${days[0]}::date AND ${days[days.length-1]}::date
      AND item_id IN (SELECT id FROM items WHERE is_finish_good=true)
    GROUP BY balance_date ORDER BY balance_date DESC LIMIT 5
  ` as any) as any;
  console.log("Verify last 5 days total FG:", verify.rows ?? verify);

  const verifyKpi = await db.execute(sql`
    SELECT SUM(closing_qty)::int as total FROM stock_balances
    WHERE (warehouse_id, item_id, balance_date) IN (SELECT warehouse_id, item_id, MAX(balance_date) FROM stock_balances GROUP BY warehouse_id, item_id)
      AND item_id IN (SELECT id FROM items WHERE is_finish_good=true)
  ` as any) as any;
  console.log("KPI latest total FG (should be sum latest per wh+item):", verifyKpi.rows ?? verifyKpi);

  await pool.end();
}
main().catch(e=>{ console.error(e); process.exit(1); });
