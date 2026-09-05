// @ts-nocheck
// Seed 1000 data dummy di SEMUA module dengan tanggal & waktu bervariasi
// Jalankan: npm run db:seed-all-1000  (atau COUNT=1000 npm run db:seed-all-1000)
// Default COUNT = 1000 per module utama
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  batches,
  branches,
  customers,
  goodsReceiptLines,
  goodsReceipts,
  itemGroups,
  items,
  locations,
  movementTypes,
  opnameCountDetails,
  opnameCounts,
  opnameProjects,
  opnameScanDetails,
  opnameScans,
  opnameWarehouses,
  purchaseOrderLines,
  purchaseOrders,
  salesOrderLines,
  salesOrders,
  stockBalances,
  stockBatches,
  stockLedger,
  stockMovementDetails,
  stockMovements,
  suppliers,
  uom,
  users,
  warehouses,
} from "./schema";
import { mmyyOf, yymmOf } from "../lib/id";

const COUNT = Number(process.env.COUNT ?? 1000);
const CHUNK = Number(process.env.CHUNK ?? 500);

// Rentang tanggal dummy: 2 tahun kebelakang s/d sekarang, sebaran acak per jam/menit/detik
const START_DATE = new Date("2023-01-01T00:00:00Z");
const END_DATE = new Date(); // now

function randomDate(): Date {
  const t = START_DATE.getTime() + Math.random() * (END_DATE.getTime() - START_DATE.getTime());
  const d = new Date(t);
  // acak detik juga
  d.setMilliseconds(Math.floor(Math.random() * 1000));
  return d;
}
function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomSuffix(len = 4) {
  return Math.random().toString(36).slice(2, 2 + len).toUpperCase();
}
const counters = new Map<string, number>();
function genId(prefix: string, date: Date = new Date()): string {
  const key = `${prefix}-${yymmOf(date)}`;
  const n = (counters.get(key) ?? randomInt(1000, 5000)) + 1;
  counters.set(key, n);
  // 6 digit agar muat 1000 per bulan tanpa tabrakan
  return `${key}-${String(n).padStart(6, "0")}-${randomSuffix(3)}`;
}
function genSocId(date: Date): string {
  const key = `SOC-${mmyyOf(date)}`;
  const n = (counters.get(key) ?? randomInt(1000, 5000)) + 1;
  counters.set(key, n);
  return `${key}-${String(n).padStart(6, "0")}-${randomSuffix(2)}`;
}

const CITIES = ["Jakarta","Surabaya","Bandung","Medan","Semarang","Yogyakarta","Makassar","Palembang","Bekasi","Tangerang","Depok","Bogor","Malang","Batam","Pekanbaru","Balikpapan","Manado","Denpasar","Samarinda","Pontianak"];
const FIRST = ["Budi","Siti","Agus","Rina","Joko","Dewi","Andi","Lina","Eko","Maya","Hendra","Putri","Fajar","Nina","Rudi","Sari","Dian","Bayu","Tina","Yudi","Wati","Slamet","Ani","Bambang"];
const LAST = ["Santoso","Rahayu","Pratama","Wijaya","Kurniawan","Saputra","Gunawan","Susanto","Hartono","Setiawan","Permana","Utami","Nugroho","Hidayat","Lestari","Anggraini","Purnama","Siregar","Nasution","Halim"];
const COMPANY_SUFFIX = ["Makmur","Jaya","Abadi","Sentosa","Sejahtera","Mandiri","Prima","Utama","Perkasa","Nusantara","Global","Mitra","Sukses","Berkat","Anugerah"];
const PRODUCT_ADJ = ["Premium","Super","Pro","Max","Ultra","Eco","Lite","Plus","Gold","Silver","Fresh","Organic","Classic","Deluxe","Prime"];
const PRODUCT_NOUN = ["Beras","Gula","Minyak","Tepung","Kopi","Teh","Susu","Kecap","Sarden","Mie","Biskuit","Sabun","Shampo","Detergen","Tisu","Baut","Kabel","Lampu","Cat","Semen","Keramik","Pipa","Obat","Vitamin"];

function randomName() { return `${pick(FIRST)} ${pick(LAST)}`; }
function randomCompany(prefix: string) { return `${prefix} ${pick(FIRST)} ${pick(COMPANY_SUFFIX)}`; }
function randomPhone() { return `08${randomInt(11,99)}-${randomInt(1000,9999)}-${randomInt(1000,9999)}`; }
function randomEmail(name: string) { return `${name.toLowerCase().replace(/\s+/g,".")}${randomInt(1,9999)}@example.com`; }
function randomAddress() { return `Jl. ${pick(PRODUCT_NOUN)} No.${randomInt(1,200)}, ${pick(CITIES)}`; }

async function chunkInsert<T extends Record<string, unknown>>(table: unknown, rows: T[], chunk = CHUNK) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    // @ts-expect-error generic
    await db.insert(table).values(slice as never).onConflictDoNothing();
    const pct = Math.min(100, Math.round(((i + slice.length) / rows.length) * 100));
    if (slice.length) console.log(`    chunk ${i + slice.length}/${rows.length} (${pct}%)`);
  }
}

