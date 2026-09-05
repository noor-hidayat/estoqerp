// @ts-nocheck
// Seed 100rb terintegrasi — KECUALI branch, warehouse, user (preserve)
// - suppliers & customers: JAGA minimal (target 1.5k-2k, tidak jadi 100k)
// - PO, SO, GR, Delivery, Stock Movements, Stock Ledger, Stock Balances, Batches, Opname: masing-masing 100k
// Jalankan: npm run db:seed-100k  (COUNT=100000 CHUNK=1000 npm run db:seed-100k)

import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  batches,
  branches,
  customers,
  deliveries,
  deliveryLines,
  goodsReceiptLines,
  goodsReceipts,
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

const TARGET = Number(process.env.COUNT ?? 100000);
const CHUNK = Number(process.env.CHUNK ?? 1000);
// Supplier/customer di-jaga kecil
const SUP_CUS_TARGET = Number(process.env.SUP_CUS_TARGET ?? 1500);

const START_DATE = new Date("2023-01-01T00:00:00Z");
const END_DATE = new Date();

function randomDate(): Date {
  const t = START_DATE.getTime() + Math.random() * (END_DATE.getTime() - START_DATE.getTime());
  const d = new Date(t);
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
  const n = (counters.get(key) ?? randomInt(1000, 9000)) + 1;
  counters.set(key, n);
  return `${key}-${String(n).padStart(6, "0")}-${randomSuffix(3)}`;
}
function genSocId(date: Date): string {
  const key = `SOC-${mmyyOf(date)}`;
  const n = (counters.get(key) ?? randomInt(1000, 9000)) + 1;
  counters.set(key, n);
  return `${key}-${String(n).padStart(6, "0")}-${randomSuffix(2)}`;
}

const CITIES = ["Jakarta","Surabaya","Bandung","Medan","Semarang","Yogyakarta","Makassar","Palembang","Bekasi","Tangerang","Depok","Bogor","Malang","Batam","Pekanbaru","Balikpapan","Manado","Denpasar","Samarinda","Pontianak"];
const FIRST = ["Budi","Siti","Agus","Rina","Joko","Dewi","Andi","Lina","Eko","Maya","Hendra","Putri","Fajar","Nina","Rudi","Sari","Dian","Bayu","Tina","Yudi","Wati","Slamet","Ani","Bambang"];
const LAST = ["Santoso","Rahayu","Pratama","Wijaya","Kurniawan","Saputra","Gunawan","Susanto","Hartono","Setiawan","Permana","Utami","Nugroho","Hidayat","Lestari","Anggraini","Purnama","Siregar","Nasution","Halim"];
const COMPANY_SUFFIX = ["Makmur","Jaya","Abadi","Sentosa","Sejahtera","Mandiri","Prima","Utama","Perkasa","Nusantara","Global","Mitra","Sukses","Berkat","Anugerah"];
function randomName() { return `${pick(FIRST)} ${pick(LAST)}`; }
function randomCompany(prefix: string) { return `${prefix} ${pick(FIRST)} ${pick(COMPANY_SUFFIX)}`; }
function randomPhone() { return `08${randomInt(11,99)}-${randomInt(1000,9999)}-${randomInt(1000,9999)}`; }
function randomEmail(name: string) { return `${name.toLowerCase().replace(/\s+/g,".")}${randomInt(1,9999)}@example.com`; }
function randomAddress() { return `Jl. ${pick(CITIES)} No.${randomInt(1,200)}, ${pick(CITIES)}`; }

async function chunkInsert<T extends Record<string, unknown>>(table: unknown, rows: T[], chunk = CHUNK) {
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    // @ts-expect-error generic
    await db.insert(table).values(slice as never).onConflictDoNothing();
    if ((i / chunk) % 20 === 0 || i + chunk >= rows.length) {
      const pct = Math.min(100, Math.round(((i + slice.length) / rows.length) * 100));
      console.log(`    chunk ${i + slice.length}/${rows.length} (${pct}%)`);
    }
  }
}

