// @ts-nocheck
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "./pool";
import {
  branches,
  branchAccesses,
  documentTypes,
  documentSeries,
  roles,
  users,
} from "./schema";

const EMAIL = "admin@opname.id";
const PASSWORD = "admin";

async function ensureSystemRoles(): Promise<Map<string, number>> {
  const existing = await db.select().from(roles);
  if (existing.length > 0) {
    const map = new Map<string, number>();
    existing.forEach((r) => map.set(r.code ?? r.name, r.id));
    return map;
  }
  const [sysAdmin] = await db.insert(roles).values({ name: "Administrator", code: "SYS_ADMIN", isSystem: true, active: true }).returning();
  const [admin] = await db.insert(roles).values({ name: "Admin", code: "ADMIN", isSystem: false, active: true }).returning();
  const [staff] = await db.insert(roles).values({ name: "Staff Gudang", code: "STAFF", isSystem: false, active: true }).returning();
  console.log(`Roles created: SYS_ADMIN=${sysAdmin.id}, ADMIN=${admin.id}, STAFF=${staff.id}`);
  const map = new Map<string, number>();
  map.set("SYS_ADMIN", sysAdmin.id);
  map.set("ADMIN", admin.id);
  map.set("STAFF", staff.id);
  // also map legacy codes
  map.set("role_sys_admin", sysAdmin.id);
  map.set("role_admin", admin.id);
  map.set("role_staff", staff.id);
  return map;
}

async function ensureAdmin(roleMap: Map<string, number>) {
  const sysAdminId = roleMap.get("SYS_ADMIN") ?? roleMap.get("role_sys_admin");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const [existing] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (existing) {
    await db.update(users).set({ name: "Administrator", passwordHash, roleId: sysAdminId!, active: true }).where(eq(users.id, existing.id));
    console.log(`Admin updated: ${existing.publicId} (internal ${existing.id})`);
    return existing.id;
  }
  const [created] = await db.insert(users).values({
    name: "Administrator",
    email: EMAIL,
    passwordHash,
    roleId: sysAdminId!,
    active: true,
    avatarHue: 220,
  }).returning();
  console.log(`Admin created: ${created.publicId} (internal ${created.id})`);
  return created.id;
}

async function ensureDocumentTypes() {
  const existing = await db.select().from(documentTypes);
  if (existing.length > 0) {
    console.log(`Document types already exist: ${existing.length}`);
    return;
  }
  const types = [
    { name: "Purchase Order", prefix: "PO", description: "Pesanan Pembelian" },
    { name: "Sales Order", prefix: "SO", description: "Pesanan Penjualan" },
    { name: "Goods Receipt", prefix: "GR", description: "Penerimaan Barang" },
    { name: "Delivery", prefix: "DLV", description: "Pengiriman" },
    { name: "Stock Movement", prefix: "SMV", description: "Mutasi Stok" },
    { name: "Stock Opname Count", prefix: "SOC", description: "Hitung Stok Opname" },
    { name: "Opname Project", prefix: "OPJ", description: "Project Opname" },
  ];
  for (const t of types) {
    const [inserted] = await db.insert(documentTypes).values({ name: t.name, description: t.description, isActive: true }).returning();
    // create default series for each type
    const prefix = t.prefix;
    const format = "{PREFIX}-{YYMM}-{SEQ:4}";
    await db.insert(documentSeries).values({
      documentTypeId: inserted.id,
      name: `Default ${t.name}`,
      prefix,
      format,
      padding: 4,
      resetPolicy: "MONTHLY",
      isDefault: true,
      branchSpecific: false,
      isActive: true,
    });
    console.log(`Document type ${t.name} + series Default created`);
  }
  // Additional series for Stock Movement kinds
  const [smvType] = await db.select().from(documentTypes).where(eq(documentTypes.name, "Stock Movement")).limit(1);
  if (smvType) {
    const extra = [
      { prefix: "RCV", name: "Receipt" },
      { prefix: "ISS", name: "Issue" },
      { prefix: "TRF", name: "Transfer" },
    ];
    for (const e of extra) {
      const [exists] = await db.select().from(documentSeries).where(eq(documentSeries.name, e.name)).limit(1);
      if (!exists) {
        await db.insert(documentSeries).values({
          documentTypeId: smvType.id,
          name: e.name,
          prefix: e.prefix,
          format: "{PREFIX}-{YYMM}-{SEQ:4}",
          padding: 4,
          resetPolicy: "MONTHLY",
          isDefault: false,
          branchSpecific: false,
          isActive: true,
        });
        console.log(`Extra series ${e.name} created`);
      }
    }
  }
}

async function ensureBranchAccessForAdmin(adminId: number, roleMap: Map<string, number>) {
  // Ensure admin role has no branch restriction (isSystem bypass), but for non-system we add default?
  // Skip for sys admin
}

async function main() {
  console.log("Seeding start...");
  const roleMap = await ensureSystemRoles();
  const adminId = await ensureAdmin(roleMap);
  await ensureDocumentTypes();
  // Note: dummy data intentionally not seeded per request (data dummy di hapus)
  // If you need to wipe old dummy data, uncomment truncate section below
  // await db.execute(sql`TRUNCATE ... CASCADE`)
  console.log(`Seeding done. Login: ${EMAIL} / ${PASSWORD}`);
}

main().catch((e) => {
  console.error("Seed gagal:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
}).finally(async () => { await pool.end(); });