async function ensureMasters() {
  console.log(`\n=== Seed ${COUNT} dummy per module — rentang ${START_DATE.toISOString().slice(0,10)} s/d ${END_DATE.toISOString().slice(0,10)} (waktu acak) ===`);

  const [userRows] = await Promise.all([
    db.select({ id: users.id }).from(users).limit(1),
  ]);
  let adminId = (userRows as unknown as { id: string }[])?.[0]?.id ?? null;
  if (!adminId) {
    const allUsers = await db.select().from(users).limit(1);
    adminId = allUsers[0]?.id ?? null;
  }
  const whs0 = await db.select().from(warehouses);
  const branches0 = await db.select().from(branches);
  const ig0 = await db.select().from(itemGroups);
  const uom0 = await db.select().from(uom);
  const items0 = await db.select().from(items);
  console.log(`Existing: branches=${branches0.length}, warehouses=${whs0.length}, itemGroups=${ig0.length}, uom=${uom0.length}, items=${items0.length}`);

  // ----- Branches: tambah sampai COUNT (1000) -----
  const needBranches = Math.max(0, COUNT - branches0.length);
  if (needBranches > 0) {
    console.log(`\n[branches] menambah ${needBranches}...`);
    const rows = Array.from({ length: needBranches }, () => {
      const d = randomDate();
      const city = pick(CITIES);
      const code = `BR-${city.slice(0,3).toUpperCase()}-${randomSuffix(4)}-${randomInt(10,99)}`;
      return {
        id: genId("br", d),
        code,
        name: `Branch ${city} ${randomSuffix(3)}`,
        city,
        address: randomAddress(),
        isActive: Math.random() > 0.08,
        createdAt: d,
      };
    });
    await chunkInsert(branches, rows as never);
  }

  const allBranches = await db.select().from(branches);

  // ----- Warehouses: sampai COUNT -----
  const whs1 = await db.select().from(warehouses);
  const needWh = Math.max(0, COUNT - whs1.length);
  if (needWh > 0) {
    console.log(`\n[warehouses] menambah ${needWh}...`);
    const rows = Array.from({ length: needWh }, () => {
      const d = randomDate();
      const br = pick(allBranches);
      return {
        id: genId("wh", d),
        branchId: br.id,
        code: `WH-${br.code.slice(0,3)}-${randomSuffix(4)}-${randomInt(10,99)}`,
        name: `Gudang ${pick(["Pusat","Bahan Baku","Barang Jadi","Transit","Sparepart","Retur"])} ${pick(CITIES)} ${randomSuffix(2)}`,
        description: `Gudang dummy ${randomSuffix(6)}`,
        isActive: Math.random() > 0.05,
        createdAt: d,
      };
    });
    await chunkInsert(warehouses, rows as never);
  }
  const allWarehouses = await db.select().from(warehouses);

  // ----- Locations: 1000 -----
  const loc0 = await db.select().from(locations);
  const needLoc = Math.max(0, COUNT - loc0.length);
  if (needLoc > 0) {
    console.log(`\n[locations] menambah ${needLoc}...`);
    const rows = Array.from({ length: needLoc }, () => {
      const d = randomDate();
      const wh = pick(allWarehouses);
      const zone = pick(["A","B","C","D","E","F"]);
      const num = String(randomInt(1, 99)).padStart(2, "0");
      return {
        id: genId("loc", d),
        warehouseId: wh.id,
        code: `${zone}${num}-${randomSuffix(2)}`,
        name: `Rak ${zone}${num} ${pick(["Sembako","Minuman","Kemasan","Sparepart","Elektronik"])}`,
        description: `Lokasi ${zone}${num}`,
        isActive: Math.random() > 0.05,
        createdAt: d,
      };
    });
    await chunkInsert(locations, rows as never);
  }
  const allLocations = await db.select().from(locations);

  // ----- Item Groups: tambah sampai 50 (atau COUNT jika diminta) -----
  const targetIG = Math.min(COUNT, 100);
  const needIG = Math.max(0, targetIG - ig0.length);
  if (needIG > 0) {
    console.log(`\n[item_groups] menambah ${needIG}...`);
    const rows = Array.from({ length: needIG }, (_, i) => {
      const d = randomDate();
      return {
        id: genId("igr", d),
        code: `IG${String(ig0.length + i + 1).padStart(3,"0")}-${randomSuffix(2)}`,
        name: `${pick(["Bahan","Kemasan","Barang","Sparepart","Chemical","Elektronik"])} ${pick(PRODUCT_NOUN)} ${randomSuffix(2)}`,
        isActive: true,
        createdAt: d,
        updatedAt: d,
      };
    });
    await chunkInsert(itemGroups, rows as never);
  }
  const allGroups = await db.select().from(itemGroups);

  // ----- UOM: tambah sampai 50 -----
  const targetUom = Math.min(COUNT, 50);
  const needUom = Math.max(0, targetUom - uom0.length);
  if (needUom > 0) {
    console.log(`\n[uom] menambah ${needUom}...`);
    const rows = Array.from({ length: needUom }, () => {
      const d = randomDate();
      const code = `U${randomSuffix(3)}${randomInt(10,99)}`;
      return {
        id: genId("uom", d),
        code,
        name: `${code} - ${pick(["Pieces","Kilogram","Liter","Box","Karton","Rol","Unit","Set","Pack"])}`,
        createdBy: adminId,
        createdAt: d,
        updatedAt: d,
      };
    });
    await chunkInsert(uom, rows as never);
  }
  const allUom = await db.select().from(uom);

  // ----- Items: 1000 -----
  const needItems = Math.max(0, COUNT - items0.length);
  if (needItems > 0) {
    console.log(`\n[items] menambah ${needItems}...`);
    const rows = Array.from({ length: needItems }, (_, i) => {
      const d = randomDate();
      const grp = pick(allGroups);
      const um = pick(allUom);
      const name = `${pick(PRODUCT_ADJ)} ${pick(PRODUCT_NOUN)} ${randomInt(100,999)} ${randomSuffix(2)}`;
      const seq = (items0.length + i + 1);
      return {
        id: genId("itm", d),
        code: `${String(seq).padStart(5,"0")}-${randomSuffix(2)}`,
        name,
        itemGroupId: grp.id,
        hue: randomInt(0, 360),
        uomId: um.id,
        alternativeCode: `ALT-${randomSuffix(6)}`,
        uomQty: String(randomInt(1, 100)),
        description: `Item dummy ${name}`,
        standardCost: String(randomInt(1000, 250000)),
        valuationRate: String(randomInt(1000, 250000)),
        isActive: Math.random() > 0.07,
        createdAt: d,
      };
    });
    await chunkInsert(items, rows as never);
  }
  const allItems = await db.select().from(items);
  const allUom2 = allUom;

  return { adminId, allBranches, allWarehouses: await db.select().from(warehouses), allLocations: await db.select().from(locations), allGroups: await db.select().from(itemGroups), allUom: allUom2, allItems: await db.select().from(items) };
}

