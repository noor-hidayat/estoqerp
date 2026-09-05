// @ts-nocheck
// Seed dummy Receiving vs Delivery trend — 12 bulan terakhir, harian/mingguan/bulanan, saling bersimpangan
// Receiving = Goods Receipt (GR), Delivery = Delivery dari SO
// Jalankan: npm run db:seed-purchase-delivery-trend -w backend (alias seed-receiving-delivery)
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import { customers, deliveries, deliveryLines, goodsReceiptLines, goodsReceipts, items, purchaseOrderLines, purchaseOrders, salesOrders, suppliers, uom, warehouses } from "./schema";
import { nextRowId } from "../lib/id";

function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDaysLocal(d: Date, days: number): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

async function main() {
  console.log("=== Seed Receiving vs Delivery trend dummy (Receiving=GR) ===");
  const whs = await db.select().from(warehouses);
  const sups = await db.select().from(suppliers);
  const custs = await db.select().from(customers);
  const its = await db.select().from(items);
  const uoms = await db.select().from(uom);
  const sos = await db.select().from(salesOrders);
  if (!whs.length || !sups.length || !custs.length || !its.length || !uoms.length) {
    console.error("Masters kosong, jalankan seed-all dulu");
    process.exit(1);
  }
  console.log(`Masters: wh=${whs.length}, sup=${sups.length}, cust=${custs.length}, items=${its.length}, uom=${uoms.length}, so=${sos.length}`);

  // Hapus dummy trend sebelumnya yang ditandai notes LIKE 'DUMMY_TREND%'
  // (biar rerun tidak duplikat terus)
  const delLines = await db.execute(sql`DELETE FROM delivery_lines WHERE delivery_id IN (SELECT id FROM deliveries WHERE notes LIKE 'DUMMY_TREND%') RETURNING id`) as any;
  const delDlv = await db.execute(sql`DELETE FROM deliveries WHERE notes LIKE 'DUMMY_TREND%' RETURNING id`) as any;
  const delPol = await db.execute(sql`DELETE FROM purchase_order_lines WHERE purchase_order_id IN (SELECT id FROM purchase_orders WHERE notes LIKE 'DUMMY_TREND%') RETURNING id`) as any;
  const delPo = await db.execute(sql`DELETE FROM purchase_orders WHERE notes LIKE 'DUMMY_TREND%' RETURNING id`) as any;
  const delGrl = await db.execute(sql`DELETE FROM goods_receipt_lines WHERE goods_receipt_id IN (SELECT id FROM goods_receipts WHERE notes LIKE 'DUMMY_TREND%') RETURNING id`) as any;
  const delGr = await db.execute(sql`DELETE FROM goods_receipts WHERE notes LIKE 'DUMMY_TREND%' RETURNING id`) as any;
  console.log(`Cleanup dummy lama: PO ${delPo.rowCount ?? delPo.rows?.length ?? 0}, POL ${delPol.rowCount ?? 0}, GR ${delGr.rowCount ?? 0}, GRL ${delGrl.rowCount ?? 0}, DLV ${delDlv.rowCount ?? 0}, DLL ${delLines.rowCount ?? 0}`);

  // Pola nilai per bulan biar garis bersimpangan (receiving vs delivery saling cross)
  // 12 bulan: 2025-10 s/d 2026-09 (bulan berjalan 2026-09)
  const base = new Date("2025-10-01");
  const receivingMonthlyTarget = [80, 120, 95, 140, 90, 130, 110, 150, 100, 170, 120, 160]; // dalam juta (GR)
  const deliveryMonthlyTarget = [120, 80, 130, 100, 150, 90, 140, 100, 160, 110, 180, 130]; // juta, cross tiap bulan
  const purchaseMonthlyTarget = receivingMonthlyTarget; // PO ikut receiving biar konsisten
  // daily variation: sebar per hari dalam bulan

  for (let mi = 0; mi < 12; mi++) {
    const d = new Date(base);
    d.setMonth(base.getMonth() + mi);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const receivingTarget = receivingMonthlyTarget[mi] * 1_000_000;
    const purchaseTarget = purchaseMonthlyTarget[mi] * 1_000_000;
    const deliveryTarget = deliveryMonthlyTarget[mi] * 1_000_000;

    // Bagi target bulanan jadi 3 PO, 3 GR (receiving) dan 3 Delivery per bulan, masing2 2 lines
    const poCount = 3;
    const grCount = 3;
    const dlvCount = 3;
    const poPerValue = Math.floor(purchaseTarget / poCount);
    const grPerValue = Math.floor(receivingTarget / grCount);
    const dlvPerValue = Math.floor(deliveryTarget / dlvCount);

    const createdPoIds: string[] = [];
    for (let pi = 0; pi < poCount; pi++) {
      const day = randomInt(1, daysInMonth);
      const orderDate = new Date(year, month, day);
      const orderDateStr = fmtDateLocal(orderDate);
      const poId = await nextRowId(db, purchaseOrders, "po", orderDate);
      createdPoIds.push(poId);
      const supplier = pick(sups);
      const warehouse = pick(whs);
      await db.insert(purchaseOrders).values({
        id: poId,
        poNo: poId,
        supplierId: supplier.id,
        warehouseId: warehouse.id,
        orderDate: orderDateStr as any,
        expectedDate: fmtDateLocal(addDaysLocal(orderDate, 7)) as any,
        status: "POSTED",
        notes: `DUMMY_TREND PO ${year}-${String(month+1).padStart(2,'0')} #${pi+1}`,
        createdBy: null,
        branchId: (warehouse as any).branchId ?? null,
      });
      // 2 lines per PO, value split
      const lineValueEach = Math.floor(poPerValue / 2);
      for (let li = 0; li < 2; li++) {
        const item = pick(its);
        const u = pick(uoms);
        const qty = randomInt(10, 50);
        // unitPrice = lineValue / qty
        const unitPrice = Math.max(1000, Math.floor(lineValueEach / qty));
        await db.insert(purchaseOrderLines).values({
          id: await nextRowId(db, purchaseOrderLines, "pol", orderDate),
          purchaseOrderId: poId,
          itemId: item.id,
          uomId: u.id,
          qty: String(qty),
          unitPrice: String(unitPrice),
          batchNumber: null,
          note: null,
          deliveryDate: fmtDateLocal(addDaysLocal(orderDate, 7)) as any,
        });
      }
    }

    // Receiving (GR) - 3 GR per bulan, based on PO
    for (let gi = 0; gi < grCount; gi++) {
      const day = randomInt(1, daysInMonth);
      const receiptDate = new Date(year, month, day);
      const receiptDateStr = fmtDateLocal(receiptDate);
      const grId = await nextRowId(db, goodsReceipts, "gr", receiptDate);
      const poId = createdPoIds[gi % createdPoIds.length] ?? pick(createdPoIds);
      const po = await db.select().from(purchaseOrders).where(sql`${purchaseOrders.id} = ${poId}`).limit(1).then(r=>r[0] as any);
      const supplierId = po?.supplierId ?? pick(sups).id;
      const warehouseId = po?.warehouseId ?? pick(whs).id;
      await db.insert(goodsReceipts).values({
        id: grId,
        grNo: grId,
        purchaseOrderId: poId,
        supplierId,
        warehouseId,
        receiptDate: receiptDateStr as any,
        status: "POSTED",
        notes: `DUMMY_TREND GR ${year}-${String(month+1).padStart(2,'0')} #${gi+1}`,
        createdBy: null,
        branchId: (po as any)?.branchId ?? null,
      });
      const lineValueEach = Math.floor(grPerValue / 2);
      for (let li = 0; li < 2; li++) {
        const item = pick(its);
        const u = pick(uoms);
        const qty = randomInt(10, 50);
        const unitPrice = Math.max(1000, Math.floor(lineValueEach / qty));
        await db.insert(goodsReceiptLines).values({
          id: await nextRowId(db, goodsReceiptLines, "grl", receiptDate),
          goodsReceiptId: grId,
          itemId: item.id,
          uomId: u.id,
          qty: String(qty),
          unitPrice: String(unitPrice),
          batchNumber: null,
          note: null,
        });
      }
    }

    for (let di = 0; di < dlvCount; di++) {
      const day = randomInt(1, daysInMonth);
      const deliveryDate = new Date(year, month, day);
      const deliveryDateStr = fmtDateLocal(deliveryDate);
      const dlvId = await nextRowId(db, deliveries, "dlv", deliveryDate);
      const customer = pick(custs);
      const warehouse = pick(whs);
      // pakai SO random jika ada, else null
      const so = sos.length ? pick(sos) : null;
      await db.insert(deliveries).values({
        id: dlvId,
        deliveryNo: dlvId,
        salesOrderId: so?.id ?? null,
        customerId: customer.id,
        warehouseId: warehouse.id,
        deliveryDate: deliveryDateStr as any,
        status: "POSTED",
        notes: `DUMMY_TREND DLV ${year}-${String(month+1).padStart(2,'0')} #${di+1}`,
        createdBy: null,
        branchId: (warehouse as any).branchId ?? null,
      });
      const lineValueEach = Math.floor(dlvPerValue / 2);
      for (let li = 0; li < 2; li++) {
        const item = pick(its);
        const u = pick(uoms);
        const qty = randomInt(10, 50);
        const unitPrice = Math.max(1000, Math.floor(lineValueEach / qty));
        await db.insert(deliveryLines).values({
          id: await nextRowId(db, deliveryLines, "dll", deliveryDate),
          deliveryId: dlvId,
          itemId: item.id,
          uomId: u.id,
          qty: String(qty),
          unitPrice: String(unitPrice),
          batchNumber: null,
          note: null,
        });
      }
    }
    console.log(`  ${year}-${String(month+1).padStart(2,'0')}: PO ${poCount} (~${(purchaseTarget/1_000_000).toFixed(0)}M) GR ${grCount} (~${(receivingTarget/1_000_000).toFixed(0)}M) DLV ${dlvCount} (~${(deliveryTarget/1_000_000).toFixed(0)}M)`);
  }

  // Verifikasi agregat per bulan
  const poAgg = await db.execute(sql`
    SELECT to_char(date_trunc('month', po.order_date), 'YYYY-MM') as m,
           sum(pol.qty::numeric * COALESCE(pol.unit_price::numeric,0))::numeric(15,2) as val
    FROM purchase_order_lines pol
    JOIN purchase_orders po ON pol.purchase_order_id = po.id
    WHERE po.notes LIKE 'DUMMY_TREND%'
    GROUP BY 1 ORDER BY 1
  `) as any;
  const grAgg = await db.execute(sql`
    SELECT to_char(date_trunc('month', gr.receipt_date), 'YYYY-MM') as m,
           sum(grl.qty::numeric * COALESCE(grl.unit_price::numeric,0))::numeric(15,2) as val
    FROM goods_receipt_lines grl
    JOIN goods_receipts gr ON grl.goods_receipt_id = gr.id
    WHERE gr.notes LIKE 'DUMMY_TREND%'
    GROUP BY 1 ORDER BY 1
  `) as any;
  const dlvAgg = await db.execute(sql`
    SELECT to_char(date_trunc('month', dlv.delivery_date), 'YYYY-MM') as m,
           sum(dl.qty::numeric * COALESCE(dl.unit_price::numeric,0))::numeric(15,2) as val
    FROM delivery_lines dl
    JOIN deliveries dlv ON dl.delivery_id = dlv.id
    WHERE dlv.notes LIKE 'DUMMY_TREND%'
    GROUP BY 1 ORDER BY 1
  `) as any;
  console.log("\nPurchase monthly (dummy):", poAgg.rows ?? poAgg);
  console.log("Receiving (GR) monthly (dummy):", grAgg.rows ?? grAgg);
  console.log("Delivery monthly (dummy):", dlvAgg.rows ?? dlvAgg);

  // Verifikasi quarter & year juga bisa
  const qAgg = await db.execute(sql`
    SELECT to_char(date_trunc('quarter', gr.receipt_date), 'YYYY-"Q"Q') as q,
           sum(grl.qty::numeric * COALESCE(grl.unit_price::numeric,0))::numeric(15,2) as val
    FROM goods_receipt_lines grl JOIN goods_receipts gr ON grl.goods_receipt_id=gr.id
    WHERE gr.notes LIKE 'DUMMY_TREND%' GROUP BY 1 ORDER BY 1
  `) as any;
  console.log("Receiving quarterly:", qAgg.rows ?? qAgg);
}
main().catch(e=>{ console.error(e); process.exitCode=1; }).finally(async()=>{ await pool.end(); });
