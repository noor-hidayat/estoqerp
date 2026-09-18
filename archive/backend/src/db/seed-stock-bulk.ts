// @ts-nocheck
// Seed massal: isi stock_balances sampai 100.000 row total.
// Tidak menambah item/warehouse/branch/location/project — hanya memakai
// master data yang sudah ada (pasangan unique warehouse_id + item_id).
// Idempotent: bisa dijalankan ulang, berhenti saat total = 100.000.
import { sql } from "drizzle-orm";
import { db, pool } from "./pool";
import { items, stockBalances, warehouses } from "./schema";

const TARGET_TOTAL = 100_000;
const BATCH = 5_000;

// Pseudo-random deterministik (hash string).
function hashId(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

async function main() {
  const [whs, itemsAll, countRow] = await Promise.all([
    db.select({ id: warehouses.id, code: warehouses.code }).from(warehouses),
    db.select({ id: items.id, code: items.code }).from(items),
    db
      .select({ n: sql<number>`count(*)` })
      .from(stockBalances),
  ]);

  const current = Number(countRow[0]?.n ?? 0);
  if (current >= TARGET_TOTAL) {
    console.log(`stock_balances sudah ${current.toLocaleString("id-ID")} row — target ${TARGET_TOTAL.toLocaleString("id-ID")} tercapai, tidak ada yang ditambahkan.`);
    return;
  }
  const toAdd = TARGET_TOTAL - current;
  console.log(
    `stock_balances saat ini ${current.toLocaleString("id-ID")} · menambah ${toAdd.toLocaleString("id-ID")} row ` +
      `(${whs.length} gudang × ${itemsAll.length} item = ${(whs.length * itemsAll.length).toLocaleString("id-ID")} pasangan maksimum)`
  );

  if (toAdd > whs.length * itemsAll.length) {
    console.error(
      `Tidak cukup pasangan unik: perlu ${toAdd}, tapi maksimum hanya ${whs.length * itemsAll.length}. ` +
        `Tambahkan item/gudang dulu.`
    );
    return;
  }

  let seq = 0;
  let added = 0;
  let batch: (typeof stockBalances.$inferInsert)[] = [];
  const start = Date.now();

  const flush = async () => {
    if (!batch.length) return;
    // Potong batch terakhir supaya tidak melebihi target.
    const need = toAdd - added;
    if (batch.length > need) batch = batch.slice(0, need);
    if (!batch.length) return;
    const result = await db
      .insert(stockBalances)
      .values(batch)
      .onConflictDoNothing();
    added += result.rowCount ?? 0;
    batch = [];
    const pct = Math.round((added / toAdd) * 100);
    const rate = Math.round(added / ((Date.now() - start) / 1000));
    console.log(`  ${added.toLocaleString("id-ID")}/${toAdd.toLocaleString("id-ID")} (${pct}%) · ${rate.toLocaleString("id-ID")} row/detik`);
  };

  outer: for (const it of itemsAll) {
    for (const wh of whs) {
      if (added >= toAdd) break outer;      seq += 1;
      const h = hashId(wh.id + it.id);
      const opening = 20 + (h % 900);
      const inQty = h % 40;
      const outQty = h % 35;
      const dayOffset = h % 365;
      const balanceDate = new Date(Date.now() - dayOffset * 86_400_000)
        .toISOString()
        .slice(0, 10);
      batch.push({
        id: `stb_bulk_${String(seq).padStart(6, "0")}`,
        balanceDate,
        warehouseId: wh.id,
        itemId: it.id,
        openingQty: opening,
        inQty,
        outQty,
        closingQty: opening + inQty - outQty,
      });
      if (batch.length >= BATCH) await flush();
    }
  }
  await flush();

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`Selesai: total stock_balances sekarang 100.000 row (dalam ${seconds} detik).`);
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
