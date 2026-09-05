// @ts-nocheck
// Ganti permission kolom: hapus "opname.variance.column", tambah "settings.columnWidth".
// role_admin: semua aksi; role_staff: view.
import { eq } from "drizzle-orm";
import { db, pool } from "./pool";
import { rolePermissions } from "./schema";

async function main() {
  await db
    .delete(rolePermissions)
    .where(eq(rolePermissions.menu, "opname.variance.column"));
  console.log('Permission "opname.variance.column" dihapus.');

  const existing = await db.select({ id: rolePermissions.id }).from(rolePermissions);
  let max = existing.reduce(
    (m, x) => {
      const v = Number(x.id.replace("pm_", ""));
      return Number.isFinite(v) && v > m ? v : m;
    },
    0
  );
  const seen = new Set(existing.map((x) => x.id));

  const rows: { id: string; roleId: string; menu: string; action: string }[] = [];
  const push = (roleId: string, action: string) => {
    max++;
    const id = `pm_${String(max).padStart(3, "0")}`;
    if (seen.has(id)) return;
    seen.add(id);
    rows.push({ id, roleId, menu: "settings.columnWidth", action });
  };

  for (const action of ["view", "create", "update", "delete"]) {
    push("role_admin", action);
  }
  push("role_staff", "view");

  if (rows.length) {
    await db.insert(rolePermissions).values(rows);
    console.log(`${rows.length} permission "settings.columnWidth" ditambahkan.`);
  } else {
    console.log("Tidak ada permission baru untuk ditambahkan.");
  }
}

main()
  .catch((e) => {
    console.error("Gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
