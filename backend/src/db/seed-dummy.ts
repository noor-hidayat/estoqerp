// Seed data dummy: hasil scan opname per gudang,
// dibuat dari item yang sudah ada di database (deterministik, bisa dijalankan ulang).
import { desc, eq, like } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  items,
  locations,
  opnameProjects,
  opnameScans,
  opnameScanDetails,
  opnameWarehouses,
  users,
  warehouses,
} from "./schema";
import { nextRowId } from "../lib/id";

function hashId(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

// Target selisih hasil hitung vs stok sistem per kode gudang (persentase).
const MULT_BY_CODE: Record<string, number> = {
  "JTK-WH01": 0.9687, // Gdg. Barang Jadi - J   ≈ -3,13%
  "BLG-WH01": 0.8396, // Gdg. Barang Jadi - B   ≈ -16,04%
  "BB-A": 1.0128, // Gdg. Bahan Baku - A    ≈ +1,28%
  "BB-B": 0.9759, // Gdg. Bahan Baku - B    ≈ -2,41%
  "SP-A": 0.9902, // Gdg. Sparepart - A     ≈ -0,98%
  "SP-B": 1.0065, // Gdg. Sparepart - B     ≈ +0,65%
  "BP-A": 0.9786, // Gdg. Bahan Penolong - A ≈ -2,14%
};

const DUMMY_NAME_PREFIX = "Opname Dummy ";

async function main() {
  // ---- Bersihkan data dummy dari eksekusi sebelumnya (cascade ke scan) ----
  const dummyProjects = await db
    .select({ id: opnameProjects.id })
    .from(opnameProjects)
    .where(like(opnameProjects.name, `${DUMMY_NAME_PREFIX}%`));
  for (const p of dummyProjects) {
    await db.delete(opnameProjects).where(eq(opnameProjects.id, p.id));
  }

  // ---- Ambil data master yang sudah ada ----
  const whs = (await db.select().from(warehouses)).sort((a, b) =>
    a.code.localeCompare(b.code)
  );
  const itemsAll = await db.select().from(items);
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, "admin@opname.id"))
    .limit(1);
  const locationsAll = await db.select().from(locations);

  for (const wh of whs) {
    const whLoc = locationsAll.find((l) => l.warehouseId === wh.id) ?? null;
    const mult = MULT_BY_CODE[wh.code] ?? 0.97;

    // Project dummy terakhir per gudang; buat baru bila belum ada.
    const [opnameRow] = await db
      .select({ opnameId: opnameWarehouses.opnameId })
      .from(opnameWarehouses)
      .where(eq(opnameWarehouses.warehouseId, wh.id))
      .orderBy(desc(opnameWarehouses.createdAt))
      .limit(1);

    const now = new Date();
    let opnameId: string;
    if (opnameRow?.opnameId) {
      opnameId = opnameRow.opnameId;
    } else {
      opnameId = await nextRowId(db, opnameProjects, "opj", now);
      await db.insert(opnameProjects).values({
        id: opnameId,
        name: `${DUMMY_NAME_PREFIX}${wh.name}`,
        mode: "COMPARE",
        status: "IN_PROGRESS",
        createdAt: now,
        updatedAt: now,
        createdBy: admin?.id ?? null,
      });
      await db.insert(opnameWarehouses).values({
        id: await nextRowId(db, opnameWarehouses, "opw", now),
        opnameId,
        warehouseId: wh.id,
        status: "IN_PROGRESS",
        startedAt: now,
        createdAt: now,
      });
    }

    // Header scan (POSTED) per gudang.
    const scanId = await nextRowId(db, opnameScans, "ops", now);
    await db.insert(opnameScans).values({
      id: scanId,
      opnameId,
      scannedBy: admin?.id ?? null,
      status: "POSTED",
      startedAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Detail scan per item: qty hasil hitung = sistem × multiplier ± jitter 5%.
    const detailValues = itemsAll.map((it) => {
      const qty = 50 + (hashId(wh.id + it.id) % 450);
      const counted = Math.max(
        1,
        Math.round(
          qty * mult * (0.95 + (hashId(it.id + wh.id) % 11) / 100)
        )
      );
      return {
        id: "",
        scanId,
        opnameId,
        warehouseId: wh.id,
        locationId: whLoc?.id ?? null,
        itemId: it.id,
        barcode: it.code,
        parsed: {},
        quantity: counted,
        qtyMode: "AUTO" as const,
        source: "SCANNER" as const,
        scannedAt: now,
      };
    });
    for (const d of detailValues) {
      d.id = await nextRowId(db, opnameScanDetails, "osd", now);
    }
    await db.insert(opnameScanDetails).values(detailValues);

    const totalCounted = detailValues.reduce((a, r) => a + r.quantity, 0);
    console.log(
      `[seed-dummy] ${wh.code} ${wh.name} → project ${opnameId}, ` +
        `${itemsAll.length} item · opname ${totalCounted}`
    );
  }

  await pool.end();
  console.log("[seed-dummy] Selesai.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});