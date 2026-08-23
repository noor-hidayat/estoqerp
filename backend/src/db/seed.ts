import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  branches,
  branchAccesses,
  barcodeFormats,
  itemGroups,
  items,
  locations,
  movementTypes,
  opnameProjects,
  opnameScans,
  opnameScanDetails,
  opnameWarehouses,
  rolePermissions,
  roles,
  stockBalances,
  uom,
  users,
  warehouses,
} from "./schema";
import { nextSeedId } from "../lib/id";

const EMAIL = "admin@opname.id";
const PASSWORD = "admin";

// Counter in-memory untuk seed — format sama dengan DB: {prefix}-{YYMM}-{0001}
const seqCounters = new Map<string, number>();
function nextId(prefix: string, date: Date = new Date()): string {
  return nextSeedId(seqCounters, prefix, date);
}

// Barcode 11 digit: ITEM_GROUP(2) + ITEM_CODE(5) + SEQUENCE(4)
function barcode(igCode: string, itemCode: string, seq: string) {
  return `${igCode}${itemCode}${seq}`;
}

function parsedFor(
  igCode: string,
  itemCode: string,
  seq: string
): Record<string, string> {
  return {
    ITEM_CODE: itemCode,
    ITEM_GROUP: igCode,
    DATE: "",
    SEQUENCE: seq,
    BARCODE_ID: "",
    CUSTOM: "",
  };
}

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3_600_000);
}

function daysAgo(d: number) {
  return new Date(Date.now() - d * 86_400_000);
}

// Qty master = isi per barcode/produk (berbeda dari stok sistem).
const QTY_MASTER: Record<string, number> = {
  "Gula Pasir 1kg": 12,
  "Tepung Terigu 1kg": 12,
  "Minyak Goreng 1L": 6,
  "Beras Premium 5kg": 20,
  "Kardus Polos 60x40": 50,
  "Plastik Wrap 30cm": 12,
  "Botol PET 600ml": 48,
  "Sarden Kaleng 425g": 24,
  "Kecap Manis 620ml": 12,
  "Susu UHT 1L": 12,
  "Baut M8x30": 100,
  "Lampu LED 9W": 10,
};

async function ensureAdmin() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, EMAIL));

  if (existing) {
    await db
      .update(users)
      .set({ name: "Administrator", passwordHash, role: "role_sys_admin", active: true })
      .where(eq(users.id, existing.id));
    return existing.id;
  }

  const id = nextId("usr");
  await db.insert(users).values({
    id,
    name: "Administrator",
    email: EMAIL,
    passwordHash,
    role: "role_sys_admin",
    active: true,
    avatarHue: 220,
  });
  return id;
}

async function ensureSystemRoles() {
  const [anyRole] = await db.select({ id: roles.id }).from(roles).limit(1);
  if (anyRole) return;

  await db.insert(roles).values([
    { id: "role_sys_admin", name: "Administrator", isSystem: true, active: true },
    { id: "role_admin", name: "Admin", isSystem: false, active: true },
    { id: "role_staff", name: "Staff Gudang", isSystem: false, active: true },
  ]);

  // Permission dasar untuk role non-administrator (isSystem bypass).
  const allMenus = ["dashboard","opname","opname.new","opname.variance","opname.detail","opname.detail.scan","opname.detail.sessions","opname.detail.sessions.detail","opname.detail.variance","settings.columnWidth","master","master.items","master.itemGroups","master.uom","master.barcodeFormats","master.barcodeFormats.new","master.barcodeFormats.edit","master.batchFormats","master.batchFormats.new","master.batchFormats.edit","inventory","inventory.stockBalance","inventory.branches","inventory.warehouses","inventory.locations","reports","reports.project","reports.summary","reports.history","reports.variance","settings","settings.users","settings.roles","settings.roles.new","settings.roles.edit","ai"];
  // Menu yang punya tombol Export (Export/Import hanya untuk menu ini).
  const exportMenus = new Set(["inventory.stockBalance","reports.project","reports.summary","reports.history","reports.variance"]);
  const baseActions = ["view","create","update","delete"];
  let pseq = 0;
  const permId = () => `pm_${String(++pseq).padStart(3,"0")}`;
  const perms: { id: string; roleId: string; menu: string; action: string }[] = [];
  for (const menu of allMenus) {
    const actions = exportMenus.has(menu)
      ? [...baseActions, "export", "import"]
      : baseActions;
    for (const action of actions) {
      perms.push({ id: permId(), roleId: "role_admin", menu, action });
    }
  }
  const staffMenus = ["dashboard","opname","opname.new","opname.variance","opname.detail","opname.detail.scan","opname.detail.sessions","opname.detail.sessions.detail","opname.detail.variance","reports","reports.project","reports.summary","reports.history","reports.variance","ai"];
  for (const menu of staffMenus) {
    perms.push({ id: permId(), roleId: "role_staff", menu, action: "view" });
  }
  perms.push({ id: permId(), roleId: "role_staff", menu: "opname", action: "create" });
  perms.push({ id: permId(), roleId: "role_staff", menu: "opname", action: "update" });
  perms.push({ id: permId(), roleId: "role_staff", menu: "opname.detail.scan", action: "create" });
  perms.push({ id: permId(), roleId: "role_staff", menu: "opname.detail.scan", action: "update" });
  if (perms.length) await db.insert(rolePermissions).values(perms);
}

