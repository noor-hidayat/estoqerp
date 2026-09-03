// Lanjutan cepat untuk sisa 100k — stock_balances, stock_batches, opname
// Optimasi: untuk stock_balances & stock_batches, drop index unique sementara, insert batch besar, recreate index.
// Opname pakai chunk insert biasa (sudah terbukti cepat untuk PO/SO).

import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  batches,
  items,
  locations,
  opnameCountDetails,
  opnameCounts,
  opnameProjects,
  opnameScanDetails,
  opnameScans,
  opnameWarehouses,
  stockBalances,
  stockBatches,
  warehouses,
  users,
} from "./schema";
import { mmyyOf, yymmOf } from "../lib/id";

const TARGET = 100000;
const CHUNK = 2000;

function randomInt(min:number,max:number){return Math.floor(Math.random()*(max-min+1))+min;}
function pick<T>(arr:T[]):T{return arr[Math.floor(Math.random()*arr.length)];}
function randomSuffix(len=4){return Math.random().toString(36).slice(2,2+len).toUpperCase();}
const counters=new Map<string,number>();
function genId(prefix:string,date:Date=new Date()){
  const key=`${prefix}-${yymmOf(date)}`;
  const n=(counters.get(key)??randomInt(1000,9000))+1;
  counters.set(key,n);
  return `${key}-${String(n).padStart(6,"0")}-${randomSuffix(3)}`;
}
function genSocId(date:Date){
  const key=`SOC-${mmyyOf(date)}`;
  const n=(counters.get(key)??randomInt(1000,9000))+1;
  counters.set(key,n);
  return `${key}-${String(n).padStart(6,"0")}-${randomSuffix(2)}`;
}
function randomDate(){
  const start=new Date("2023-01-01T00:00:00Z").getTime();
  const end=Date.now();
  return new Date(start+Math.random()*(end-start));
}
const CITIES=["Jakarta","Surabaya","Bandung","Medan","Semarang","Yogyakarta","Makassar","Palembang","Bekasi","Tangerang","Depok","Bogor","Malang","Batam","Pekanbaru","Balikpapan","Manado","Denpasar","Samarinda","Pontianak"];

