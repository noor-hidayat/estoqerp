// Migrasi RBAC: setup role sistem, konversi users.role dari enum lama ke id role baru.
// Plus: akses entitas disederhanakan jadi PER ROLE — data role_accesses +
// user_accesses digantikan tabel branch_access; ekspansi permission coarse → granular.
import { eq, ne, sql } from "drizzle-orm";
import { db, pool } from "./pool";
import { roles, users, rolePermissions } from "./schema";
import { expandPermissions } from "./rbac-menus";

async function expandRolePermissions(roleId: string): Promise<number> {
  const perms = await db
    .select({ menu: rolePermissions.menu, action: rolePermissions.action })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));

  const hasSubmenu = perms.some((p) => p.menu.includes("."));
  const isDefault = roleId === "role_admin" || roleId === "role_staff";
  if (hasSubmenu && !isDefault) return 0;

  const toAdd = expandPermissions(perms);
  if (toAdd.length === 0) return 0;

  const rows = await db.select({ id: rolePermissions.id }).from(rolePermissions);
  let seq = rows.reduce((m, r) => {
    if (!r.id.startsWith("pm_")) return m;
    const n = Number(r.id.slice(3));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);

  const insertRows = toAdd.map((p) => ({
    id: `pm_${String(++seq).padStart(3, "0")}`,
    roleId,
    ...p,
  }));
  await db.insert(rolePermissions).values(insertRows);
  return insertRows.length;
}

async function main() {
  // 1) Pastikan role sistem ada.
  const [anyRole] = await db.select({ id: roles.id }).from(roles).limit(1);
  if (!anyRole) {
    await db.insert(roles).values([
      { id: "role_sys_admin", name: "Administrator", isSystem: true, active: true },
      { id: "role_admin", name: "Admin", isSystem: false, active: true },
      { id: "role_staff", name: "Staff Gudang", isSystem: false, active: true },
    ]);
    console.log("Role sistem dibuat: role_sys_admin, role_admin, role_staff");
  } else {
    console.log("Role sistem sudah ada.");
  }

  // 1b) Hanya role_sys_admin yang boleh isSystem (bypass permission).
  // Role lain (role_admin, role_staff, role kustom) WAJIB dicek permission.
  const res = await db
    .update(roles)
    .set({ isSystem: false })
    .where(ne(roles.id, "role_sys_admin"))
    .returning({ id: roles.id });
  if (res.length > 0) {
    console.log(`${res.length} role non-administrator dipaksa isSystem=false.`);
  }

  // 2) Konversi users.role dari enum lama ke id role.
  const mapping: Record<string, string> = {
    ADMINISTRATOR: "role_sys_admin",
    ADMIN: "role_admin",
    STAFF: "role_staff",
  };
  let updated = 0;
  const allUsers = await db.select({ id: users.id, role: users.role }).from(users);
  for (const u of allUsers) {
    const newRole = mapping[u.role] ?? u.role;
    if (newRole !== u.role) {
      await db.update(users).set({ role: newRole }).where(eq(users.id, u.id));
      updated += 1;
    }
  }
  console.log(`${updated} user di-update role-nya.`);

  // 3) Ekspansi permission coarse → granular (submenu digate permission sendiri).
  const allRoles = await db
    .select({ id: roles.id })
    .from(roles)
    .where(ne(roles.id, "role_sys_admin"));
  let totalAdded = 0;
  for (const r of allRoles) {
    const added = await expandRolePermissions(r.id);
    if (added > 0) {
      console.log(`Role ${r.id}: +${added} permission submenu ditambahkan.`);
      totalAdded += added;
    }
  }
  if (totalAdded === 0) console.log("Tidak ada permission yang perlu diekspansi.");

  // 3b) Pastikan semua role non-administrator punya akses view menu "ai"
  // (AI Assistant tersedia untuk semua user login).
  const aiTargets = await db
    .select({ id: roles.id })
    .from(roles)
    .where(ne(roles.id, "role_sys_admin"));
  for (const r of aiTargets) {
    const [existing] = await db
      .select({ id: rolePermissions.id })
      .from(rolePermissions)
      .where(
        sql`${rolePermissions.roleId} = ${r.id} AND ${rolePermissions.menu} = 'ai' AND ${rolePermissions.action} = 'view'`
      )
      .limit(1);
    if (existing) continue;
    const rows = await db.select({ id: rolePermissions.id }).from(rolePermissions);
    let seq = rows.reduce((m, r2) => {
      if (!r2.id.startsWith("pm_")) return m;
      const n = Number(r2.id.slice(3));
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    await db.insert(rolePermissions).values({
      id: `pm_${String(++seq).padStart(3, "0")}`,
      roleId: r.id,
      menu: "ai",
      action: "view",
    });
    console.log(`Role ${r.id}: permission ai:view ditambahkan.`);
  }

  // 4) Akses entitas murni per role: role_accesses + user_accesses → branch_access.
  const branchAccess = `
    CREATE TABLE IF NOT EXISTS "branch_access" (
      "id" text PRIMARY KEY NOT NULL,
      "role_id" text NOT NULL,
      "entity_type" text NOT NULL,
      "entity_id" text NOT NULL
    );
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_access_role_id_roles_id_fk') THEN
        ALTER TABLE "branch_access" ADD CONSTRAINT "branch_access_role_id_roles_id_fk"
          FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade;
      END IF;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS "uq_branch_access"
      ON "branch_access" USING btree ("role_id","entity_type","entity_id");
    CREATE INDEX IF NOT EXISTS "idx_branch_access_role"
      ON "branch_access" USING btree ("role_id");
    DO $$ BEGIN
      IF to_regclass('public.role_accesses') IS NOT NULL THEN
        INSERT INTO "branch_access" ("id", "role_id", "entity_type", "entity_id")
        SELECT "id", "role_id", "entity_type", "entity_id" FROM "role_accesses"
        ON CONFLICT DO NOTHING;
      END IF;
    END $$;
    DROP TABLE IF EXISTS "user_accesses";
    DROP TABLE IF EXISTS "role_accesses";
  `;
  await db.execute(sql.raw(branchAccess));
  console.log("Akses entitas digabung ke tabel branch_access (murni per role).");

  console.log("Selesai — akses branch/warehouse diatur lewat Role Management.");
}

main()
  .catch((e) => {
    console.error("Migrasi RBAC gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
