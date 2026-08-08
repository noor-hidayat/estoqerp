// Inisialisasi aplikasi kosong ke Supabase.
// Prasyarat:
//  1. Jalankan supabase/schema.sql di Supabase SQL Editor.
//  2. Isi VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, dan
//     VITE_SUPABASE_SERVICE_ROLE_KEY di .env
//  3. Jalankan: node --env-file=.env scripts/seed.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Env belum lengkap. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_SERVICE_ROLE_KEY di .env");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "admin";
const ADMIN_EMAIL = "admin@opname.id";
const ADMIN_NAME = "Administrator";

async function ensureAdminUser() {
  const { data: currentUsers, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;

  let adminUser = currentUsers.users.find((user) => user.email === ADMIN_EMAIL);
  if (!adminUser) {
    const { data, error } = await sb.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME },
    });
    if (error) throw error;
    adminUser = data.user;
  }

  return adminUser;
}

async function clearTable(tableName) {
  const { error } = await sb.from(tableName).delete().not("id", "is", null);
  if (error) throw error;
}

async function main() {
  const adminUser = await ensureAdminUser();

  const tables = [
    "scan_records",
    "opname_entries",
    "scan_sessions",
    "projects",
    "items",
    "locations",
    "warehouses",
    "branches",
    "categories",
    "barcode_formats",
    "profiles",
  ];

  for (const table of tables) {
    await clearTable(table);
  }

  const { error: profileError } = await sb.from("profiles").upsert(
    {
      id: adminUser.id,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: "ADMINISTRATOR",
      branch_id: null,
      warehouse_id: null,
      active: true,
      avatar_hue: 220,
    },
    { onConflict: "id" }
  );
  if (profileError) throw profileError;

  console.log("Seed selesai. Aplikasi siap dengan 1 admin.");
  console.log(`Akun admin: ${ADMIN_EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
}

main().catch((error) => {
  console.error("Gagal menginisialisasi data:", error.message);
  process.exit(1);
});
