import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Env belum lengkap.");
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EMAIL = "root@opname.id";
const PASSWORD = "nurhidayat";
const NAME = "Root";
const ROLE = "ADMINISTRATOR";

async function main() {
  const { data: existing, error: listErr } = await sb.auth.admin.listUsers();
  if (listErr) throw listErr;

  const found = existing.users.find((u) => u.email === EMAIL);
  let userId;

  if (found) {
    console.log("User root sudah ada, update profile...");
    userId = found.id;
  } else {
    const { data, error } = await sb.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME },
    });
    if (error) throw error;
    userId = data.user.id;
    console.log("User root dibuat.");
  }

  try {
    const { error: upsertErr } = await sb.from("profiles").upsert(
      {
        id: userId,
        name: NAME,
        email: EMAIL,
        role: ROLE,
        active: true,
        avatar_hue: 260,
      },
      { onConflict: "id" }
    );
    if (upsertErr) throw upsertErr;
    console.log(`Login: ${EMAIL} / ${PASSWORD}`);
    console.log(`Role: ${ROLE}`);
  } catch (e) {
    console.error("Gagal set role:", e.message);
    console.log("\nJalankan SQL ini dulu di Supabase SQL Editor:");
    console.log("  ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;");
    console.log("  ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('ADMINISTRATOR','ADMIN','STAFF'));");
    console.log("\nLalu jalankan ulang: node --env-file=.env scripts/create-root.mjs");
  }
}

main().catch((e) => {
  console.error("Gagal:", e.message);
  process.exit(1);
});
