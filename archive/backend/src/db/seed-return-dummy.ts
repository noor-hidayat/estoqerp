// @ts-nocheck
// Seed dummy Return Customer — Top10 finish good, ke gudang retur
// Jalankan: npm run db:seed-return-dummy -w backend
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import { customers, items, movementTypes, stockLedger, stockMovementDetails, stockMovements, warehouses } from "./schema";
import { nextRowId } from "../lib/id";

function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
}

async function main() {
  console.log("=== Seed Return Customer dummy (finish good → Gudang Retur) ===");
  const mvs = await db.select().from(movementTypes).where(sql`${movementTypes.code} = 'RETURN_CUSTOMER'`).limit(1);
  let mvt = mvs[0];
  if (!mvt) {
    console.log("Creating RETURN_CUSTOMER movement type...");
    const id = await nextRowId(db, movementTypes, "mvt");
    await db.insert(movementTypes).values({ id, code: "RETURN_CUSTOMER", name: "Customer Return", kind: "RECEIPT", series: "RET", builtin: true });
    mvt = (await db.select().from(movementTypes).where(sql`${movementTypes.code} = 'RETURN_CUSTOMER'`).limit(1))[0];
  }
  console.log(`MovementType: ${mvt.id} ${mvt.code}`);

  const whs = await db.select().from(warehouses);
  const returWhs = whs.filter(w => w.code.includes("RET"));
  const targetWhs = returWhs.length ? returWhs : whs;
  console.log(`Warehouses: total ${whs.length}, retur ${returWhs.length} -> ${targetWhs.map(w=>w.code).join(",")}`);

  const itsAll = await db.select().from(items);
  const fgItems = itsAll.filter((i:any) => (i as any).isFinishGood);
  const fg = fgItems.length ? fgItems : itsAll.slice(0, 5);
  console.log(`Items: total ${itsAll.length}, FG ${fg.length} (${fg.slice(0,3).map(i=>i.code).join(",")})`);

  const custs = await db.select().from(customers);
  if (!custs.length) { console.error("No customers"); process.exit(1); }

  // Cleanup old dummy returns
  const delDetails = await db.execute(sql`DELETE FROM stock_movement_details WHERE movement_id IN (SELECT id FROM stock_movements WHERE description LIKE 'DUMMY_RETURN%' ) RETURNING id`) as any;
  const delLed = await db.execute(sql`DELETE FROM stock_ledger WHERE transaction_type='RETURN_CUSTOMER' RETURNING id`) as any;
  const delMov = await db.execute(sql`DELETE FROM stock_movements WHERE description LIKE 'DUMMY_RETURN%' RETURNING id`) as any;
  console.log(`Cleanup: mov ${delMov.rowCount ?? delMov.rows?.length ?? 0}, details ${delDetails.rowCount ?? 0}, ledger ${delLed.rowCount ?? 0}`);

  // Top 5 skewed
  const top5 = fg.slice(0, 5);
  function pickWeighted() {
    if (Math.random() < 0.6 && top5.length) return pick(top5);
    return pick(fg);
  }

  const COUNT = 500;
  for (let i = 0; i < COUNT; i++) {
    const d = new Date();
    d.setDate(d.getDate() - randomInt(0, 90)); // last 90 days biar masuk filter bulanan/quarter
    d.setHours(randomInt(0,23), randomInt(0,59), randomInt(0,59));
    const movementDate = d;
    const movId = randomId("smv");
    const wh = pick(targetWhs);
    const cust = pick(custs);
    const item = pickWeighted();
    const isTop = top5.some(t => t.id === item.id);
    const qty = isTop ? randomInt(20, 80) : randomInt(1, 15);
    const uomId = (item as any).uomId ?? null;
    // Insert movement
    await db.insert(stockMovements).values({
      id: movId,
      typeId: mvt.id,
      movementDate,
      status: "POSTED",
      referenceType: "RETURN_CUSTOMER",
      referenceId: cust.id,
      description: `DUMMY_RETURN receipt - RETURN_CUSTOMER - ${cust.name} - ${item.code}`,
      customerId: cust.id,
      createdBy: null,
    });
    // Detail
    const detailId = randomId("smd");
    await db.insert(stockMovementDetails).values({
      id: detailId,
      movementId: movId,
      itemId: item.id,
      fromWarehouseId: null,
      toWarehouseId: wh.id,
      qty: String(qty),
      uomId,
      batchId: null,
      barcode: null,
      serialNumber: null,
      incomingRate: String(randomInt(10000, 50000)),
    });
    // Ledger mirror
    const ledgerId = randomId("sld");
    await db.insert(stockLedger).values({
      id: ledgerId,
      transactionId: movId,
      transactionType: "RETURN_CUSTOMER",
      transactionDate: movementDate,
      itemId: item.id,
      warehouseId: wh.id,
      qtyIn: String(qty),
      qtyOut: "0",
      qtyBalance: "0",
      valuationRate: "0",
      stockValue: "0",
      referenceType: "RETURN_CUSTOMER",
      referenceId: cust.id,
      createdBy: null,
    });
    if (i % 100 === 0) console.log(`  ${i}/${COUNT}`);
  }

  // Verify Top10
  const top = await db.execute(sql`
    SELECT it.code, it.name, SUM(smd.qty::numeric) as total
    FROM stock_movement_details smd
    JOIN stock_movements sm ON sm.id = smd.movement_id
    JOIN movement_types mt ON mt.id = sm.type_id
    JOIN items it ON it.id = smd.item_id
    WHERE mt.code = 'RETURN_CUSTOMER' AND sm.status='POSTED'
    GROUP BY it.code, it.name
    ORDER BY total DESC LIMIT 10
  `) as any;
  console.log("Top10:", top.rows ?? top);

  // Also verify finish good filter
  const topFg = await db.execute(sql`
    SELECT it.code, it.name, SUM(smd.qty::numeric) as total
    FROM stock_movement_details smd
    JOIN stock_movements sm ON sm.id = smd.movement_id
    JOIN movement_types mt ON mt.id = sm.type_id
    JOIN items it ON it.id = smd.item_id
    WHERE mt.code = 'RETURN_CUSTOMER' AND sm.status='POSTED' AND it.is_finish_good = true
    GROUP BY it.code, it.name
    ORDER BY total DESC LIMIT 10
  `) as any;
  console.log("Top10 FG:", topFg.rows ?? topFg);
}
main().catch(e=>{ console.error(e); process.exitCode=1; }).finally(async()=>{ await pool.end(); });
