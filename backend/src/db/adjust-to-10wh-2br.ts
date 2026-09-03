// Adjust: warehouse -> 10, branch -> 2, isi standard_cost & valuation_rate semua item
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

function randomInt(min:number,max:number){ return Math.floor(Math.random()*(max-min+1))+min; }
function pick<T>(arr:T[]):T{ return arr[Math.floor(Math.random()*arr.length)]; }

async function main(){
  console.log("=== Adjust warehouses->10, branches->2, isi cost/valuation ===");

  // Ambil 2 branches tertua sebagai keep (atau random 2)
  const brAll = (await db.execute(sql`SELECT id, code, name FROM branches ORDER BY created_at ASC`)) as any;
  const brRows: {id:string,code:string,name:string}[] = brAll.rows ?? brAll;
  console.log(`Branches now: ${brRows.length}`);
  const keepBrIds = brRows.slice(0,2).map((r:any)=>r.id);
  if(keepBrIds.length <2) throw new Error("branch kurang dari 2");
  console.log(`Keep branches: ${keepBrIds.join(", ")}`);

  // Ambil 10 warehouses untuk di-keep (random 10 dari yang ada)
  const whAll = (await db.execute(sql`SELECT id, branch_id, code FROM warehouses ORDER BY random() LIMIT 20`)) as any;
  const whCandidates: {id:string,branch_id:string,code:string}[] = whAll.rows ?? whAll;
  // ambil 10 paling acak tapi pastikan branchnya nanti di-update ke keepBrIds
  const allWh = (await db.execute(sql`SELECT id FROM warehouses ORDER BY created_at ASC`)) as any;
  const allWhIds: string[] = (allWh.rows ?? allWh).map((r:any)=>r.id);
  // pilih 10 random dari all
  const shuffled = [...allWhIds].sort(()=>0.5 - Math.random());
  const keepWhIds = shuffled.slice(0,10);
  console.log(`Keep warehouses (10): ${keepWhIds.join(", ")}`);

  // 1) Update semua tabel yang punya branch_id -> map ke keepBrIds
  const branchTables = [
    {tbl:"warehouses", col:"branch_id"},
    {tbl:"suppliers", col:"branch_id"},
    {tbl:"customers", col:"branch_id"},
    {tbl:"purchase_orders", col:"branch_id"},
    {tbl:"sales_orders", col:"branch_id"},
    {tbl:"goods_receipts", col:"branch_id"},
    {tbl:"dashboards", col:"branch_id"},
  ];
  for(const {tbl,col} of branchTables){
    try{
      // set warehouse-branch mapping dulu untuk warehouses
      if(tbl==="warehouses"){
        // keepers harus pakai keepBrIds
        for(const whId of keepWhIds){
          const br = pick(keepBrIds);
          await db.execute(sql.raw(`UPDATE warehouses SET branch_id='${br}' WHERE id='${whId}'`));
        }
        // non-keepers juga update dulu sebelum delete (biar FK aman, tapi akan di-delete anyway)
        await db.execute(sql.raw(`UPDATE warehouses SET branch_id='${keepBrIds[0]}' WHERE id NOT IN ('${keepWhIds.join("','")}')`));
        console.log(`  ${tbl}.${col} -> reassigned to keep branches`);
      }else{
        // untuk tabel lain: random keep branch
        // lakukan via SQL random pick
        await db.execute(sql.raw(`
          UPDATE ${tbl} SET ${col} = (
            SELECT id FROM (VALUES ${keepBrIds.map(id=>`('${id}')`).join(",")}) AS t(id) ORDER BY random() LIMIT 1
          ) WHERE ${col} NOT IN ('${keepBrIds.join("','")}') OR ${col} IS NULL
        `));
        // juga untuk yang sudah di keep tapi biar merata, acak ulang 50% ?
        // tidak, biar saja
        const cnt = (await db.execute(sql.raw(`SELECT count(*)::int n FROM ${tbl}`)) as any).rows?.[0]?.n;
        console.log(`  ${tbl}.${col} updated -> ${cnt} rows`);
      }
    }catch(e:any){
      console.warn(`  skip ${tbl}: ${e.message}`);
    }
  }

  // 2) Update semua tabel warehouse_id -> map ke keepWhIds
  // helper untuk update dengan handling unique constraint untuk stock_balances & stock_batches
  const whTablesSimple = [
    {tbl:"locations", col:"warehouse_id"},
    {tbl:"purchase_orders", col:"warehouse_id"},
    {tbl:"sales_orders", col:"warehouse_id"},
    {tbl:"goods_receipts", col:"warehouse_id"},
    {tbl:"stock_ledger", col:"warehouse_id"},
    {tbl:"opname_scan_details", col:"warehouse_id"},
    {tbl:"opname_counts", col:"warehouse_id"},
    {tbl:"opname_count_details", col:"warehouse_id"},
  ];
  // Untuk stock_movements details: from/to
  for(const {tbl,col} of whTablesSimple){
    try{
      await db.execute(sql.raw(`
        UPDATE ${tbl} SET ${col} = (
          SELECT id FROM (VALUES ${keepWhIds.map(id=>`('${id}')`).join(",")}) AS t(id) ORDER BY random() LIMIT 1
        ) WHERE ${col} NOT IN ('${keepWhIds.join("','")}') 
      `));
      console.log(`  ${tbl}.${col} remapped`);
    }catch(e:any){
      console.warn(`  skip ${tbl}.${col}: ${e.message}`);
    }
  }

  // opname_warehouses need dedup (unique opnameId+warehouseId) -> handle via JS
  console.log("  handling opname_warehouses dedup...");
  const owRows = (await db.execute(sql`SELECT id, opname_id, warehouse_id FROM opname_warehouses WHERE warehouse_id NOT IN (${sql.raw(`'${keepWhIds.join("','")}'`)})`)) as any;
  const ows: {id:string,opname_id:string,warehouse_id:string}[] = owRows.rows ?? owRows ?? [];
  console.log(`    opname_warehouses to remap: ${ows.length}`);
  for(const r of ows){
    let tries=0;
    let placed=false;
    while(tries<10 && !placed){
      tries++;
      const newWh = pick(keepWhIds);
      const exists = (await db.execute(sql`SELECT id FROM opname_warehouses WHERE opname_id=${r.opname_id} AND warehouse_id=${newWh} LIMIT 1`)) as any;
      const exRows = exists.rows ?? exists;
      if(exRows.length>0) continue;
      await db.execute(sql`UPDATE opname_warehouses SET warehouse_id=${newWh} WHERE id=${r.id}`);
      placed=true;
    }
    if(!placed){
      // tidak ada slot unik, hapus
      await db.execute(sql`DELETE FROM opname_warehouses WHERE id=${r.id}`);
    }
  }
  console.log("    opname_warehouses remapped");

  // stock_movement_details from/to (nullable)
  try{
    await db.execute(sql.raw(`
      UPDATE stock_movement_details SET from_warehouse_id = (
        SELECT id FROM (VALUES ${keepWhIds.map(id=>`('${id}')`).join(",")}) AS t(id) ORDER BY random() LIMIT 1
      ) WHERE from_warehouse_id IS NOT NULL AND from_warehouse_id NOT IN ('${keepWhIds.join("','")}') 
    `));
    await db.execute(sql.raw(`
      UPDATE stock_movement_details SET to_warehouse_id = (
        SELECT id FROM (VALUES ${keepWhIds.map(id=>`('${id}')`).join(",")}) AS t(id) ORDER BY random() LIMIT 1
      ) WHERE to_warehouse_id IS NOT NULL AND to_warehouse_id NOT IN ('${keepWhIds.join("','")}') 
    `));
    // pastikan tidak from=to untuk yang keduanya not null (swap salah satu)
    console.log("  stock_movement_details from/to remapped");
  }catch(e:any){ console.warn(e.message); }

  // locations sudah, tapi cek stock_balances & stock_batches need dedup
  // stock_balances: warehouse_id+item_id unique
  console.log("  handling stock_balances dedup...");
  // buat mapping temporary: untuk setiap row yang warehouse_id not in keep, coba pindahkan, jika konflik hapus
  const balRows = (await db.execute(sql`SELECT id, warehouse_id, item_id FROM stock_balances WHERE warehouse_id NOT IN (${sql.raw(`'${keepWhIds.join("','")}'`)})`)) as any;
  const bals: {id:string,warehouse_id:string,item_id:string}[] = balRows.rows ?? balRows ?? [];
  console.log(`    stock_balances to remap: ${bals.length}`);
  for(const r of bals){
    const newWh = pick(keepWhIds);
    // cek apakah sudah ada pasangan newWh+item
    const exists = (await db.execute(sql`SELECT id FROM stock_balances WHERE warehouse_id=${newWh} AND item_id=${r.item_id} LIMIT 1`)) as any;
    const exRows = exists.rows ?? exists;
    if(exRows.length>0){
      // duplicate -> delete this row
      await db.execute(sql`DELETE FROM stock_balances WHERE id=${r.id}`);
    }else{
      await db.execute(sql`UPDATE stock_balances SET warehouse_id=${newWh} WHERE id=${r.id}`);
    }
  }
  // stock_batches: batch_id+warehouse_id unique
  console.log("  handling stock_batches dedup...");
  const sbRows = (await db.execute(sql`SELECT id, warehouse_id, batch_id FROM stock_batches WHERE warehouse_id NOT IN (${sql.raw(`'${keepWhIds.join("','")}'`)})`)) as any;
  const sbs: {id:string,warehouse_id:string,batch_id:string}[] = sbRows.rows ?? sbRows ?? [];
  console.log(`    stock_batches to remap: ${sbs.length}`);
  for(const r of sbs){
    const newWh = pick(keepWhIds);
    const exists = (await db.execute(sql`SELECT id FROM stock_batches WHERE warehouse_id=${newWh} AND batch_id=${r.batch_id} LIMIT 1`)) as any;
    const exRows = exists.rows ?? exists;
    if(exRows.length>0){
      await db.execute(sql`DELETE FROM stock_batches WHERE id=${r.id}`);
    }else{
      await db.execute(sql`UPDATE stock_batches SET warehouse_id=${newWh} WHERE id=${r.id}`);
    }
  }
  // stock_barcodes jika ada
  try{
    await db.execute(sql.raw(`
      UPDATE stock_barcodes SET warehouse_id = (
        SELECT id FROM (VALUES ${keepWhIds.map(id=>`('${id}')`).join(",")}) AS t(id) ORDER BY random() LIMIT 1
      ) WHERE warehouse_id NOT IN ('${keepWhIds.join("','")}') 
    `));
    console.log("  stock_barcodes remapped");
  }catch{}

  // 3) Hapus warehouses berlebih
  console.log("  deleting excess warehouses...");
  await db.execute(sql.raw(`DELETE FROM warehouses WHERE id NOT IN ('${keepWhIds.join("','")}')`));
  const whCount = (await db.execute(sql`SELECT count(*)::int n FROM warehouses`)) as any;
  console.log(`    warehouses now: ${(whCount.rows?.[0]?.n ?? whCount[0]?.n)}`);

  // Hapus locations yang mungkin orphan? sudah di-remap, tidak perlu. Tapi pastikan locations masih 1000
  // Jika warehouses di-delete cascade locations, kita sudah remap jadi tidak ke-delete

  // 4) Hapus branches berlebih
  console.log("  deleting excess branches...");
  await db.execute(sql.raw(`DELETE FROM branches WHERE id NOT IN ('${keepBrIds.join("','")}')`));
  const brCount = (await db.execute(sql`SELECT count(*)::int n FROM branches`)) as any;
  console.log(`    branches now: ${(brCount.rows?.[0]?.n ?? brCount[0]?.n)}`);

  // 5) Isi standard_cost & valuation_rate untuk semua items
  console.log("  filling standard_cost & valuation_rate...");
  // update yang null atau 0 atau <1
  // valuation_rate default 0, standard_cost nullable
  // set random 5k-500k dengan 2 desimal
  const itemsToFix = (await db.execute(sql`SELECT id, standard_cost, valuation_rate FROM items`)) as any;
  const itemRows: {id:string, standard_cost:string|null, valuation_rate:string}[] = itemsToFix.rows ?? itemsToFix;
  let fixed=0;
  for(const it of itemRows){
    const needStd = it.standard_cost==null || Number(it.standard_cost)==0;
    const needVal = it.valuation_rate==null || Number(it.valuation_rate)==0;
    if(needStd || needVal){
      const std = needStd ? (randomInt(5000,500000) + randomInt(0,99)/100).toFixed(2) : it.standard_cost;
      const val = needVal ? (randomInt(5000,500000) + randomInt(0,99)/100).toFixed(2) : it.valuation_rate;
      await db.execute(sql`UPDATE items SET standard_cost=${std}, valuation_rate=${val} WHERE id=${it.id}`);
      fixed++;
    }
  }
  console.log(`    fixed ${fixed} items with null/zero cost`);

  // Pastikan semua items sekarang punya cost/valuation non-zero, juga variasikan sedikit yang sudah ada biar lebih realistis?
  // Untuk yang sudah ada, biarkan, tapi pastikan tidak 0
  // Update statistik
  const stats = (await db.execute(sql`SELECT 
    count(*)::int total,
    count(*) FILTER (WHERE standard_cost IS NOT NULL AND standard_cost::numeric >0)::int sc_filled,
    count(*) FILTER (WHERE valuation_rate::numeric >0)::int val_filled,
    min(standard_cost::numeric)::text sc_min,
    max(standard_cost::numeric)::text sc_max,
    avg(standard_cost::numeric)::text sc_avg,
    min(valuation_rate::numeric)::text val_min,
    max(valuation_rate::numeric)::text val_max
    FROM items`)) as any;
  console.log("    items cost stats:", (stats.rows?.[0] ?? stats[0]));

  // 6) Top up yang terhapus karena dedup untuk stock_balances/stock_batches/location agar tetap 1000
  // stock_balances sekarang mungkin <1000 karena dedup deletions
  const balCount = Number((await db.execute(sql`SELECT count(*)::int n FROM stock_balances`) as any).rows?.[0]?.n);
  const needBal = 1000 - balCount;
  if(needBal>0){
    console.log(`  topping up stock_balances +${needBal}...`);
    const itemsAll = (await db.execute(sql`SELECT id FROM items`)) as any;
    const itemIds: string[] = (itemsAll.rows ?? itemsAll).map((r:any)=>r.id);
    const existingPairs = new Set(((await db.execute(sql`SELECT warehouse_id||'|'||item_id as k FROM stock_balances`) as any).rows ?? []).map((r:any)=>r.k));
    let added=0;
    let tries=0;
    while(added<needBal && tries<needBal*10){
      tries++;
      const wh = pick(keepWhIds);
      const it = pick(itemIds);
      const k = `${wh}|${it}`;
      if(existingPairs.has(k)) continue;
      existingPairs.add(k);
      const d = new Date(Date.now() - randomInt(0, 700)*86400000 - randomInt(0,86400)*1000);
      const opening=randomInt(0,1000), inQty=randomInt(0,500), outQty=randomInt(0,400);
      const id = `stb-top-${Date.now()}-${added}-${Math.random().toString(36).slice(2,5)}`;
      await db.execute(sql`INSERT INTO stock_balances (id, balance_date, warehouse_id, item_id, opening_qty, in_qty, out_qty, closing_qty, created_at, updated_at) VALUES (${id}, ${d.toISOString().slice(0,10)}, ${wh}, ${it}, ${opening}, ${inQty}, ${outQty}, ${opening+inQty-outQty}, ${d}, ${d}) ON CONFLICT DO NOTHING`);
      added++;
    }
    console.log(`    added ${added} stock_balances`);
  }
  const sbCount = Number((await db.execute(sql`SELECT count(*)::int n FROM stock_batches`) as any).rows?.[0]?.n);
  const needSb = 1000 - sbCount;
  if(needSb>0){
    console.log(`  topping up stock_batches +${needSb}...`);
    const batchesAll = (await db.execute(sql`SELECT id FROM batches`)) as any;
    const batchIds: string[] = (batchesAll.rows ?? batchesAll).map((r:any)=>r.id);
    const existing = new Set(((await db.execute(sql`SELECT warehouse_id||'|'||batch_id as k FROM stock_batches`) as any).rows ?? []).map((r:any)=>r.k));
    let added=0, tries=0;
    while(added<needSb && tries<needSb*10){
      tries++;
      const wh=pick(keepWhIds);
      const bt=pick(batchIds);
      const k=`${wh}|${bt}`;
      if(existing.has(k)) continue;
      existing.add(k);
      const id=`stbch-top-${Date.now()}-${added}-${Math.random().toString(36).slice(2,4)}`;
      await db.execute(sql`INSERT INTO stock_batches (id, batch_id, warehouse_id, qty, updated_at) VALUES (${id}, ${bt}, ${wh}, ${String(randomInt(0,500))}, now()) ON CONFLICT DO NOTHING`);
      added++;
    }
    console.log(`    added ${added} stock_batches`);
  }

  // locations: pastikan masih 1000, jika berkurang karena cascade, top up
  const locCount = Number((await db.execute(sql`SELECT count(*)::int n FROM locations`) as any).rows?.[0]?.n);
  if(locCount<1000){
    const needLoc=1000-locCount;
    console.log(`  topping up locations +${needLoc}...`);
    for(let i=0;i<needLoc;i++){
      const wh=pick(keepWhIds);
      const id=`loc-top-${Date.now()}-${i}-${Math.random().toString(36).slice(2,4)}`;
      const zone=pick(["A","B","C","D","E","F"]);
      const num=String(randomInt(1,99)).padStart(2,"0");
      await db.execute(sql`INSERT INTO locations (id, warehouse_id, code, name, is_active, created_at) VALUES (${id}, ${wh}, ${zone+num+'-'+Math.random().toString(36).slice(2,4).toUpperCase()}, ${'Rak '+zone+num}, true, now()) ON CONFLICT DO NOTHING`);
    }
  }

  console.log("\n=== Final counts ===");
  for(const t of ["branches","warehouses","locations","items","suppliers","customers","purchase_orders","sales_orders","goods_receipts","stock_movements","stock_balances","stock_batches","batches","opname_projects"]){
    const r = (await db.execute(sql.raw(`SELECT count(*)::int n FROM ${t}`)) as any);
    console.log(`  ${t}: ${r.rows?.[0]?.n ?? r[0]?.n}`);
  }
  const brFinal = (await db.execute(sql`SELECT id, code, name, city FROM branches`)) as any;
  console.log("Branches kept:", (brFinal.rows ?? brFinal));
  const whFinal = (await db.execute(sql`SELECT id, code, name, branch_id FROM warehouses`)) as any;
  console.log("Warehouses kept:", (whFinal.rows ?? whFinal).slice(0,10));
}

main().catch(e=>{console.error(e); process.exitCode=1}).finally(async()=>{await pool.end();});