async function seedDummyData(adminId: string) {
  const [marker] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.name, "Gula Pasir 1kg"))
    .limit(1);

  // Dummy sudah ada — pastikan qty master (isi per barcode) terisi.
  if (marker) {
    for (const [name, qty] of Object.entries(QTY_MASTER)) {
      await db
        .update(items)
        .set({ uomQty: String(qty) })
        .where(eq(items.name, name));
    }
    // Pastikan tipe transaksi bawaan (Receipt/Issue/Transfer) selalu ada.
    await db
      .insert(movementTypes)
      .values([
        { id: "mvt_receipt", code: "RECEIPT", name: "Receipt", kind: "RECEIPT", series: "RCV", builtin: true },
        { id: "mvt_issue", code: "ISSUE", name: "Issue", kind: "ISSUE", series: "ISS", builtin: true },
        { id: "mvt_transfer", code: "TRANSFER", name: "Transfer", kind: "TRANSFER", series: "TRF", builtin: true },
      ])
      .onConflictDoUpdate({
        target: movementTypes.code,
        set: {
          kind: sql`excluded.kind`,
          series: sql`excluded.series`,
          builtin: sql`excluded.builtin`,
          name: sql`excluded.name`,
          updatedAt: sql`now()`,
        },
      });
    console.log("Dummy data sudah ada, qty master diperbarui.");
    return;
  }

  await db.transaction(async (tx) => {
    // --- Struktur organisasi ---
    const brJkt = { id: nextId("br"), code: "JKT", name: "Branch Jakarta", city: "Jakarta" };
    const brSby = { id: nextId("br"), code: "SBY", name: "Branch Surabaya", city: "Surabaya" };
    await tx.insert(branches).values([brJkt, brSby]);

    const whJkt1 = { id: nextId("wh"), branchId: brJkt.id, code: "JKT-W01", name: "Gudang Pusat Jakarta" };
    const whJkt2 = { id: nextId("wh"), branchId: brJkt.id, code: "JKT-W02", name: "Gudang Bahan Baku Jakarta" };
    const whSby1 = { id: nextId("wh"), branchId: brSby.id, code: "SBY-W01", name: "Gudang Pusat Surabaya" };
    await tx.insert(warehouses).values([whJkt1, whJkt2, whSby1]);

    const loc = (
      wh: { id: string },
      rows: [string, string][]
    ) =>
      rows.map(([code, name]) => ({
        id: nextId("loc"),
        warehouseId: wh.id,
        code,
        name,
      }));
    const locJkt1 = loc(whJkt1, [
      ["A01", "Rak A1 - Sembako"],
      ["A02", "Rak A2 - Sembako"],
      ["B01", "Rak B1 - Minuman"],
      ["B02", "Rak B2 - Minuman"],
      ["C01", "Rak C1 - Makanan Kaleng"],
      ["C02", "Rak C2 - Makanan Kaleng"],
      ["D01", "Rak D1 - Umum"],
      ["D02", "Rak D2 - Umum"],
    ]);
    const locJkt2 = loc(whJkt2, [
      ["A01", "Bin A - Bahan Baku"],
      ["A02", "Bin B - Bahan Baku"],
      ["A03", "Bin C - Kemasan"],
    ]);
    const locSby1 = loc(whSby1, [
      ["A01", "Rak A1 - Sembako"],
      ["A02", "Rak A2 - Sembako"],
      ["B01", "Rak B1 - Minuman"],
      ["B02", "Rak B2 - Minuman"],
    ]);
    await tx.insert(locations).values([...locJkt1, ...locJkt2, ...locSby1]);

    // --- Master data ---
    const igRaw = { id: nextId("igr"), code: "01", name: "Bahan Baku" };
    const igPack = { id: nextId("igr"), code: "02", name: "Kemasan" };
    const igFin = { id: nextId("igr"), code: "03", name: "Barang Jadi" };
    const igSp = { id: nextId("igr"), code: "04", name: "Sparepart" };
    await tx.insert(itemGroups).values([igRaw, igPack, igFin, igSp]);

    // --- Satuan (UoM) & tipe transaksi stok (builtin: Receipt, Issue, Transfer) ---
    const uomRows = [
      { id: nextId("uom"), code: "PCS", name: "Pieces" },
      { id: nextId("uom"), code: "KG", name: "Kilogram" },
      { id: nextId("uom"), code: "CRT", name: "Karton" },
      { id: nextId("uom"), code: "LTR", name: "Liter" },
      { id: nextId("uom"), code: "BTL", name: "Botol" },
      { id: nextId("uom"), code: "KRN", name: "Karung" },
      { id: nextId("uom"), code: "ROL", name: "Rol" },
      { id: nextId("uom"), code: "KLG", name: "Kaleng" },
    ];
    await tx.insert(uom).values(uomRows);
    const uomByUnit = new Map<string, string>([
      ["pcs", uomRows[0].id],
      ["botol", uomRows[4].id],
      ["karung", uomRows[5].id],
      ["rol", uomRows[6].id],
      ["kaleng", uomRows[7].id],
    ]);
    await tx.insert(movementTypes).values([
      { id: nextId("mvt"), code: "RECEIPT", name: "Receipt", kind: "RECEIPT", series: "RCV", builtin: true },
      { id: nextId("mvt"), code: "ISSUE", name: "Issue", kind: "ISSUE", series: "ISS", builtin: true },
      { id: nextId("mvt"), code: "TRANSFER", name: "Transfer", kind: "TRANSFER", series: "TRF", builtin: true },
    ]);

    const itemDefs = [
      { code: "00001", name: "Gula Pasir 1kg", unit: "pcs", itemGroupId: igRaw.id, stock: [[whJkt1.id, 120], [whJkt2.id, 300], [whSby1.id, 80]] as [string, number][], price: 14500, hue: 25 },
      { code: "00002", name: "Tepung Terigu 1kg", unit: "pcs", itemGroupId: igRaw.id, stock: [[whJkt1.id, 90], [whJkt2.id, 250], [whSby1.id, 60]] as [string, number][], price: 12000, hue: 40 },
      { code: "00003", name: "Minyak Goreng 1L", unit: "botol", itemGroupId: igRaw.id, stock: [[whJkt1.id, 75], [whJkt2.id, 180], [whSby1.id, 50]] as [string, number][], price: 19500, hue: 30 },
      { code: "00004", name: "Beras Premium 5kg", unit: "karung", itemGroupId: igRaw.id, stock: [[whJkt1.id, 40], [whJkt2.id, 90], [whSby1.id, 25]] as [string, number][], price: 72000, hue: 45 },
      { code: "00005", name: "Kardus Polos 60x40", unit: "pcs", itemGroupId: igPack.id, stock: [[whJkt1.id, 500], [whJkt2.id, 800], [whSby1.id, 300]] as [string, number][], price: 3500, hue: 15 },
      { code: "00006", name: "Plastik Wrap 30cm", unit: "rol", itemGroupId: igPack.id, stock: [[whJkt1.id, 150], [whJkt2.id, 400], [whSby1.id, 100]] as [string, number][], price: 8500, hue: 170 },
      { code: "00007", name: "Botol PET 600ml", unit: "pcs", itemGroupId: igPack.id, stock: [[whJkt1.id, 600], [whJkt2.id, 1200], [whSby1.id, 350]] as [string, number][], price: 1200, hue: 200 },
      { code: "00008", name: "Sarden Kaleng 425g", unit: "kaleng", itemGroupId: igFin.id, stock: [[whJkt1.id, 85], [whSby1.id, 55]] as [string, number][], price: 23500, hue: 350 },
      { code: "00009", name: "Kecap Manis 620ml", unit: "botol", itemGroupId: igFin.id, stock: [[whJkt1.id, 95], [whSby1.id, 60]] as [string, number][], price: 18500, hue: 355 },
      { code: "00010", name: "Susu UHT 1L", unit: "pcs", itemGroupId: igFin.id, stock: [[whJkt1.id, 130], [whSby1.id, 90]] as [string, number][], price: 16500, hue: 210 },
      { code: "00011", name: "Baut M8x30", unit: "pcs", itemGroupId: igSp.id, stock: [[whJkt1.id, 1000], [whSby1.id, 500]] as [string, number][], price: 500, hue: 280 },
      { code: "00012", name: "Lampu LED 9W", unit: "pcs", itemGroupId: igSp.id, stock: [[whJkt1.id, 70], [whSby1.id, 40]] as [string, number][], price: 28000, hue: 45 },
    ];

    const seededItems = itemDefs.map((d) => ({
      id: nextId("itm"),
      code: d.code,
      name: d.name,
      itemGroupId: d.itemGroupId,
      hue: d.hue,
      uomId: uomByUnit.get(d.unit) ?? null,
    }));
    await tx.insert(items).values(seededItems);

    // Stock balance terpisah dari items.
    await tx.insert(stockBalances).values(
      seededItems.flatMap((itm) =>
        itemDefs
          .find((d) => d.code === itm.code)!
          .stock
          .map(([warehouseId, closingQty]) => ({
            id: nextId("stb"),
            balanceDate: sql`CURRENT_DATE`,
            warehouseId,
            itemId: itm.id,
            openingQty: 0,
            inQty: 0,
            outQty: 0,
            closingQty,
          }))
      )
    );

    const itemIdOf = (code: string) =>
      seededItems.find((i) => i.code === code)!.id;

    await tx.insert(barcodeFormats).values({
      id: nextId("fmt"),
      name: "Format Umum 11 Digit",
      description: "Format default: 2 digit grup item + 5 digit kode item + 4 digit urutan.",
      isActive: true,
      qtyPerFormat: true,
      uniqueBarcode: false,
      segments: [
        { id: "seg_01", field: "ITEM_GROUP", start: 1, end: 2 },
        { id: "seg_02", field: "ITEM_CODE", start: 3, end: 7 },
        { id: "seg_03", field: "SEQUENCE", start: 8, end: 11 },
      ],
    });

    // --- User tambahan ---
    const hash = await bcrypt.hash("admin123", 10);
    const admin2 = {
      id: nextId("usr"),
      name: "Budi Santoso",
      email: "budi@opname.id",
      passwordHash: hash,
      role: "role_admin",
      active: true,
      avatarHue: 160,
    };
    const staff1 = {
      id: nextId("usr"),
      name: "Siti Rahayu",
      email: "siti@opname.id",
      passwordHash: hash,
      role: "role_staff",
      active: true,
      avatarHue: 300,
    };
    await tx.insert(users).values([admin2, staff1]);

    // Akses branch/warehouse murni per role (diatur di Role Management).
    await tx.insert(branchAccesses).values([
      { id: nextId("bxa"), roleId: "role_admin", entityType: "BRANCH" as const, entityId: brJkt.id },
      { id: nextId("bxa"), roleId: "role_admin", entityType: "WAREHOUSE" as const, entityId: whJkt1.id },
      { id: nextId("bxa"), roleId: "role_admin", entityType: "WAREHOUSE" as const, entityId: whJkt2.id },
      { id: nextId("bxa"), roleId: "role_admin", entityType: "BRANCH" as const, entityId: brSby.id },
      { id: nextId("bxa"), roleId: "role_admin", entityType: "WAREHOUSE" as const, entityId: whSby1.id },
      { id: nextId("bxa"), roleId: "role_staff", entityType: "BRANCH" as const, entityId: brJkt.id },
      { id: nextId("bxa"), roleId: "role_staff", entityType: "WAREHOUSE" as const, entityId: whJkt1.id },
    ]);

    // --- Projects opname (4 tabel) ---
    const parent1 = { id: nextId("opj", daysAgo(120)), name: "Opname Tahunan 2025", mode: "COMPARE" as const, status: "APPROVED" as const, createdAt: daysAgo(120), updatedAt: daysAgo(90), deadline: daysAgo(90), createdBy: adminId };
    const parent2 = { id: nextId("opj", daysAgo(10)), name: "Opname Bulanan September", mode: "COMPARE" as const, status: "IN_PROGRESS" as const, createdAt: daysAgo(10), updatedAt: hoursAgo(3), deadline: daysAgo(-20), createdBy: admin2.id };
    const parent3 = { id: nextId("opj", daysAgo(6)), name: "Stocktake Gudang Surabaya", mode: "SCRATCH" as const, status: "IN_PROGRESS" as const, createdAt: daysAgo(6), updatedAt: daysAgo(1), deadline: daysAgo(-14), createdBy: adminId };
    const parent4 = { id: nextId("opj", daysAgo(2)), name: "Opname Awal Gudang Bahan Baku", mode: "COMPARE" as const, status: "DRAFT" as const, createdAt: daysAgo(2), updatedAt: daysAgo(2), deadline: daysAgo(-30), createdBy: adminId };
    await tx.insert(opnameProjects).values([parent1, parent2, parent3, parent4]);

    // Warehouse peserta per project (status per gudang).
    await tx.insert(opnameWarehouses).values([
      { id: nextId("opw", daysAgo(120)), opnameId: parent1.id, warehouseId: whJkt1.id, status: "COMPLETED" as const, startedAt: daysAgo(118), completedAt: daysAgo(99), createdAt: daysAgo(120) },
      { id: nextId("opw", daysAgo(10)), opnameId: parent2.id, warehouseId: whJkt1.id, status: "IN_PROGRESS" as const, startedAt: daysAgo(9), createdAt: daysAgo(10) },
      { id: nextId("opw", daysAgo(6)), opnameId: parent3.id, warehouseId: whSby1.id, status: "IN_PROGRESS" as const, startedAt: daysAgo(5), createdAt: daysAgo(6) },
      { id: nextId("opw", daysAgo(2)), opnameId: parent4.id, warehouseId: whJkt2.id, status: "PENDING" as const, createdAt: daysAgo(2) },
    ]);

    // --- Header scan (konsep stock_movements: DRAFT → POSTED/CANCELED) ---
    const locA01 = locJkt1[0].id;
    const locA02 = locJkt1[1].id;
    const sesAct = {
      id: nextId("ops", hoursAgo(3)),
      opnameId: parent2.id,
      scannedBy: staff1.id,
      status: "DRAFT" as const,
      startedAt: hoursAgo(3),
      createdAt: hoursAgo(3),
      updatedAt: hoursAgo(3),
    };
    const sesCls = {
      id: nextId("ops", hoursAgo(26)),
      opnameId: parent2.id,
      scannedBy: admin2.id,
      status: "POSTED" as const,
      startedAt: hoursAgo(26),
      completedAt: hoursAgo(24),
      createdAt: hoursAgo(26),
      updatedAt: hoursAgo(24),
    };
    const sesFinal = {
      id: nextId("ops", daysAgo(100)),
      opnameId: parent1.id,
      scannedBy: staff1.id,
      status: "POSTED" as const,
      startedAt: daysAgo(100),
      completedAt: daysAgo(99),
      createdAt: daysAgo(100),
      updatedAt: daysAgo(99),
    };
    await tx.insert(opnameScans).values([sesAct, sesCls, sesFinal]);

    // --- Scan details per barcode ---
    const igOf = (code: string) =>
      itemDefs.find((x) => x.code === code)?.itemGroupId ?? "";
    const igCode = (itemGroupId: string) =>
      itemGroupId === igRaw.id ? "01" : itemGroupId === igPack.id ? "02" : itemGroupId === igFin.id ? "03" : "04";

    const scans: {
      scanId: string;
      opnameId: string;
      warehouseId: string;
      locationId: string;
      itemCode: string;
      qty: number;
      minutesAgo: number;
      source: "SCANNER" | "CAMERA" | "MANUAL";
    }[] = [
      // scan aktif A01 — progress berjalan
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00001", qty: 1, minutesAgo: 170, source: "SCANNER" },
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00002", qty: 1, minutesAgo: 165, source: "SCANNER" },
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00003", qty: 2, minutesAgo: 160, source: "SCANNER" },
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00004", qty: 1, minutesAgo: 150, source: "CAMERA" },
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00008", qty: 1, minutesAgo: 130, source: "SCANNER" },
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00009", qty: 1, minutesAgo: 90, source: "SCANNER" },
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00011", qty: 3, minutesAgo: 45, source: "MANUAL" },
      { scanId: sesAct.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00012", qty: 1, minutesAgo: 20, source: "SCANNER" },
      // scan ter-post A02
      { scanId: sesCls.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA02, itemCode: "00005", qty: 1, minutesAgo: 1560, source: "SCANNER" },
      { scanId: sesCls.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA02, itemCode: "00006", qty: 1, minutesAgo: 1550, source: "SCANNER" },
      { scanId: sesCls.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA02, itemCode: "00007", qty: 2, minutesAgo: 1530, source: "CAMERA" },
      { scanId: sesCls.id, opnameId: parent2.id, warehouseId: whJkt1.id, locationId: locA02, itemCode: "00010", qty: 1, minutesAgo: 1490, source: "SCANNER" },
      // scan project final
      { scanId: sesFinal.id, opnameId: parent1.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00001", qty: 1, minutesAgo: 144000, source: "SCANNER" },
      { scanId: sesFinal.id, opnameId: parent1.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00002", qty: 1, minutesAgo: 143900, source: "SCANNER" },
      { scanId: sesFinal.id, opnameId: parent1.id, warehouseId: whJkt1.id, locationId: locA01, itemCode: "00003", qty: 1, minutesAgo: 143800, source: "SCANNER" },
    ];

    await tx.insert(opnameScanDetails).values(
      scans.map((s) => {
        const scannedAt = new Date(Date.now() - s.minutesAgo * 60_000);
        const cCode = igCode(igOf(s.itemCode));
        const serial = String(s.minutesAgo).padStart(4, "0");
        const raw = barcode(cCode, s.itemCode, serial);
        return {
          id: nextId("osd", scannedAt),
          scanId: s.scanId,
          opnameId: s.opnameId,
          warehouseId: s.warehouseId,
          locationId: s.locationId,
          itemId: itemIdOf(s.itemCode),
          barcode: raw,
          parsed: parsedFor(cCode, s.itemCode, serial),
          quantity: s.qty,
          qtyMode: "AUTO" as const,
          source: s.source,
          scannedAt,
        };
      })
    );
  });

  console.log("Dummy data berhasil ditambahkan.");
  console.log("Login tambahan: budi@opname.id / admin123 (ADMIN), siti@opname.id / admin123 (STAFF)");
}

async function main() {
  const adminId = await ensureAdmin();
  await ensureSystemRoles();
  await seedDummyData(adminId);
  console.log(`Login: ${EMAIL} / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("Seed gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