async function seedStockBalancesFast(){
  const cur=Number((await db.execute(sql`SELECT count(*)::int n FROM stock_balances`) as any).rows[0].n);
  const need=TARGET-cur;
  if(need<=0){console.log(`[stock_balances] sudah ${cur} skip`); return;}
  console.log(`\n[stock_balances] cur=${cur} need=${need} — drop index untuk bulk`);
  // Drop unique index lama (wh,item) dan yang baru (wh,item,date) jika ada, biar bulk cepat + bisa multi-date per wh+item
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "uq_stock_balances_wh_item"`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "uq_stock_balances_wh_item_date"`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "idx_stock_balances_item"`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "idx_stock_balances_date"`));
  console.log(`  index dropped (old wh_item + new wh_item_date)`);

  const whs=await db.select().from(warehouses);
  const its=await db.select().from(items);
  // Build existing set untuk menghindari duplikat (hanya 5k jadi cepat)
  const existing=new Set((await db.execute(sql`SELECT warehouse_id||'|'||item_id||'|'||balance_date::text as k FROM stock_balances`) as any).rows.map((r:any)=>r.k));
  let added=0;
  let seq=cur+1;
  // Deterministik: iterasi wh * item * dateOffset 0..60 -> cukup untuk 100k
  const dateOffsets=Array.from({length:60},(_,i)=>i);
  // Kumpulkan batch
  let batch:any[]=[];
  const flush=async()=>{
    if(!batch.length) return;
    await db.insert(stockBalances).values(batch as any);
    batch=[];
    console.log(`  stock_balances inserted ${added}/${need} (${Math.round(added/need*100)}%)`);
  };
  outer: for(const dOff of dateOffsets){
    const balDate=new Date(Date.now()-dOff*86400000).toISOString().slice(0,10);
    const d=new Date(Date.now()-dOff*86400000);
    for(const wh of whs){
      for(const it of its){
        if(added>=need) break outer;
        const k=`${wh.id}|${it.id}|${balDate}`;
        if(existing.has(k)) continue;
        existing.add(k);
        const h=(wh.id.charCodeAt(2)+it.id.charCodeAt(4)+dOff)%1000;
        const opening=20+(h%900);
        const inQty=h%40;
        const outQty=h%35;
        batch.push({
          id: `stb_c_${String(seq).padStart(6,"0")}_${randomSuffix(2)}`,
          balanceDate: balDate as any,
          warehouseId: wh.id,
          itemId: it.id,
          openingQty: opening,
          inQty, outQty,
          closingQty: opening+inQty-outQty,
          createdAt: d,
          updatedAt: d,
        });
        seq++; added++;
        if(batch.length>=CHUNK) await flush();
      }
    }
  }
  await flush();
  console.log(`  stock_balances recreate index (wh,item,date)...`);
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_balances_wh_item_date" ON "stock_balances" USING btree ("warehouse_id","item_id","balance_date")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "idx_stock_balances_item" ON "stock_balances" USING btree ("item_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "idx_stock_balances_date" ON "stock_balances" USING btree ("balance_date")`));
  // Jangan recreate old uq_stock_balances_wh_item (tanpa date) — biarkan multi-date per wh+item
  const final=Number((await db.execute(sql`SELECT count(*)::int n FROM stock_balances`) as any).rows[0].n);
  console.log(`  stock_balances final ${final}`);
}

async function seedStockBatchesFast(){
  const cur=Number((await db.execute(sql`SELECT count(*)::int n FROM stock_batches`) as any).rows[0].n);
  const need=TARGET-cur;
  if(need<=0){console.log(`[stock_batches] sudah ${cur} skip`); return;}
  console.log(`\n[stock_batches] cur=${cur} need=${need} — drop index`);
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "uq_stock_batches_batch_wh"`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "idx_stock_batches_wh"`));
  console.log(`  index dropped`);
  const whs=await db.select().from(warehouses);
  const bts=await db.select().from(batches);
  const existing=new Set((await db.execute(sql`SELECT batch_id||'|'||warehouse_id as k FROM stock_batches`) as any).rows.map((r:any)=>r.k));
  let added=0;
  let batch:any[]=[];
  const flush=async()=>{
    if(!batch.length) return;
    await db.insert(stockBatches).values(batch as any);
    batch=[];
    console.log(`  stock_batches inserted ${added}/${need} (${Math.round(added/need*100)}%)`);
  };
  // Generate dengan loop acak tapi dedup via Set — cukup cepat karena existing kecil
  let tries=0;
  while(added<need && tries<need*10){
    tries++;
    const b=pick(bts);
    const wh=pick(whs);
    const k=`${b.id}|${wh.id}`;
    if(existing.has(k)) continue;
    existing.add(k);
    batch.push({ id: genId("stbch", randomDate()), batchId: b.id, warehouseId: wh.id, qty: String(randomInt(0,500)), updatedAt: randomDate() });
    added++;
    if(batch.length>=CHUNK) await flush();
  }
  await flush();
  console.log(`  stock_batches recreate index...`);
  await db.execute(sql.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_batches_batch_wh" ON "stock_batches" USING btree ("batch_id","warehouse_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "idx_stock_batches_wh" ON "stock_batches" USING btree ("warehouse_id")`));
  const final=Number((await db.execute(sql`SELECT count(*)::int n FROM stock_batches`) as any).rows[0].n);
  console.log(`  stock_batches final ${final} (tries ${tries})`);
}