async function seedSuppliersCustomers(allBranches: { id: string }[]) {
  // Suppliers 1000
  const sup0 = await db.select().from(suppliers);
  const needSup = Math.max(0, COUNT - sup0.length);
  if (needSup > 0) {
    console.log(`\n[suppliers] menambah ${needSup}...`);
    const existingCodes = new Set(sup0.map(s=>s.code));
    const rows: typeof suppliers.$inferInsert[] = [];
    for (let i=0;i<needSup;i++) {
      const d = randomDate();
      let code: string;
      do { code = `SUP-${randomSuffix(5)}-${String(randomInt(1,9999)).padStart(4,"0")}`; } while (existingCodes.has(code));
      existingCodes.add(code);
      const name = randomCompany("PT");
      rows.push({
        id: genId("sup", d),
        code,
        name,
        contactPerson: randomName(),
        phone: randomPhone(),
        email: randomEmail(name),
        address: randomAddress(),
        taxId: `${randomInt(10,99)}.${String(randomInt(100,999)).padStart(3,"0")}.${String(randomInt(100,999)).padStart(3,"0")}.${randomInt(1,9)}-${String(randomInt(100,999)).padStart(3,"0")}.${String(randomInt(100,999)).padStart(3,"0")}`,
        isActive: Math.random() > 0.06,
        branchId: pick(allBranches).id,
        createdAt: d,
        updatedAt: d,
      });
    }
    await chunkInsert(suppliers, rows as never);
  }

  // Customers 1000
  const cust0 = await db.select().from(customers);
  const needCust = Math.max(0, COUNT - cust0.length);
  if (needCust > 0) {
    console.log(`\n[customers] menambah ${needCust}...`);
    const existingCodes = new Set(cust0.map(s=>s.code));
    const rows: typeof customers.$inferInsert[] = [];
    for (let i=0;i<needCust;i++) {
      const d = randomDate();
      let code: string;
      do { code = `CUS-${randomSuffix(5)}-${String(randomInt(1,9999)).padStart(4,"0")}`; } while (existingCodes.has(code));
      existingCodes.add(code);
      const name = randomCompany("CV");
      rows.push({
        id: genId("cus", d),
        code,
        name,
        contactPerson: randomName(),
        phone: randomPhone(),
        email: randomEmail(name),
        address: randomAddress(),
        taxId: `${randomInt(10,99)}.${String(randomInt(100,999)).padStart(3,"0")}.${String(randomInt(100,999)).padStart(3,"0")}.${randomInt(1,9)}-${String(randomInt(100,999)).padStart(3,"0")}.${String(randomInt(100,999)).padStart(3,"0")}`,
        isActive: Math.random() > 0.06,
        branchId: pick(allBranches).id,
        createdAt: d,
        updatedAt: d,
      });
    }
    await chunkInsert(customers, rows as never);
  }
}