// Insert berulang per chunk tanpa harus hold 100k di memory sekaligus
async function chunkedGenerateInsert(
  label: string,
  need: number,
  chunk: number,
  genChunk: (count: number) => Promise<unknown[]>,
  table: unknown
) {
  if (need <= 0) { console.log(`\n[${label}] sudah >= target, skip`); return; }
  console.log(`\n[${label}] menambah ${need} (chunk ${chunk})...`);
  let inserted = 0;
  let batchNo = 0;
  while (inserted < need) {
    const cur = Math.min(chunk, need - inserted);
    const rows = await genChunk(cur);
    if (!rows.length) break;
    // @ts-expect-error generic
    await db.insert(table).values(rows as never).onConflictDoNothing();
    inserted += rows.length;
    batchNo++;
    if (batchNo % 20 === 0 || inserted >= need) {
      console.log(`  ${label}: ${inserted}/${need} (${Math.round(inserted/need*100)}%)`);
    }
  }
}

async function main() {
  console.log(`\n=== Seed 100k INTEGRATED preserve branch/warehouse/user ===`);
  console.log(`TARGET per tabel utama = ${TARGET}, SUP/CUS target=${SUP_CUS_TARGET}, CHUNK=${CHUNK}`);
  console.log(`Rentang tanggal ${START_DATE.toISOString().slice(0,10)} s/d ${END_DATE.toISOString().slice(0,10)}`);

  const [adminRows, whRows, brRows, uomRows, itemRows] = await Promise.all([
    db.select({ id: users.id }).from(users).limit(1),
    db.select().from(warehouses),
    db.select().from(branches),
    db.select().from(uom),
    db.select().from(items),
  ]);
  const adminId = (adminRows as unknown as { id: string }[])?.[0]?.id ?? null;
  const allWarehouses = whRows;
  const allBranches = brRows;
  const allUom = uomRows;
  const allItemsArr = itemRows;
  console.log(`Preserve: branches=${allBranches.length}, warehouses=${allWarehouses.length}, users=${(await db.select().from(users).then(r=>r.length))}, uom=${allUom.length}, items=${allItemsArr.length}`);

  // --- Suppliers & Customers: jaga kecil ---
  const sup0 = await db.select().from(suppliers);
  const needSup = Math.max(0, SUP_CUS_TARGET - sup0.length);
  if (needSup > 0) {
    console.log(`\n[suppliers] menambah ${needSup} (jaga kecil)...`);
    const existingCodes = new Set(sup0.map(s=>s.code));
    await chunkedGenerateInsert("suppliers", needSup, CHUNK, async (cnt) => {
      const rows: typeof suppliers.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        let code: string;
        do { code = `SUP-${randomSuffix(5)}-${String(randomInt(1,9999)).padStart(4,"0")}`; } while (existingCodes.has(code));
        existingCodes.add(code);
        const name = randomCompany("PT");
        rows.push({
          id: genId("sup", d),
          code, name,
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
      return rows;
    }, suppliers);
  } else console.log(`\n[suppliers] sudah >= ${SUP_CUS_TARGET}, skip`);

  const cust0 = await db.select().from(customers);
  const needCust = Math.max(0, SUP_CUS_TARGET - cust0.length);
  if (needCust > 0) {
    console.log(`\n[customers] menambah ${needCust}...`);
    const existingCodes = new Set(cust0.map(s=>s.code));
    await chunkedGenerateInsert("customers", needCust, CHUNK, async (cnt) => {
      const rows: typeof customers.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        let code: string;
        do { code = `CUS-${randomSuffix(5)}-${String(randomInt(1,9999)).padStart(4,"0")}`; } while (existingCodes.has(code));
        existingCodes.add(code);
        const name = randomCompany("CV");
        rows.push({
          id: genId("cus", d),
          code, name,
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
      return rows;
    }, customers);
  } else console.log(`\n[customers] sudah >= ${SUP_CUS_TARGET}, skip`);

  const allSuppliers = await db.select().from(suppliers);
  const allCustomers = await db.select().from(customers);
  const allItems = await db.select().from(items);
  const allLocations = await db.select().from(locations);

  // --- Batches 100k ---
  const batch0 = await db.select().from(batches);
  const needBatches = Math.max(0, TARGET - batch0.length);
  if (needBatches > 0) {
    console.log(`\n[batches] target ${TARGET}, existing ${batch0.length}, perlu ${needBatches}`);
    const existing = new Set(batch0.map(b=> `${b.itemId}|${b.batchNumber}`));
    await chunkedGenerateInsert("batches", needBatches, CHUNK, async (cnt) => {
      const rows: typeof batches.$inferInsert[] = [];
      let tries = 0;
      while (rows.length < cnt && tries < cnt*5) {
        tries++;
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
          productionDate: prodDate.toISOString().slice(0,10) as unknown as never,
          expiryDate: expiry.toISOString().slice(0,10) as unknown as never,
          shift: pick(["1","2","3","A","B","C"]),
          meta: { dummy: true },
          notes: Math.random() > 0.6 ? `Batch dummy ${lot}` : null,
          createdBy: adminId,
          createdAt: d,
          updatedAt: d,
        });
      }
      return rows;
    }, batches);
  }

  // Refresh batches for downstream FK
  const allBatches = await db.select().from(batches);

  // --- Purchase Orders 100k + lines ---
  const po0 = await db.select().from(purchaseOrders);
  const needPO = Math.max(0, TARGET - po0.length);
  if (needPO > 0) {
    console.log(`\n[purchase_orders] target ${TARGET}, existing ${po0.length}, perlu ${needPO}`);
    const existingNos = new Set(po0.map(p=>p.poNo));
    // Generate PO headers + lines together per chunk
    const lineBuffer: typeof purchaseOrderLines.$inferInsert[] = [];
    await chunkedGenerateInsert("purchase_orders", needPO, CHUNK, async (cnt) => {
      const rows: typeof purchaseOrders.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        let poNo: string;
        do { poNo = `PO-${yymmOf(d)}-${String(randomInt(1,99999)).padStart(5,"0")}-${randomSuffix(3)}`; } while (existingNos.has(poNo));
        existingNos.add(poNo);
        const orderDate = d.toISOString().slice(0,10) as unknown as never;
        const expectedDate = new Date(d.getTime()+randomInt(1,30)*86_400_000).toISOString().slice(0,10) as unknown as never;
        const id = genId("po", d);
        rows.push({
          id, poNo,
          supplierId: pick(allSuppliers).id,
          warehouseId: pick(allWarehouses).id,
          orderDate, expectedDate,
          status: pick(["DRAFT","POSTED","CANCELED"] as const),
          notes: Math.random()>0.6 ? `PO dummy ${poNo}` : null,
          createdBy: adminId,
          branchId: pick(allBranches).id,
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
        });
        const lineCount = randomInt(1,4);
        for (let l=0;l<lineCount;l++) {
          const ld = new Date(d.getTime()+randomInt(0,3600)*1000);
          lineBuffer.push({
            id: genId("pol", ld),
            purchaseOrderId: id,
            itemId: pick(allItems).id,
            uomId: pick(allUom).id,
            qty: String(randomInt(1,500)),
            unitPrice: String(randomInt(1000, 150000)),
            batchNumber: Math.random()>0.5 ? `LOT-${randomSuffix(4)}` : null,
            note: null,
            deliveryDate: expectedDate as never,
          });
        }
      }
      return rows;
    }, purchaseOrders);
    if (lineBuffer.length) {
      console.log(`\n[purchase_order_lines] insert ${lineBuffer.length}...`);
      await chunkInsert(purchaseOrderLines, lineBuffer as never, CHUNK);
    }
  }

  // --- Sales Orders 100k + lines ---
  const so0 = await db.select().from(salesOrders);
  const needSO = Math.max(0, TARGET - so0.length);
  if (needSO > 0) {
    console.log(`\n[sales_orders] target ${TARGET}, existing ${so0.length}, perlu ${needSO}`);
    const existingNos = new Set(so0.map(s=>s.soNo));
    const lineBuffer: typeof salesOrderLines.$inferInsert[] = [];
    await chunkedGenerateInsert("sales_orders", needSO, CHUNK, async (cnt) => {
      const rows: typeof salesOrders.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        let soNo: string;
        do { soNo = `SO-${yymmOf(d)}-${String(randomInt(1,99999)).padStart(5,"0")}-${randomSuffix(3)}`; } while (existingNos.has(soNo));
        existingNos.add(soNo);
        const orderDate = d.toISOString().slice(0,10) as unknown as never;
        const expectedDate = new Date(d.getTime()+randomInt(1,20)*86_400_000).toISOString().slice(0,10) as unknown as never;
        const id = genId("so", d);
        rows.push({
          id, soNo,
          customerId: pick(allCustomers).id,
          warehouseId: pick(allWarehouses).id,
          orderDate, expectedDate,
          status: pick(["DRAFT","POSTED","CANCELED"] as const),
          notes: Math.random()>0.6 ? `SO dummy ${soNo}` : null,
          createdBy: adminId,
          branchId: pick(allBranches).id,
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
        });
        const lineCount = randomInt(1,4);
        for (let l=0;l<lineCount;l++) {
          const ld = new Date(d.getTime()+randomInt(0,3600)*1000);
          lineBuffer.push({
            id: genId("sol", ld),
            salesOrderId: id,
            itemId: pick(allItems).id,
            uomId: pick(allUom).id,
            qty: String(randomInt(1,500)),
            unitPrice: String(randomInt(1000, 150000)),
            batchNumber: Math.random()>0.5 ? `LOT-${randomSuffix(4)}` : null,
            note: null,
          });
        }
      }
      return rows;
    }, salesOrders);
    if (lineBuffer.length) {
      console.log(`\n[sales_order_lines] insert ${lineBuffer.length}...`);
      await chunkInsert(salesOrderLines, lineBuffer as never, CHUNK);
    }
  }

  // Refresh PO/SO for downstream
  const allPOs = await db.select({ id: purchaseOrders.id }).from(purchaseOrders);
  const allSOs = await db.select({ id: salesOrders.id }).from(salesOrders);

  // --- Goods Receipts 100k + lines ---
  const gr0 = await db.select().from(goodsReceipts);
  const needGR = Math.max(0, TARGET - gr0.length);
  if (needGR > 0) {
    console.log(`\n[goods_receipts] target ${TARGET}, existing ${gr0.length}, perlu ${needGR}`);
    const existingNos = new Set(gr0.map(g=>g.grNo));
    const lineBuffer: typeof goodsReceiptLines.$inferInsert[] = [];
    await chunkedGenerateInsert("goods_receipts", needGR, CHUNK, async (cnt) => {
      const rows: typeof goodsReceipts.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        let grNo: string;
        do { grNo = `GR-${yymmOf(d)}-${String(randomInt(1,99999)).padStart(5,"0")}-${randomSuffix(3)}`; } while (existingNos.has(grNo));
        existingNos.add(grNo);
        const dStr = d.toISOString().slice(0,10) as unknown as never;
        const po = pick(allPOs);
        const id = genId("gr", d);
        rows.push({
          id, grNo,
          purchaseOrderId: po.id,
          supplierId: pick(allSuppliers).id,
          warehouseId: pick(allWarehouses).id,
          receiptDate: dStr as never,
          status: pick(["DRAFT","POSTED","CANCELED"] as const),
          notes: Math.random()>0.6 ? `GR dummy ${grNo}` : null,
          createdBy: adminId,
          branchId: pick(allBranches).id,
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
        });
        const lineCount = randomInt(1,3);
        for (let l=0;l<lineCount;l++) {
          const ld = new Date(d.getTime()+randomInt(0,3600)*1000);
          lineBuffer.push({
            id: genId("grl", ld),
            goodsReceiptId: id,
            itemId: pick(allItems).id,
            uomId: pick(allUom).id,
            qty: String(randomInt(1,300)),
            unitPrice: String(randomInt(1000, 100000)),
            batchNumber: Math.random()>0.5 ? `LOT-${randomSuffix(4)}` : null,
            note: null,
          });
        }
      }
      return rows;
    }, goodsReceipts);
    if (lineBuffer.length) {
      console.log(`\n[goods_receipt_lines] insert ${lineBuffer.length}...`);
      await chunkInsert(goodsReceiptLines, lineBuffer as never, CHUNK);
    }
  }

  // --- Deliveries 100k + lines ---
  const dl0 = await db.select().from(deliveries);
  const needDL = Math.max(0, TARGET - dl0.length);
  if (needDL > 0) {
    console.log(`\n[deliveries] target ${TARGET}, existing ${dl0.length}, perlu ${needDL}`);
    const existingNos = new Set(dl0.map(d=>d.deliveryNo));
    const lineBuffer: typeof deliveryLines.$inferInsert[] = [];
    await chunkedGenerateInsert("deliveries", needDL, CHUNK, async (cnt) => {
      const rows: typeof deliveries.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        let dlNo: string;
        do { dlNo = `DL-${yymmOf(d)}-${String(randomInt(1,99999)).padStart(5,"0")}-${randomSuffix(3)}`; } while (existingNos.has(dlNo));
        existingNos.add(dlNo);
        const dStr = d.toISOString().slice(0,10) as unknown as never;
        const so = Math.random()>0.2 ? pick(allSOs) : null;
        const id = genId("dl", d);
        rows.push({
          id, deliveryNo: dlNo,
          salesOrderId: so?.id ?? null,
          customerId: pick(allCustomers).id,
          warehouseId: pick(allWarehouses).id,
          deliveryDate: dStr as never,
          status: pick(["DRAFT","POSTED","CANCELED"] as const),
          notes: Math.random()>0.6 ? `DL dummy ${dlNo}` : null,
          createdBy: adminId,
          branchId: pick(allBranches).id,
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
        });
        const lineCount = randomInt(1,3);
        for (let l=0;l<lineCount;l++) {
          const ld = new Date(d.getTime()+randomInt(0,3600)*1000);
          lineBuffer.push({
            id: genId("dll", ld),
            deliveryId: id,
            itemId: pick(allItems).id,
            uomId: pick(allUom).id,
            qty: String(randomInt(1,300)),
            unitPrice: String(randomInt(1000, 100000)),
            batchNumber: Math.random()>0.5 ? `LOT-${randomSuffix(4)}` : null,
            note: null,
          });
        }
      }
      return rows;
    }, deliveries);
    if (lineBuffer.length) {
      console.log(`\n[delivery_lines] insert ${lineBuffer.length}...`);
      await chunkInsert(deliveryLines, lineBuffer as never, CHUNK);
    }
  }

  // --- Stock Movements + Details + Ledger 100k ---
  const mv0 = await db.select().from(stockMovements);
  const needMV = Math.max(0, TARGET - mv0.length);
  if (needMV > 0) {
    console.log(`\n[stock_movements] target ${TARGET}, existing ${mv0.length}, perlu ${needMV}`);
    const types = await db.select().from(movementTypes);
    const ledgerBuffer: typeof stockLedger.$inferInsert[] = [];
    const detailBuffer: typeof stockMovementDetails.$inferInsert[] = [];
    await chunkedGenerateInsert("stock_movements", needMV, CHUNK, async (cnt) => {
      const rows: typeof stockMovements.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        const type = pick(types);
        const id = genId("smv", d);
        const qty = String(randomInt(1,200));
        const item = pick(allItems);
        const fromWh = Math.random()>0.3 ? pick(allWarehouses).id : null;
        const toWhCandidate = pick(allWarehouses).id;
        const toWh = fromWh === toWhCandidate ? pick(allWarehouses).id : toWhCandidate;
        const batchId = allBatches.length && Math.random()>0.3 ? pick(allBatches).id : null;
        rows.push({
          id, typeId: type.id,
          movementDate: d,
          status: pick(["DRAFT","POSTED","CANCELED"]),
          referenceType: pick([type.code, "MANUAL", "ADJUSTMENT", null]),
          referenceId: null,
          description: `Mov dummy ${type.code} ${randomSuffix(4)}`,
          createdBy: adminId,
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,7200)*1000),
        });
        detailBuffer.push({
          id: genId("smd", d),
          movementId: id,
          itemId: item.id,
          fromWarehouseId: fromWh,
          toWarehouseId: Math.random()>0.2 ? toWh : null,
          qty,
          uomId: (item as unknown as { uomId: string|null }).uomId ?? pick(allUom).id,
          batchId,
          barcode: `BC${randomSuffix(6)}${String(randomInt(1000,9999))}`,
          serialNumber: Math.random()>0.5 ? `SN-${randomSuffix(5)}` : null,
          incomingRate: String(randomInt(1000, 50000)),
          createdAt: d,
        });
        const whForLedger = toWh ?? fromWh ?? pick(allWarehouses).id;
        ledgerBuffer.push({
          id: genId("sld", d),
          transactionId: id,
          transactionType: type.code,
          transactionDate: d,
          itemId: item.id,
          warehouseId: whForLedger,
          locationId: null,
          qtyIn: fromWh ? "0" : qty,
          qtyOut: fromWh ? qty : "0",
          qtyBalance: String(randomInt(0,10000)),
          valuationRate: String(randomInt(1000,50000)),
          stockValue: String(randomInt(10000,5000000)),
          referenceType: type.code,
          referenceId: id,
          batchId,
          createdBy: adminId,
          createdAt: d,
        });
      }
      return rows;
    }, stockMovements);
    if (detailBuffer.length) {
      console.log(`\n[stock_movement_details] insert ${detailBuffer.length}...`);
      await chunkInsert(stockMovementDetails, detailBuffer as never, CHUNK);
    }
    if (ledgerBuffer.length) {
      console.log(`\n[stock_ledger] insert ${ledgerBuffer.length}...`);
      await chunkInsert(stockLedger, ledgerBuffer as never, CHUNK);
    }
  }

  // --- Stock Balances 100k ---
  const bal0 = await db.select().from(stockBalances);
  const needBal = Math.max(0, TARGET - bal0.length);
  if (needBal > 0) {
    console.log(`\n[stock_balances] target ${TARGET}, existing ${bal0.length}, perlu ${needBal}`);
    // existing pairs warehouse|item|date
    const existingPairs = new Set(bal0.map(b=> `${b.warehouseId}|${b.itemId}|${b.balanceDate}`));
    await chunkedGenerateInsert("stock_balances", needBal, CHUNK, async (cnt) => {
      const rows: typeof stockBalances.$inferInsert[] = [];
      let tries = 0;
      while (rows.length < cnt && tries < cnt*6) {
        tries++;
        const wh = pick(allWarehouses);
        const it = pick(allItems);
        const d = randomDate();
        const dateStr = d.toISOString().slice(0,10);
        const key = `${wh.id}|${it.id}|${dateStr}`;
        if (existingPairs.has(key)) continue;
        existingPairs.add(key);
        const opening = randomInt(0,1000);
        const inQty = randomInt(0,500);
        const outQty = randomInt(0,400);
        rows.push({
          id: genId("stb", d),
          balanceDate: dateStr as unknown as never,
          warehouseId: wh.id,
          itemId: it.id,
          openingQty: opening,
          inQty,
          outQty,
          closingQty: Math.max(0, opening + inQty - outQty),
          createdAt: d,
          updatedAt: d,
        });
      }
      return rows;
    }, stockBalances);
  }

  // Stock batches mirror (100k)
  const sb0 = await db.select().from(stockBatches);
  const needSB = Math.max(0, TARGET - sb0.length);
  if (needSB > 0) {
    console.log(`\n[stock_batches] target ${TARGET}, existing ${sb0.length}, perlu ${needSB}`);
    const seen = new Set(sb0.map(r=> `${r.batchId}|${r.warehouseId}`));
    await chunkedGenerateInsert("stock_batches", needSB, CHUNK, async (cnt) => {
      const rows: typeof stockBatches.$inferInsert[] = [];
      let tries=0;
      while (rows.length < cnt && tries < cnt*5) {
        tries++;
        const b = pick(allBatches);
        const wh = pick(allWarehouses);
        const key = `${b.id}|${wh.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const d = randomDate();
        rows.push({ id: genId("stbch", d), batchId: b.id, warehouseId: wh.id, qty: String(randomInt(0,500)), updatedAt: d });
      }
      // if dedup too strict, allow fallback without dedup for remaining
      while (rows.length < cnt) {
        const b = pick(allBatches);
        const wh = pick(allWarehouses);
        const d = randomDate();
        const key = `${b.id}|${wh.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push({ id: genId("stbch", d), batchId: b.id, warehouseId: wh.id, qty: String(randomInt(0,500)), updatedAt: d });
        } else if (rows.length < cnt - 100) {
          // force fresh batch if need more
          tries++;
          if (tries > cnt*10) break;
        } else break;
      }
      return rows.slice(0, cnt);
    }, stockBatches);
  }

  // --- Opname Projects 100k ---
  const proj0 = await db.select().from(opnameProjects);
  const needProj = Math.max(0, TARGET - proj0.length);
  if (needProj > 0) {
    console.log(`\n[opname_projects] target ${TARGET}, existing ${proj0.length}, perlu ${needProj}`);
    await chunkedGenerateInsert("opname_projects", needProj, CHUNK, async (cnt) => {
      const rows: typeof opnameProjects.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const d = randomDate();
        rows.push({
          id: genId("opj", d),
          name: `${pick(["Opname","Stocktake","Audit"])} ${pick(CITIES)} ${randomSuffix(3)} ${d.getFullYear()}`,
          mode: pick(["COMPARE","SCRATCH"] as const),
          status: pick(["DRAFT","IN_PROGRESS","APPROVED","CANCELLED"] as const),
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,48*3600)*1000),
          deadline: new Date(d.getTime()+randomInt(5,30)*86_400_000),
          opnameDate: new Date(d.getTime()+randomInt(1,14)*86_400_000).toISOString().slice(0,10) as never,
          cutOffDate: new Date(d.getTime()+randomInt(-2,5)*86_400_000).toISOString().slice(0,10) as never,
          cutOffTime: `${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`,
          createdBy: adminId,
          description: `Project dummy ${randomSuffix(6)}`,
        });
      }
      return rows;
    }, opnameProjects);
  }
  const allProjects = await db.select({ id: opnameProjects.id }).from(opnameProjects);

  // opname_warehouses 100k
  const ow0 = await db.select().from(opnameWarehouses);
  const needOw = Math.max(0, TARGET - ow0.length);
  if (needOw > 0) {
    console.log(`\n[opname_warehouses] target ${TARGET}, existing ${ow0.length}, perlu ${needOw}`);
    const existing = new Set(ow0.map(r=> `${r.opnameId}|${r.warehouseId}`));
    await chunkedGenerateInsert("opname_warehouses", needOw, CHUNK, async (cnt) => {
      const rows: typeof opnameWarehouses.$inferInsert[] = [];
      let tries=0;
      while (rows.length < cnt && tries < cnt*5) {
        tries++;
        const proj = pick(allProjects);
        const wh = pick(allWarehouses);
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
          completedAt: status==="COMPLETED" ? new Date(d.getTime()+randomInt(3600,86400)*1000) : null,
          createdAt: d,
        });
      }
      return rows;
    }, opnameWarehouses);
  }

  // opname_scans 100k
  const scans0 = await db.select().from(opnameScans);
  const needScans = Math.max(0, TARGET - scans0.length);
  if (needScans > 0) {
    console.log(`\n[opname_scans] target ${TARGET}, existing ${scans0.length}, perlu ${needScans}`);
    await chunkedGenerateInsert("opname_scans", needScans, CHUNK, async (cnt) => {
      const rows: typeof opnameScans.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const proj = pick(allProjects);
        const d = randomDate();
        const status = pick(["DRAFT","POSTED","CANCELED"] as const);
        rows.push({
          id: genId("ops", d),
          opnameId: proj.id,
          scannedBy: adminId,
          status,
          startedAt: d,
          completedAt: status==="POSTED" ? new Date(d.getTime()+randomInt(600,7200)*1000) : status==="CANCELED" ? new Date(d.getTime()+randomInt(600,3600)*1000) : null,
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,7200)*1000),
        });
      }
      return rows;
    }, opnameScans);
  }
  const allScans = await db.select().from(opnameScans);

  // opname_scan_details 100k
  const sd0 = await db.select().from(opnameScanDetails);
  const needSd = Math.max(0, TARGET - sd0.length);
  if (needSd > 0) {
    console.log(`\n[opname_scan_details] target ${TARGET}, existing ${sd0.length}, perlu ${needSd}`);
    await chunkedGenerateInsert("opname_scan_details", needSd, CHUNK, async (cnt) => {
      const rows: typeof opnameScanDetails.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const scan = pick(allScans);
        const d = randomDate();
        const it = pick(allItems);
        const wh = pick(allWarehouses);
        const loc = allLocations.find(l=>l.warehouseId===wh.id) ?? pick(allLocations);
        rows.push({
          id: genId("osd", d),
          scanId: (scan as unknown as { id:string }).id,
          opnameId: (scan as unknown as { opnameId:string }).opnameId,
          warehouseId: wh.id,
          locationId: loc.id,
          itemId: it.id,
          barcode: `11${String(randomInt(10000000,99999999))}-${randomSuffix(2)}`,
          batch: `LOT-${randomSuffix(4)}`,
          batchId: null,
          parsed: { ITEM_CODE: it.id.slice(0,5), SEQUENCE: String(randomInt(1,9999)) },
          quantity: randomInt(1,50),
          qtyMode: pick(["AUTO","MANUAL"] as const),
          source: pick(["SCANNER","CAMERA","MANUAL"] as const),
          scannedAt: d,
        });
      }
      return rows;
    }, opnameScanDetails);
  }

  // opname_counts 100k
  const oc0 = await db.select().from(opnameCounts);
  const needOc = Math.max(0, TARGET - oc0.length);
  if (needOc > 0) {
    console.log(`\n[opname_counts] target ${TARGET}, existing ${oc0.length}, perlu ${needOc}`);
    await chunkedGenerateInsert("opname_counts", needOc, CHUNK, async (cnt) => {
      const rows: typeof opnameCounts.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const proj = pick(allProjects);
        const wh = pick(allWarehouses);
        const d = randomDate();
        rows.push({
          id: genSocId(d),
          projectId: proj.id,
          warehouseId: wh.id,
          postingDate: d.toISOString().slice(0,10) as never,
          postingTime: `${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`,
          cutOffDate: new Date(d.getTime()-randomInt(0,5)*86_400_000).toISOString().slice(0,10) as never,
          cutOffTime: `${String(randomInt(0,23)).padStart(2,"0")}:${String(randomInt(0,59)).padStart(2,"0")}`,
          notes: Math.random()>0.5 ? `Count dummy ${randomSuffix(6)}` : null,
          status: pick(["DRAFT","POSTED","CANCELED"] as const),
          createdBy: adminId,
          createdAt: d,
          updatedAt: new Date(d.getTime()+randomInt(0,3600)*1000),
        });
      }
      return rows;
    }, opnameCounts);
  }
  const allCounts = await db.select().from(opnameCounts);

  // opname_count_details 100k
  const ocd0 = await db.select().from(opnameCountDetails);
  const needOcd = Math.max(0, TARGET - ocd0.length);
  if (needOcd > 0) {
    console.log(`\n[opname_count_details] target ${TARGET}, existing ${ocd0.length}, perlu ${needOcd}`);
    await chunkedGenerateInsert("opname_count_details", needOcd, CHUNK, async (cnt) => {
      const rows: typeof opnameCountDetails.$inferInsert[] = [];
      for (let i=0;i<cnt;i++) {
        const oc = pick(allCounts);
        const d = randomDate();
        rows.push({
          id: genId("ocd", d),
          countId: (oc as unknown as { id:string }).id,
          itemId: pick(allItems).id,
          qty: String(randomInt(1,200)),
          batch: `LOT-${randomSuffix(4)}`,
          uomId: null,
          warehouseId: (oc as unknown as { warehouseId:string }).warehouseId,
          createdAt: d,
        });
      }
      return rows;
    }, opnameCountDetails);
  }

  console.log("\n=== Ringkasan akhir ===");
  const tables = [
    "branches","warehouses","users","locations","item_groups","uom","items","batches",
    "suppliers","customers","purchase_orders","purchase_order_lines","sales_orders","sales_order_lines",
    "goods_receipts","goods_receipt_lines","deliveries","delivery_lines","stock_movements","stock_movement_details","stock_ledger",
    "stock_balances","stock_batches","opname_projects","opname_warehouses","opname_scans","opname_scan_details","opname_counts","opname_count_details"
  ];
  for (const t of tables) {
    try {
      const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${t}`)) as unknown as { rows: {n:number}[] };
      const n = (r as unknown as { rows: { n:number }[] }).rows?.[0]?.n ?? (r as unknown as { n:number }[])?.[0]?.n ?? "?";
      console.log(`  ${t}: ${n}`);
    } catch (e) { console.log(`  ${t}: err ${(e as Error).message}`); }
  }
}

main().catch(e=>{ console.error("Seed gagal:", e instanceof Error? e.message:e); process.exitCode=1; })
  .finally(async()=>{ await pool.end(); });
