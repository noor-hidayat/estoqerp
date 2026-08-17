// Seed data dummy: stock sistem + hasil scan opname per gudang,
// dibuat dari item yang sudah ada di database (deterministik, bisa dijalankan ulang).
import { and, eq, like, desc } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  branches,
  items,
  locations,
  opnameProjects,
  projects,
  scanRecords,
  scanSessions,
  stockBalances,
  users,
  warehouses,
} from "./schema";

const PREFIX = "dmy";

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

const DUMMY_BRANCHES = [
  { code: "PL1", name: "Branch 1", city: "Jakarta" },
  { code: "PL2", name: "Branch 2", city: "Bekasi" },
  { code: "PL3", name: "Branch 3", city: "Karawang" },
  { code: "PL4", name: "Branch 4", city: "Tangerang" },
  { code: "PL5", name: "Branch 5", city: "Bogor" },
];

const DUMMY_WAREHOUSES = [
  { branchCode: "PL1", code: "BB-A", name: "Gdg. Bahan Baku - A", locCode: "BBA-01" },
  { branchCode: "PL2", code: "BB-B", name: "Gdg. Bahan Baku - B", locCode: "BBB-01" },
  { branchCode: "PL3", code: "SP-A", name: "Gdg. Sparepart - A", locCode: "SPA-01" },
  { branchCode: "PL4", code: "SP-B", name: "Gdg. Sparepart - B", locCode: "SPB-01" },
  { branchCode: "PL5", code: "BP-A", name: "Gdg. Bahan Penolong - A", locCode: "BPA-01" },
];

// Lokasi dummy yang perlu dipastikan ada (gudang yang belum punya lokasi).
const DUMMY_LOCATIONS = [
  { warehouseCode: "BLG-WH01", code: "BLG-01", name: "Area 1" },
  ...DUMMY_WAREHOUSES.map((w) => ({
    warehouseCode: w.code,
    code: w.locCode,
    name: "Area 1",
  })),
];

async function main() {
  // ---- Bersihkan data dummy dari eksekusi sebelumnya ----
  await db.delete(scanRecords).where(like(scanRecords.sessionId, `ses_${PREFIX}%`));
  await db.delete(scanSessions).where(like(scanSessions.id, `ses_${PREFIX}%`));
  await db.delete(stockBalances).where(like(stockBalances.id, `sb_${PREFIX}%`));
  await db.delete(projects).where(like(projects.id, `SOP-${PREFIX.toUpperCase()}%`));
  await db.delete(locations).where(like(locations.id, `loc_${PREFIX}%`));
  await db.delete(warehouses).where(like(warehouses.id, `wh_${PREFIX}%`));
  await db.delete(branches).where(like(branches.id, `br_${PREFIX}%`));

  // ---- Pastikan branch/gudang/lokasi dummy ada ----
  let brSeq = 0;
  let whSeq = 0;
  let locSeq = 0;

  for (const b of DUMMY_BRANCHES) {
    brSeq += 1;
    await db.insert(branches).values({
      id: `br_${PREFIX}_${String(brSeq).padStart(3, "0")}`,
      ...b,
    });
  }
  for (const w of DUMMY_WAREHOUSES) {
    whSeq += 1;
    const [br] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.code, w.branchCode))
      .limit(1);
    await db.insert(warehouses).values({
      id: `wh_${PREFIX}_${String(whSeq).padStart(3, "0")}`,
      branchId: br?.id ?? "br_003",
      code: w.code,
      name: w.name,
    });
  }
  const whsAll = await db.select().from(warehouses);
  for (const l of DUMMY_LOCATIONS) {
    const wh = whsAll.find((w) => w.code === l.warehouseCode);
    if (!wh) continue;
    const exists = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.warehouseId, wh.id), eq(locations.code, l.code)))
      .limit(1);
    if (exists[0]) continue;
    locSeq += 1;
    await db.insert(locations).values({
      id: `loc_${PREFIX}_${String(locSeq).padStart(3, "0")}`,
      warehouseId: wh.id,
      code: l.code,
      name: l.name,
    });
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

  let sesSeq = 0;
  let projSeq = 0;
  let recSeq = 0;

  for (const wh of whs) {
    const whLoc = locationsAll.find((l) => l.warehouseId === wh.id) ?? null;
    const mult = MULT_BY_CODE[wh.code] ?? 0.97;

    // NOTE: stock balance TIDAK dibuat dari item list — item tidak disimpan
    // di semua gudang. Stok sistem diisi lewat Import Data → Stock.

    // project terakhir per gudang; buat dummy project bila belum ada
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.warehouseId, wh.id))
      .orderBy(desc(projects.createdAt), desc(projects.id))
      .limit(1);
    let projectId: string;
    if (existing[0]) {
      projectId = existing[0].id;
    } else {
      projSeq += 1;
      const parentId = `PRJ-${PREFIX.toUpperCase()}-${String(projSeq).padStart(3, "0")}`;
      projectId = `SOP-${PREFIX.toUpperCase()}-${String(projSeq).padStart(3, "0")}`;
      await db.insert(opnameProjects).values({
        id: parentId,
        name: `Opname Dummy ${wh.name}`,
        createdAt: new Date(),
        createdBy: admin?.id ?? null,
      });
      await db.insert(projects).values({
        id: projectId,
        name: `Opname Dummy ${wh.name}`,
        projectId: parentId,
        branchId: wh.branchId,
        warehouseId: wh.id,
        mode: "COMPARE",
        status: "IN_PROGRESS",
        createdBy: admin?.id ?? null,
        createdAt: new Date(),
      });
    }

    // hasil hitung: qty hasil scan = sistem × multiplier ± jitter 5%
    sesSeq += 1;
    const sessionId = `ses_${PREFIX}_${String(sesSeq).padStart(4, "0")}`;
    await db.insert(scanSessions).values({
      id: sessionId,
      projectId,
      locationId: whLoc?.id ?? null,
      scannedBy: admin?.id ?? null,
      startedAt: new Date(),
      endedAt: new Date(),
      status: "CLOSED",
    });

    const recValues = itemsAll.map((it) => {
      const qty = 50 + (hashId(wh.id + it.id) % 450);
      const counted = Math.max(
        1,
        Math.round(
          qty * mult * (0.95 + (hashId(it.id + wh.id) % 11) / 100)
        )
      );
      recSeq += 1;
      return {
        id: `rec_${PREFIX}_${String(recSeq).padStart(6, "0")}`,
        sessionId,
        projectId,
        barcode: it.barcodeId ?? it.code,
        itemId: it.id,
        parsed: {},
        quantity: counted,
        qtyMode: "AUTO" as const,
        source: "SCANNER" as const,
        locationId: whLoc?.id ?? null,
        scannedAt: new Date(),
      };
    });
    await db.insert(scanRecords).values(recValues);

    const totalSystem = 0;
    const totalCounted = recValues.reduce((a, r) => a + r.quantity, 0);
    const selisih = totalCounted - totalSystem;
    console.log(
      `[seed-dummy] ${wh.code} ${wh.name} → project ${projectId}, ` +
        `${itemsAll.length} item · sistem ${totalSystem} · opname ${totalCounted}` +
        ` · selisih ${selisih > 0 ? "+" : ""}${selisih}`
    );
  }

  await pool.end();
  console.log("[seed-dummy] Selesai.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