async function seedOpnameFast(){
  const adminId=(await db.select({id:users.id}).from(users).limit(1))[0]?.id ?? null;
  const whs=await db.select().from(warehouses);
  const its=await db.select().from(items);
  const locs=await db.select().from(locations);

  // projects
  const curP=Number((await db.execute(sql`SELECT count(*)::int n FROM opname_projects`) as any).rows[0].n);
  const needP=TARGET-curP;
  if(needP>0){
    console.log(`\n[opname_projects] need ${needP}`);
    for(let off=0; off<needP; off+=CHUNK){
      const cnt=Math.min(CHUNK, needP-off);
      const rows:any[]=[];
      for(let i=0;i<cnt;i++){ const d=randomDate(); rows.push({
        id: genId("opj", d),
        name: `${pick(["Opname","Stocktake","Audit"])} ${pick(CITIES)} ${randomSuffix(3)} ${d.getFullYear()}`,
        mode: pick(["COMPARE","SCRATCH"] as const),
        status: pick(["DRAFT","IN_PROGRESS","APPROVED","CANCELLED"] as const),
        createdAt:d, updatedAt:new Date(d.getTime()+randomInt(0,48*3600)*1000),
        deadline:new Date(d.getTime()+randomInt(5,30)*86400000),
        opnameDate:new Date(d.getTime()+randomInt(1,14)*86400000).toISOString().slice(0,10) as any,
        cutOffDate:new Date(d.getTime()+randomInt(-2,5)*86400000).toISOString().slice(0,10) as any,
        cutOffTime:`${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`,
        createdBy:adminId, description:`Project dummy ${randomSuffix(6)}`
      });}
      await db.insert(opnameProjects).values(rows as any).onConflictDoNothing();
      console.log(`  opname_projects ${off+cnt}/${needP}`);
    }
  } else console.log(`[opname_projects] skip`);
  const allProjects=await db.select({id: opnameProjects.id}).from(opnameProjects);

  // opname_warehouses
  const curOw=Number((await db.execute(sql`SELECT count(*)::int n FROM opname_warehouses`) as any).rows[0].n);
  const needOw=TARGET-curOw;
  if(needOw>0){
    console.log(`\n[opname_warehouses] need ${needOw}`);
    const existing=new Set((await db.execute(sql`SELECT opname_id||'|'||warehouse_id as k FROM opname_warehouses`) as any).rows.map((r:any)=>r.k));
    let added=0;
    while(added<needOw){
      const cnt=Math.min(CHUNK, needOw-added);
      const rows:any[]=[];
      let tries=0;
      while(rows.length<cnt && tries<cnt*5){ tries++; const proj=pick(allProjects); const wh=pick(whs); const k=`${proj.id}|${wh.id}`; if(existing.has(k)) continue; existing.add(k); const d=randomDate(); const status=pick(["PENDING","IN_PROGRESS","COMPLETED","CANCELLED"] as const); rows.push({ id:genId("opw",d), opnameId:proj.id, warehouseId:wh.id, status, startedAt: status!=="PENDING"? new Date(d.getTime()+randomInt(0,3600)*1000):null, completedAt: status==="COMPLETED"? new Date(d.getTime()+randomInt(3600,86400)*1000):null, createdAt:d }); }
      if(!rows.length) break;
      await db.insert(opnameWarehouses).values(rows as any).onConflictDoNothing();
      added+=rows.length;
      console.log(`  opname_warehouses ${added}/${needOw}`);
    }
  }

  // scans
  const curS=Number((await db.execute(sql`SELECT count(*)::int n FROM opname_scans`) as any).rows[0].n);
  const needS=TARGET-curS;
  if(needS>0){
    console.log(`\n[opname_scans] need ${needS}`);
    for(let off=0; off<needS; off+=CHUNK){
      const cnt=Math.min(CHUNK, needS-off);
      const rows:any[]=[];
      for(let i=0;i<cnt;i++){ const proj=pick(allProjects); const d=randomDate(); const status=pick(["DRAFT","POSTED","CANCELED"] as const); rows.push({ id:genId("ops",d), opnameId:proj.id, scannedBy:adminId, status, startedAt:d, completedAt: status==="POSTED"? new Date(d.getTime()+randomInt(600,7200)*1000): status==="CANCELED"? new Date(d.getTime()+randomInt(600,3600)*1000):null, createdAt:d, updatedAt:new Date(d.getTime()+randomInt(0,7200)*1000) });}
      await db.insert(opnameScans).values(rows as any).onConflictDoNothing();
      console.log(`  opname_scans ${off+cnt}/${needS}`);
    }
  }
  const allScans=await db.select().from(opnameScans);

  // scan_details
  const curSd=Number((await db.execute(sql`SELECT count(*)::int n FROM opname_scan_details`) as any).rows[0].n);
  const needSd=TARGET-curSd;
  if(needSd>0){
    console.log(`\n[opname_scan_details] need ${needSd}`);
    for(let off=0; off<needSd; off+=CHUNK){
      const cnt=Math.min(CHUNK, needSd-off);
      const rows:any[]=[];
      for(let i=0;i<cnt;i++){ const scan=pick(allScans); const d=randomDate(); const it=pick(its); const wh=pick(whs); const loc=locs.find(l=>l.warehouseId===wh.id) ?? pick(locs); rows.push({ id:genId("osd",d), scanId:(scan as any).id, opnameId:(scan as any).opnameId, warehouseId:wh.id, locationId:loc.id, itemId:it.id, barcode:`11${String(randomInt(10000000,99999999))}-${randomSuffix(2)}`, batch:`LOT-${randomSuffix(4)}`, batchId:null, parsed:{ITEM_CODE: it.id.slice(0,5), SEQUENCE:String(randomInt(1,9999))}, quantity:randomInt(1,50), qtyMode:pick(["AUTO","MANUAL"] as const), source:pick(["SCANNER","CAMERA","MANUAL"] as const), scannedAt:d });}
      await db.insert(opnameScanDetails).values(rows as any).onConflictDoNothing();
      console.log(`  opname_scan_details ${off+cnt}/${needSd}`);
    }
  }

  // counts
  const curOc=Number((await db.execute(sql`SELECT count(*)::int n FROM opname_counts`) as any).rows[0].n);
  const needOc=TARGET-curOc;
  if(needOc>0){
    console.log(`\n[opname_counts] need ${needOc}`);
    for(let off=0; off<needOc; off+=CHUNK){
      const cnt=Math.min(CHUNK, needOc-off);
      const rows:any[]=[];
      for(let i=0;i<cnt;i++){ const proj=pick(allProjects); const wh=pick(whs); const d=randomDate(); rows.push({ id:genSocId(d), projectId:proj.id, warehouseId:wh.id, postingDate:d.toISOString().slice(0,10) as any, postingTime:`${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`, cutOffDate:new Date(d.getTime()-randomInt(0,5)*86400000).toISOString().slice(0,10) as any, cutOffTime:`${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`, notes: Math.random()>0.5? `Count dummy ${randomSuffix(6)}`:null, status:pick(["DRAFT","POSTED","CANCELED"] as const), createdBy:adminId, createdAt:d, updatedAt:new Date(d.getTime()+randomInt(0,3600)*1000) });}
      await db.insert(opnameCounts).values(rows as any).onConflictDoNothing();
      console.log(`  opname_counts ${off+cnt}/${needOc}`);
    }
  }
  const allCounts=await db.select().from(opnameCounts);

  // count_details
  const curOcd=Number((await db.execute(sql`SELECT count(*)::int n FROM opname_count_details`) as any).rows[0].n);
  const needOcd=TARGET-curOcd;
  if(needOcd>0){
    console.log(`\n[opname_count_details] need ${needOcd}`);
    for(let off=0; off<needOcd; off+=CHUNK){
      const cnt=Math.min(CHUNK, needOcd-off);
      const rows:any[]=[];
      for(let i=0;i<cnt;i++){ const oc=pick(allCounts); const d=randomDate(); rows.push({ id:genId("ocd",d), countId:(oc as any).id, itemId:pick(its).id, qty:String(randomInt(1,200)), batch:`LOT-${randomSuffix(4)}`, uomId:null, warehouseId:(oc as any).warehouseId, createdAt:d });}
      await db.insert(opnameCountDetails).values(rows as any).onConflictDoNothing();
      console.log(`  opname_count_details ${off+cnt}/${needOcd}`);
    }
  }
}

async function main(){
  console.log(`=== Continue fast 100k: stock_balances, stock_batches, opname ===`);
  await seedStockBalancesFast();
  await seedStockBatchesFast();
  await seedOpnameFast();
  console.log("\n=== Final counts ===");
  for(const t of ["branches","warehouses","users","suppliers","customers","batches","purchase_orders","sales_orders","goods_receipts","deliveries","stock_movements","stock_ledger","stock_balances","stock_batches","opname_projects","opname_warehouses","opname_scans","opname_scan_details","opname_counts","opname_count_details"]){
    const r=await db.execute(sql.raw(`SELECT count(*)::int n FROM ${t}`)) as any;
    const n=r.rows[0].n;
    console.log(`  ${t}: ${n.toLocaleString("id-ID")}`);
  }
}
main().catch(e=>{console.error(e); process.exitCode=1}).finally(async()=>{await pool.end()});