async function seedBatches(allItems: { id:string; code:string }[]) {
  const batch0 = await db.select().from(batches);
  const need = Math.max(0, COUNT - batch0.length);
  if (need > 0) {
    console.log(`\n[batches] menambah ${need}...`);
    const existing = new Set(batch0.map(b=> `${b.itemId}|${b.batchNumber}`));
    const rows: typeof batches.$inferInsert[] = [];
    let attempts = 0;
    while (rows.length < need && attempts < need*3) {
      attempts++;
      const it = pick(allItems);
      const d = randomDate();
      const lot = `LOT-${randomSuffix(4)}-${String(randomInt(1,9999)).padStart(4,"0")}`;
      const key = `${it.id}|${lot}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const prodDate = new Date(d.getTime() - randomInt(0, 400)*86_400_000);
      const expiry = new Date(prodDate.getTime() + randomInt(90, 720)*86_400_000);
      rows.push({
        id: genId("bat", d),
        itemId: it.id,
        batchNumber: lot,
        status: Math.random() > 0.12 ? "ACTIVE" : "EMPTY",
        productionDate: prodDate.toISOString().slice(0,10) as unknown as string as never,
        expiryDate: expiry.toISOString().slice(0,10) as unknown as string as never,
        shift: pick(["1","2","3","A","B","C"]),
        meta: { dummy: true, seq: rows.length+1 },
        notes: Math.random() > 0.5 ? `Batch dummy ${lot}` : null,
        createdBy: null,
        createdAt: d,
        updatedAt: d,
      });
    }
    await chunkInsert(batches, rows as never);
  }
}

async function seedPurchaseOrders(ctx: { adminId: string | null; allWarehouses: {id:string}[]; allItems:{id:string}[]; allUom:{id:string}[]; allBranches:{id:string}[] }) {
  const po0 = await db.select().from(purchaseOrders);
  const need = Math.max(0, COUNT - po0.length);
  if (need === 0) { console.log("\n[purchase_orders] sudah >= COUNT"); return; }
  console.log(`\n[purchase_orders] menambah ${need}...`);
  const sups = await db.select().from(suppliers);
  const existingNos = new Set(po0.map(p=>p.poNo));
  const poRows: typeof purchaseOrders.$inferInsert[] = [];
  const lineRows: typeof purchaseOrderLines.$inferInsert[] = [];
  for (let i=0;i<need;i++) {
    const d = randomDate();
    const orderDate = d.toISOString().slice(0,10) as unknown as string;
    const expectedDate = new Date(d.getTime()+randomInt(1,30)*86_400_000).toISOString().slice(0,10) as unknown as string;
    // unique PO No: PO-YYMM-XXXX-RND
    let poNo: string;
    do { poNo = `PO-${yymmOf(d)}-${String(randomInt(1,9999)).padStart(4,"0")}-${randomSuffix(3)}`; } while (existingNos.has(poNo));
    existingNos.add(poNo);
    const id = genId("po", d);
    poRows.push({
      id,
      poNo,
      supplierId: pick(sups).id,
      warehouseId: pick(ctx.allWarehouses).id,
      orderDate: orderDate as never,
      expectedDate: expectedDate as never,
      status: pick(["DRAFT","POSTED","CANCELED"] as const),
      notes: Math.random()>0.6 ? `PO dummy ${poNo}` : null,
      createdBy: ctx.adminId,
      branchId: pick(ctx.allBranches).id,
      createdAt: d,
      updatedAt: new Date(d.getTime()+randomInt(0, 3600)*1000),
    });
    const lineCount = randomInt(1,5);
    for (let l=0;l<lineCount;l++) {
      const ld = new Date(d.getTime()+randomInt(0, 3600)*1000);
      lineRows.push({
        id: genId("pol", ld),
        purchaseOrderId: id,
        itemId: pick(ctx.allItems).id,
        uomId: pick(ctx.allUom).id,
        qty: String(randomInt(1,500)),
        unitPrice: String(randomInt(1000, 100000)),
        batchNumber: Math.random()>0.5 ? `LOT-${randomSuffix(4)}` : null,
        note: null,
        deliveryDate: expectedDate as never,
      });
    }
  }
  await chunkInsert(purchaseOrders, poRows as never);
  await chunkInsert(purchaseOrderLines, lineRows as never);
  console.log(`  -> lines: ${lineRows.length}`);
}

async function seedSalesOrders(ctx: { adminId: string | null; allWarehouses: {id:string}[]; allItems:{id:string}[]; allUom:{id:string}[]; allBranches:{id:string}[] }) {
  const so0 = await db.select().from(salesOrders);
  const need = Math.max(0, COUNT - so0.length);
  if (need === 0) { console.log("\n[sales_orders] sudah >= COUNT"); return; }
  console.log(`\n[sales_orders] menambah ${need}...`);
  const custs = await db.select().from(customers);
  if (!custs.length) { console.log("  skip — customers kosong"); return; }
  const existingNos = new Set(so0.map(s=>s.soNo));
  const soRows: typeof salesOrders.$inferInsert[] = [];
  const lineRows: typeof salesOrderLines.$inferInsert[] = [];
  for (let i=0;i<need;i++) {
    const d = randomDate();
    const orderDate = d.toISOString().slice(0,10) as unknown as string;
    const expectedDate = new Date(d.getTime()+randomInt(1,20)*86_400_000).toISOString().slice(0,10) as unknown as string;
    let soNo: string;
    do { soNo = `SO-${yymmOf(d)}-${String(randomInt(1,9999)).padStart(4,"0")}-${randomSuffix(3)}`; } while (existingNos.has(soNo));
    existingNos.add(soNo);
    const id = genId("so", d);
    soRows.push({
      id,
      soNo,
      customerId: pick(custs).id,
      warehouseId: pick(ctx.allWarehouses).id,
      orderDate: orderDate as never,
      expectedDate: expectedDate as never,
      status: pick(["DRAFT","POSTED","CANCELED"] as const),
      notes: Math.random()>0.6 ? `SO dummy ${soNo}` : null,
      createdBy: ctx.adminId,
      branchId: pick(ctx.allBranches).id,
      createdAt: d,
      updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
    });
    const lineCount = randomInt(1,5);
    for (let l=0;l<lineCount;l++) {
      const ld = new Date(d.getTime()+randomInt(0,3600)*1000);
      lineRows.push({
        id: genId("sol", ld),
        salesOrderId: id,
        itemId: pick(ctx.allItems).id,
        uomId: pick(ctx.allUom).id,
        qty: String(randomInt(1,500)),
        unitPrice: String(randomInt(1000, 150000)),
        batchNumber: Math.random()>0.5 ? `LOT-${randomSuffix(4)}` : null,
        note: null,
      });
    }
  }
  await chunkInsert(salesOrders, soRows as never);
  await chunkInsert(salesOrderLines, lineRows as never);
  console.log(`  -> lines: ${lineRows.length}`);
}

async function seedGoodsReceipts(ctx: { adminId: string | null; allWarehouses: {id:string}[]; allItems:{id:string}[]; allUom:{id:string}[]; allBranches:{id:string}[] }) {
  const gr0 = await db.select().from(goodsReceipts);
  const need = Math.max(0, COUNT - gr0.length);
  if (need === 0) { console.log("\n[goods_receipts] sudah >= COUNT"); return; }
  console.log(`\n[goods_receipts] menambah ${need}...`);
  const pos = await db.select().from(purchaseOrders);
  const sups = await db.select().from(suppliers);
  if (!pos.length) { console.log("  skip — PO kosong"); return; }
  const existingNos = new Set(gr0.map(g=>g.grNo));
  const grRows: typeof goodsReceipts.$inferInsert[] = [];
  const lineRows: typeof goodsReceiptLines.$inferInsert[] = [];
  for (let i=0;i<need;i++) {
    const d = randomDate();
    const dStr = d.toISOString().slice(0,10) as unknown as string;
    let grNo: string;
    do { grNo = `GR-${yymmOf(d)}-${String(randomInt(1,9999)).padStart(4,"0")}-${randomSuffix(3)}`; } while (existingNos.has(grNo));
    existingNos.add(grNo);
    const po = pick(pos);
    const id = genId("gr", d);
    grRows.push({
      id,
      grNo,
      purchaseOrderId: po.id,
      supplierId: pick(sups).id,
      warehouseId: pick(ctx.allWarehouses).id,
      receiptDate: dStr as never,
      status: pick(["DRAFT","POSTED","CANCELED"] as const),
      notes: Math.random()>0.6 ? `GR dummy ${grNo}` : null,
      createdBy: ctx.adminId,
      branchId: pick(ctx.allBranches).id,
      createdAt: d,
      updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
    });
    const lineCount = randomInt(1,4);
    for (let l=0;l<lineCount;l++) {
      const ld = new Date(d.getTime()+randomInt(0,3600)*1000);
      lineRows.push({
        id: genId("grl", ld),
        goodsReceiptId: id,
        itemId: pick(ctx.allItems).id,
        uomId: pick(ctx.allUom).id,
        qty: String(randomInt(1,300)),
        unitPrice: String(randomInt(1000, 100000)),
        batchNumber: Math.random()>0.5 ? `LOT-${randomSuffix(4)}` : null,
        note: null,
      });
    }
  }
  await chunkInsert(goodsReceipts, grRows as never);
  await chunkInsert(goodsReceiptLines, lineRows as never);
  console.log(`  -> lines: ${lineRows.length}`);
}

async function seedStockMovements(ctx:{ allItems:{id:string,uomId:string|null}[]; allWarehouses:{id:string}[]; allUom:{id:string}[]; adminId:string|null }) {
  const mv0 = await db.select().from(stockMovements);
  const need = Math.max(0, COUNT - mv0.length);
  if (need === 0) { console.log("\n[stock_movements] sudah >= COUNT"); return; }
  console.log(`\n[stock_movements + details + ledger] menambah ${need}...`);
  const types = await db.select().from(movementTypes);
  if (!types.length) throw new Error("movement_types kosong");
  const batchesAll = await db.select().from(batches);
  const mvRows: typeof stockMovements.$inferInsert[] = [];
  const dtRows: typeof stockMovementDetails.$inferInsert[] = [];
  const ledgerRows: typeof stockLedger.$inferInsert[] = [];
  for (let i=0;i<need;i++) {
    const d = randomDate();
    const hour = d; // pakai d yang sudah acak jam/menit/detik
    const type = pick(types);
    const id = genId("smv", d);
    const qty = String(randomInt(1, 200));
    const item = pick(ctx.allItems);
    const fromWh = Math.random()>0.3 ? pick(ctx.allWarehouses).id : null;
    const toWhCandidate = pick(ctx.allWarehouses).id;
    const toWh = fromWh === toWhCandidate ? pick(ctx.allWarehouses).id : toWhCandidate;
    const batchId = batchesAll.length && Math.random()>0.3 ? pick(batchesAll).id : null;
    // Movement header
    mvRows.push({
      id,
      typeId: type.id,
      movementDate: hour,
      status: pick(["DRAFT","POSTED","CANCELED"]),
      referenceType: pick([type.code, "MANUAL", "ADJUSTMENT", null]),
      referenceId: null,
      description: `Mov dummy ${type.code} ${randomSuffix(4)}`,
      createdBy: ctx.adminId,
      createdAt: d,
      updatedAt: new Date(d.getTime()+randomInt(0,7200)*1000),
    });
    const detailId = genId("smd", d);
    dtRows.push({
      id: detailId,
      movementId: id,
      itemId: item.id,
      fromWarehouseId: fromWh,
      toWarehouseId: Math.random()>0.2 ? toWh : null,
      qty,
      uomId: item.uomId ?? pick(ctx.allUom).id,
      batchId,
      barcode: `BC${randomSuffix(6)}${String(randomInt(1000,9999))}`,
      serialNumber: Math.random()>0.5 ? `SN-${randomSuffix(5)}` : null,
      incomingRate: String(randomInt(1000, 50000)),
      createdAt: d,
    });
    // ledger 1-2 baris per movement: kalau transfer tulis in+out
    const whForLedger = toWh ?? fromWh ?? pick(ctx.allWarehouses).id;
    ledgerRows.push({
      id: genId("sld", d),
      transactionId: id,
      transactionType: type.code,
      transactionDate: hour,
      itemId: item.id,
      warehouseId: whForLedger,
      locationId: null,
      qtyIn: fromWh ? "0" : qty,
      qtyOut: fromWh ? qty : "0",
      qtyBalance: String(randomInt(0, 10000)),
      valuationRate: String(randomInt(1000, 50000)),
      stockValue: String(randomInt(10000, 5000000)),
      referenceType: type.code,
      referenceId: id,
      batchId,
      createdBy: ctx.adminId,
      createdAt: d,
    });
  }
  await chunkInsert(stockMovements, mvRows as never);
  await chunkInsert(stockMovementDetails, dtRows as never);
  await chunkInsert(stockLedger, ledgerRows as never);
}

async function seedStockBalances(allWarehouses:{id:string}[], allItems:{id:string}[]) {
  const bal0 = await db.select().from(stockBalances);
  const need = Math.max(0, COUNT - bal0.length);
  if (need === 0) { console.log("\n[stock_balances] sudah >= COUNT"); return; }
  console.log(`\n[stock_balances] menambah ${need}...`);
  const existingPairs = new Set(bal0.map(b=> `${b.warehouseId}|${b.itemId}`));
  const rows: typeof stockBalances.$inferInsert[] = [];
  let tries = 0;
  while (rows.length < need && tries < need*5) {
    tries++;
    const wh = pick(allWarehouses);
    const it = pick(allItems);
    const key = `${wh.id}|${it.id}`;
    if (existingPairs.has(key)) continue;
    existingPairs.add(key);
    const d = randomDate();
    const opening = randomInt(0, 1000);
    const inQty = randomInt(0, 500);
    const outQty = randomInt(0, 400);
    rows.push({
      id: genId("stb", d),
      balanceDate: d.toISOString().slice(0,10) as unknown as never,
      warehouseId: wh.id,
      itemId: it.id,
      openingQty: opening,
      inQty,
      outQty,
      closingQty: opening + inQty - outQty,
      createdAt: d,
      updatedAt: d,
    });
  }
  if (rows.length < need) console.warn(`  hanya dapat ${rows.length}/${need} pasangan unik (wh*item = ${allWarehouses.length*allItems.length})`);
  await chunkInsert(stockBalances, rows as never);

  // stock_batches mirroring
  const needB = Math.max(0, COUNT - (await db.select().from(stockBatches).then(r=>r.length)));
  if (needB>0) {
    console.log(`\n[stock_batches] menambah ${needB}...`);
    const batchesAll = await db.select().from(batches);
    if (batchesAll.length) {
      const sbRows = Array.from({length: Math.min(needB, batchesAll.length)}, () => {
        const b = pick(batchesAll);
        const wh = pick(allWarehouses);
        const d = randomDate();
        return { id: genId("stbch", d), batchId: b.id, warehouseId: wh.id, qty: String(randomInt(0,500)), updatedAt: d };
      });
      // tambah sisa jika batch kurang
      while (sbRows.length < needB) {
        const b = pick(batchesAll);
        const wh = pick(allWarehouses);
        const d = randomDate();
        sbRows.push({ id: genId("stbch", d), batchId: b.id, warehouseId: wh.id, qty: String(randomInt(0,500)), updatedAt: d });
      }
      // deduplicate by batch+wh
      const seen = new Set<string>();
      const uniq = sbRows.filter(r=>{ const k=`${r.batchId}|${r.warehouseId}`; if(seen.has(k)) return false; seen.add(k); return true; });
      await chunkInsert(stockBatches, uniq.slice(0, needB) as never);
    }
  }
}

async function seedOpname(ctx:{ allWarehouses:{id:string}[]; allItems:{id:string}[]; allLocations:{id:string; warehouseId:string}[]; adminId:string|null }) {
  // Projects 1000
  const proj0 = await db.select().from(opnameProjects);
  const needProj = Math.max(0, COUNT - proj0.length);
  if (needProj>0) {
    console.log(`\n[opname_projects] menambah ${needProj}...`);
    const rows: typeof opnameProjects.$inferInsert[] = [];
    for (let i=0;i<needProj;i++) {
      const d = randomDate();
      const opnameDate = new Date(d.getTime()+randomInt(1,14)*86_400_000).toISOString().slice(0,10) as never;
      const cutOff = new Date(d.getTime()+randomInt(-2,5)*86_400_000).toISOString().slice(0,10) as never;
      rows.push({
        id: genId("opj", d),
        name: `${pick(["Opname","Stocktake","Audit"])} ${pick(CITIES)} ${randomSuffix(3)} ${d.getFullYear()}`,
        mode: pick(["COMPARE","SCRATCH"] as const),
        status: pick(["DRAFT","IN_PROGRESS","APPROVED","CANCELLED"] as const),
        createdAt: d,
        updatedAt: new Date(d.getTime()+randomInt(0, 48*3600)*1000),
        deadline: new Date(d.getTime()+randomInt(5,30)*86_400_000),
        opnameDate: opnameDate as never,
        cutOffDate: cutOff as never,
        cutOffTime: `${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`,
        createdBy: ctx.adminId,
        description: `Project dummy ${randomSuffix(6)}`,
      });
    }
    await chunkInsert(opnameProjects, rows as never);
  }
  const allProjects = await db.select().from(opnameProjects);

  // opname_warehouses 1000
  const ow0 = await db.select().from(opnameWarehouses);
  const needOw = Math.max(0, COUNT - ow0.length);
  if (needOw>0) {
    console.log(`\n[opname_warehouses] menambah ${needOw}...`);
    const existing = new Set(ow0.map(r=> `${r.opnameId}|${r.warehouseId}`));
    const rows: typeof opnameWarehouses.$inferInsert[] = [];
    let tries=0;
    while (rows.length < needOw && tries < needOw*4) {
      tries++;
      const proj = pick(allProjects);
      const wh = pick(ctx.allWarehouses);
      const key = `${proj.id}|${wh.id}`;
      if (existing.has(key)) continue;
      existing.add(key);
      const d = randomDate();
      const status = pick(["PENDING","IN_PROGRESS","COMPLETED","CANCELLED"] as const);
      rows.push({
        id: genId("opw", d),
        opnameId: proj.id,
        warehouseId: wh.id,
        status,
        startedAt: status!=="PENDING" ? new Date(d.getTime()+randomInt(0,3600)*1000) : null,
        completedAt: status==="COMPLETED" ? new Date(d.getTime()+randomInt(3600, 86400)*1000) : null,
        createdAt: d,
      });
    }
    await chunkInsert(opnameWarehouses, rows as never);
  }

  // opname_scans 1000
  const scans0 = await db.select().from(opnameScans);
  const needScans = Math.max(0, COUNT - scans0.length);
  let allScans = scans0;
  if (needScans>0) {
    console.log(`\n[opname_scans] menambah ${needScans}...`);
    const rows: typeof opnameScans.$inferInsert[] = [];
    for (let i=0;i<needScans;i++) {
      const proj = pick(allProjects);
      const d = randomDate();
      const status = pick(["DRAFT","POSTED","CANCELED"] as const);
      rows.push({
        id: genId("ops", d),
        opnameId: proj.id,
        scannedBy: ctx.adminId,
        status,
        startedAt: d,
        completedAt: status==="POSTED" ? new Date(d.getTime()+randomInt(600, 7200)*1000) : status==="CANCELED" ? new Date(d.getTime()+randomInt(600,3600)*1000) : null,
        createdAt: d,
        updatedAt: new Date(d.getTime()+randomInt(0,7200)*1000),
      });
    }
    await chunkInsert(opnameScans, rows as never);
    allScans = await db.select().from(opnameScans);
  }

  // opname_scan_details 1000
  const sd0 = await db.select().from(opnameScanDetails);
  const needSd = Math.max(0, COUNT - sd0.length);
  if (needSd>0) {
    console.log(`\n[opname_scan_details] menambah ${needSd}...`);
    const rows: typeof opnameScanDetails.$inferInsert[] = [];
    for (let i=0;i<needSd;i++) {
      const scan = pick(allScans);
      const d = randomDate();
      const it = pick(ctx.allItems);
      const wh = pick(ctx.allWarehouses);
      const loc = ctx.allLocations.find(l=>l.warehouseId===wh.id) ?? pick(ctx.allLocations);
      rows.push({
        id: genId("osd", d),
        scanId: scan.id,
        opnameId: scan.opnameId,
        warehouseId: wh.id,
        locationId: loc.id,
        itemId: it.id,
        barcode: `11${String(randomInt(10000000, 99999999))}-${randomSuffix(2)}`,
        batch: `LOT-${randomSuffix(4)}`,
        batchId: null,
        parsed: { ITEM_CODE: it.id.slice(0,5), SEQUENCE: String(randomInt(1,9999)) },
        quantity: randomInt(1, 50),
        qtyMode: pick(["AUTO","MANUAL"] as const),
        source: pick(["SCANNER","CAMERA","MANUAL"] as const),
        scannedAt: d,
      });
    }
    await chunkInsert(opnameScanDetails, rows as never);
  }

  // opname_counts 1000 (SOC ids)
  const oc0 = await db.select().from(opnameCounts);
  const needOc = Math.max(0, COUNT - oc0.length);
  let allCounts = oc0;
  if (needOc>0) {
    console.log(`\n[opname_counts] menambah ${needOc}...`);
    const rows: typeof opnameCounts.$inferInsert[] = [];
    for (let i=0;i<needOc;i++) {
      const proj = pick(allProjects);
      const wh = pick(ctx.allWarehouses);
      const d = randomDate();
      const postingDate = d.toISOString().slice(0,10) as never;
      rows.push({
        id: genSocId(d),
        projectId: proj.id,
        warehouseId: wh.id,
        postingDate: postingDate as never,
        postingTime: `${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`,
        cutOffDate: new Date(d.getTime()-randomInt(0,5)*86_400_000).toISOString().slice(0,10) as never,
        cutOffTime: `${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`,
        notes: Math.random()>0.5 ? `Count dummy ${randomSuffix(6)}` : null,
        status: pick(["DRAFT","POSTED","CANCELED"] as const),
        createdBy: ctx.adminId,
        createdAt: d,
        updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
      });
    }
    await chunkInsert(opnameCounts, rows as never);
    allCounts = await db.select().from(opnameCounts);
  }

  // opname_count_details 1000
  const ocd0 = await db.select().from(opnameCountDetails);
  const needOcd = Math.max(0, COUNT - ocd0.length);
  if (needOcd>0) {
    console.log(`\n[opname_count_details] menambah ${needOcd}...`);
    const rows: typeof opnameCountDetails.$inferInsert[] = [];
    for (let i=0;i<needOcd;i++) {
      const oc = pick(allCounts);
      const d = randomDate();
      rows.push({
        id: genId("ocd", d),
        countId: oc.id,
        itemId: pick(ctx.allItems).id,
        qty: String(randomInt(1,200)),
        batch: `LOT-${randomSuffix(4)}`,
        uomId: null,
        warehouseId: oc.warehouseId,
        createdAt: d,
      });
    }
    await chunkInsert(opnameCountDetails, rows as never);
  }
}

async function main() {
  const masters = await ensureMasters();
  const allBranches = masters.allBranches.length ? masters.allBranches : await db.select().from(branches);
  const allWarehouses = await db.select().from(warehouses);
  const allItems = await db.select().from(items);
  const allUom = await db.select().from(uom);
  const allLocations = await db.select().from(locations);

  await seedSuppliersCustomers(allBranches as never);
  await seedBatches(allItems as never);
  // refresh for downstream
  const freshItems = await db.select().from(items);
  const freshUom = await db.select().from(uom);

  await seedPurchaseOrders({ adminId: masters.adminId, allWarehouses: allWarehouses as never, allItems: freshItems as never, allUom: freshUom as never, allBranches: allBranches as never });
  await seedSalesOrders({ adminId: masters.adminId, allWarehouses: allWarehouses as never, allItems: freshItems as never, allUom: freshUom as never, allBranches: allBranches as never });
  await seedGoodsReceipts({ adminId: masters.adminId, allWarehouses: allWarehouses as never, allItems: freshItems as never, allUom: freshUom as never, allBranches: allBranches as never });
  await seedStockMovements({ allItems: freshItems as never, allWarehouses: allWarehouses as never, allUom: freshUom as never, adminId: masters.adminId });
  await seedStockBalances(allWarehouses as never, freshItems as never);
  await seedOpname({ allWarehouses: allWarehouses as never, allItems: freshItems as never, allLocations: allLocations as never, adminId: masters.adminId });

  console.log("\n=== Ringkasan akhir ===");
  const tables = [
    "branches","warehouses","locations","item_groups","uom","items","batches",
    "suppliers","customers","purchase_orders","purchase_order_lines","sales_orders","sales_order_lines",
    "goods_receipts","goods_receipt_lines","stock_movements","stock_movement_details","stock_ledger",
    "stock_balances","stock_batches","opname_projects","opname_warehouses","opname_scans","opname_scan_details","opname_counts","opname_count_details"
  ];
  for (const t of tables) {
    try {
      const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`)) as unknown as { rows: {n:number}[] };
      const n = (r as unknown as { rows: { n:number }[] }).rows?.[0]?.n ?? (r as unknown as { n:number }[])?.[0]?.n ?? "?";
      console.log(`  ${t}: ${n}`);
    } catch (e) {
      console.log(`  ${t}: err ${(e as Error).message}`);
    }
  }

  // Sebaran tanggal per module (min/max)
  console.log("\n=== Sebaran tanggal (min/max) ===");
  const dateCols: Record<string,string> = {
    branches: "created_at", warehouses:"created_at", items:"created_at",
    suppliers:"created_at", customers:"created_at",
    purchase_orders:"created_at", sales_orders:"created_at", goods_receipts:"created_at",
    stock_movements:"created_at", stock_ledger:"created_at",
    opname_projects:"created_at", opname_scans:"created_at", opname_scan_details:"scanned_at",
    stock_balances:"created_at"
  };
  for (const [tbl, col] of Object.entries(dateCols)) {
    try {
      const r = await db.execute(sql.raw(`SELECT min(${col})::text AS mn, max(${col})::text AS mx FROM ${tbl}`)) as unknown as { rows:{mn:string,mx:string}[] };
      const row = (r as unknown as { rows:{mn:string,mx:string}[] }).rows?.[0];
      if (row) console.log(`  ${tbl}.${col}: ${row.mn?.slice(0,19)} → ${row.mx?.slice(0,19)}`);
    } catch {}
  }
}

main().catch(e=>{ console.error("Seed gagal:", e instanceof Error? e.message:e); process.exitCode=1; })
  .finally(async()=>{ await pool.end(); });
