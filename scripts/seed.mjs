// Seed demo data ke Supabase.
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

const PASSWORD = "StockOpname123!";

const USERS = [
  { key: "usr_rk", name: "Raka Wibowo", email: "raka.w@opname.id", role: "ADMIN", branchId: "br_pbg", warehouseId: null, active: true, avatarHue: 22 },
  { key: "usr_np", name: "Nadia Putri", email: "nadia.p@opname.id", role: "APPROVER", branchId: "br_pbg", warehouseId: null, active: true, avatarHue: 280 },
  { key: "usr_dp", name: "Dimas Prasetyo", email: "dimas.p@opname.id", role: "STAFF", branchId: "br_pbg", warehouseId: "wh_bnd01", active: true, avatarHue: 160 },
  { key: "usr_sd", name: "Sari Dewi", email: "sari.d@opname.id", role: "STAFF", branchId: "br_pbg", warehouseId: "wh_bnd02", active: true, avatarHue: 40 },
  { key: "usr_fn", name: "Fajar Nugroho", email: "fajar.n@opname.id", role: "STAFF", branchId: "br_pjs", warehouseId: "wh_jkt01", active: true, avatarHue: 200 },
  { key: "usr_mt", name: "Maya Tiara", email: "maya.t@opname.id", role: "STAFF", branchId: "br_pbg", warehouseId: "wh_bnd01", active: false, avatarHue: 110 },
];

async function ensureUser(u) {
  const { data, error } = await sb.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: u.name },
  });
  if (!error) return data.user;

  if (/already been registered|already exists/i.test(error.message)) {
    const { data: list, error: listErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listErr) throw listErr;
    const found = list.users.find((x) => x.email === u.email);
    if (found) return found;
  }
  throw error;
}

const userIds = {};
for (const u of USERS) {
  const user = await ensureUser(u);
  userIds[u.key] = user.id;
  const { error } = await sb.from("profiles").upsert(
    {
      id: user.id,
      name: u.name,
      email: u.email,
      role: u.role,
      branch_id: u.branchId,
      warehouse_id: u.warehouseId,
      active: u.active,
      avatar_hue: u.avatarHue,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
  console.log("profile:", u.email, user.id);
}

const BATCH = {
  branches: [
    { id: "br_pbg", code: "PBG", name: "Pusat Bandung", city: "Bandung" },
    { id: "br_pjs", code: "PJS", name: "Pusat Jakarta", city: "Jakarta" },
  ],
  warehouses: [
    { id: "wh_bnd01", branch_id: "br_pbg", code: "BND-01", name: "Gudang Pusat Bandung" },
    { id: "wh_bnd02", branch_id: "br_pbg", code: "BND-02", name: "Gudang Cargo Bandung" },
    { id: "wh_jkt01", branch_id: "br_pjs", code: "JKT-01", name: "Gudang Pusat Jakarta" },
  ],
  locations: [
    { id: "loc_h1a1", warehouse_id: "wh_bnd01", code: "H1 AB1", name: "Rak H1, Blok A, Lorong 1" },
    { id: "loc_h1a2", warehouse_id: "wh_bnd01", code: "H1 AB2", name: "Rak H1, Blok A, Lorong 2" },
    { id: "loc_h1b1", warehouse_id: "wh_bnd01", code: "H1 AC1", name: "Rak H1, Blok C, Lorong 1" },
    { id: "loc_h2d1", warehouse_id: "wh_bnd01", code: "H2 BD1", name: "Rak H2, Blok D, Lorong 1" },
    { id: "loc_cg1", warehouse_id: "wh_bnd02", code: "C1 A1", name: "Cargo Area 1" },
    { id: "loc_cg2", warehouse_id: "wh_bnd02", code: "C1 A2", name: "Cargo Area 2" },
    { id: "loc_j1", warehouse_id: "wh_jkt01", code: "J1 AA1", name: "Rak J1, Blok A" },
    { id: "loc_j2", warehouse_id: "wh_jkt01", code: "J2 BB1", name: "Rak J2, Blok B" },
  ],
  categories: [
    { id: "cat_bb", code: "01", name: "Bahan Baku" },
    { id: "cat_mm", code: "02", name: "Makanan & Minuman" },
    { id: "cat_pk", code: "03", name: "Produk Kesehatan" },
    { id: "cat_lg", code: "04", name: "Logistik & Peralatan" },
  ],
};

const items = [
  ["itm_00001", "00001", "Kopi Arabica Gayo 250g", "pcs", "cat_mm", { wh_bnd01: 48, wh_bnd02: 12, wh_jkt01: 30 }, 38500, 22],
  ["itm_00002", "00002", "Teh Hitam Sindoro 100s", "dus", "cat_mm", { wh_bnd01: 15, wh_bnd02: 6, wh_jkt01: 22 }, 24000, 150],
  ["itm_00003", "00003", "Minyak Kelapa Sawit 2L", "pcs", "cat_mm", { wh_bnd01: 96, wh_bnd02: 40, wh_jkt01: 74 }, 46500, 38],
  ["itm_00004", "00004", "Beras Premium 5kg", "karung", "cat_mm", { wh_bnd01: 34, wh_bnd02: 18, wh_jkt01: 51 }, 82000, 90],
  ["itm_00005", "00005", "Tepung Terigu Cakra 1kg", "karung", "cat_bb", { wh_bnd01: 60, wh_bnd02: 25, wh_jkt01: 0 }, 15500, 48],
  ["itm_00006", "00006", "Gula Pasir RCS 1kg", "karung", "cat_bb", { wh_bnd01: 27, wh_bnd02: 14, wh_jkt01: 39 }, 18000, 200],
  ["itm_00007", "00007", "Masker Medis 3 Ply 50s", "dus", "cat_pk", { wh_bnd01: 8, wh_bnd02: 2, wh_jkt01: 12 }, 67000, 260],
  ["itm_00008", "00008", "Hand Sanitizer 60ml", "pcs", "cat_pk", { wh_bnd01: 142, wh_bnd02: 55, wh_jkt01: 0 }, 29000, 330],
  ["itm_00009", "00009", "Kardus Kemasan E-flute", "lembar", "cat_lg", { wh_bnd01: 0, wh_bnd02: 500, wh_jkt01: 320 }, 4800, 30],
  ["itm_00010", "00010", "Stretch Film Wrap 50cm", "roll", "cat_lg", { wh_bnd01: 22, wh_bnd02: 8, wh_jkt01: 14 }, 96000, 190],
].map(([id, code, name, unit, category_id, system_stock, price, hue]) => ({
  id, code, name, unit, category_id, system_stock, price, hue,
}));

const barcodeFormats = [
  {
    id: "fmt_retail",
    name: "Retail Produk",
    description:
      "Segmen 1-2 kode kategori, 3-8 tanggal produksi (YYMMDD), 9-13 kode item. Qty diambil otomatis dari master item.",
    is_active: true,
    qty_per_format: true,
    segments: [
      { id: "seg_r1", field: "CATEGORY", start: 1, end: 2 },
      { id: "seg_r2", field: "DATE", start: 3, end: 8 },
      { id: "seg_r3", field: "ITEM_CODE", start: 9, end: 13 },
    ],
    updated_at: "2026-01-12T09:00:00.000Z",
  },
  {
    id: "fmt_pallet",
    name: "Pallet Logistik",
    description:
      "Segmen 1-2 kode kategori, 3-7 kode item, 8-12 nomor urut pallet. Qty diinput manual setiap scan karena satu kode barang bisa beda qty.",
    is_active: true,
    qty_per_format: false,
    segments: [
      { id: "seg_p1", field: "CATEGORY", start: 1, end: 2 },
      { id: "seg_p2", field: "ITEM_CODE", start: 3, end: 7 },
      { id: "seg_p3", field: "SEQUENCE", start: 8, end: 12 },
    ],
    updated_at: "2026-02-03T11:30:00.000Z",
  },
];

const projects = [
  ["prj_feb", "Opname Februari 2026", "br_pbg", "wh_bnd01", "COMPARE", "APPROVED", "2026-02-01T07:00:00.000Z", "usr_rk"],
  ["prj_mar", "Opname Bulanan Maret", "br_pbg", "wh_bnd01", "COMPARE", "IN_PROGRESS", "2026-03-02T07:15:00.000Z", "usr_rk"],
  ["prj_cargo", "Opname Gudang Cargo", "br_pbg", "wh_bnd02", "COMPARE", "PENDING_APPROVAL", "2026-03-05T09:30:00.000Z", "usr_np"],
  ["prj_jkt", "Stock Count Cepat JKT", "br_pjs", "wh_jkt01", "COMPARE", "DRAFT", "2026-03-10T13:00:00.000Z", "usr_fn"],
  ["prj_recount", "Recount Pallet Tepung", "br_pbg", "wh_bnd01", "SCRATCH", "REJECTED", "2026-02-20T08:00:00.000Z", "usr_rk"],
].map(([id, name, branch_id, warehouse_id, mode, status, created_at, created_by]) => ({
  id, name, branch_id, warehouse_id, mode, status, created_at, created_by: userIds[created_by],
}));

const scanSessions = [
  ["ses_feb1", "prj_feb", "loc_h1a1", "usr_dp", "2026-02-01T09:00:00.000Z", "2026-02-01T11:40:00.000Z", "CLOSED"],
  ["ses_feb2", "prj_feb", "loc_h1a2", "usr_dp", "2026-02-01T13:00:00.000Z", "2026-02-01T15:20:00.000Z", "CLOSED"],
  ["ses_mar1", "prj_mar", "loc_h1a1", "usr_dp", "2026-03-03T09:00:00.000Z", null, "ACTIVE"],
  ["ses_cg1", "prj_cargo", "loc_cg1", "usr_sd", "2026-03-06T10:00:00.000Z", "2026-03-06T12:30:00.000Z", "CLOSED"],
].map(([id, project_id, location_id, scanned_by, started_at, ended_at, status]) => ({
  id, project_id, location_id, scanned_by: userIds[scanned_by], started_at, ended_at, status,
}));

const scanRecords = [
  ["rec_1", "ses_feb1", "prj_feb", "0226020100001", "itm_00001", { CATEGORY: "02", DATE: "260201", ITEM_CODE: "00001" }, 1, "AUTO", "SCANNER", "loc_h1a1", "2026-02-01T09:04:00.000Z"],
  ["rec_2", "ses_feb1", "prj_feb", "0226020100001", "itm_00001", { CATEGORY: "02", DATE: "260201", ITEM_CODE: "00001" }, 1, "AUTO", "SCANNER", "loc_h1a1", "2026-02-01T09:05:00.000Z"],
  ["rec_3", "ses_feb1", "prj_feb", "0226020100003", "itm_00003", { CATEGORY: "02", DATE: "260201", ITEM_CODE: "00003" }, 1, "AUTO", "SCANNER", "loc_h1a1", "2026-02-01T09:11:00.000Z"],
  ["rec_4", "ses_feb1", "prj_feb", "0226020100002", "itm_00002", { CATEGORY: "02", DATE: "260201", ITEM_CODE: "00002" }, 1, "AUTO", "SCANNER", "loc_h1a1", "2026-02-01T09:22:00.000Z"],
  ["rec_5", "ses_feb2", "prj_feb", "0226020100001", "itm_00001", { CATEGORY: "02", DATE: "260201", ITEM_CODE: "00001" }, 1, "AUTO", "SCANNER", "loc_h1a2", "2026-02-01T13:12:00.000Z"],
  ["rec_6", "ses_feb2", "prj_feb", "0226020100005", "itm_00005", { CATEGORY: "01", DATE: "260201", ITEM_CODE: "00005" }, 1, "AUTO", "SCANNER", "loc_h1a2", "2026-02-01T13:18:00.000Z"],
  ["rec_7", "ses_mar1", "prj_mar", "0226030300004", "itm_00004", { CATEGORY: "02", DATE: "260303", ITEM_CODE: "00004" }, 1, "AUTO", "SCANNER", "loc_h1a1", "2026-03-03T09:10:00.000Z"],
  ["rec_8", "ses_mar1", "prj_mar", "0226030300006", "itm_00006", { CATEGORY: "01", DATE: "260303", ITEM_CODE: "00006" }, 1, "AUTO", "CAMERA", "loc_h1a1", "2026-03-03T09:34:00.000Z"],
  ["rec_9", "ses_cg1", "prj_cargo", "030000900125", "itm_00009", { CATEGORY: "04", ITEM_CODE: "00009", SEQUENCE: "00125" }, 40, "MANUAL", "SCANNER", "loc_cg1", "2026-03-06T10:14:00.000Z"],
  ["rec_10", "ses_cg1", "prj_cargo", "030000900126", "itm_00009", { CATEGORY: "04", ITEM_CODE: "00009", SEQUENCE: "00126" }, 40, "MANUAL", "SCANNER", "loc_cg1", "2026-03-06T10:16:00.000Z"],
  ["rec_11", "ses_cg1", "prj_cargo", "030000500222", "itm_00005", { CATEGORY: "01", ITEM_CODE: "00005", SEQUENCE: "00222" }, 25, "MANUAL", "SCANNER", "loc_cg1", "2026-03-06T10:31:00.000Z"],
].map(([id, session_id, project_id, barcode, item_id, parsed, quantity, qty_mode, source, location_id, scanned_at]) => ({
  id, session_id, project_id, barcode, item_id, parsed, quantity, qty_mode, source, location_id, scanned_at,
}));

const opnameEntries = [
  ["ent_f1", "prj_feb", "itm_00001", "loc_h1a1", 10, 8],
  ["ent_f2", "prj_feb", "itm_00001", "loc_h1a2", 15, 16],
  ["ent_f3", "prj_feb", "itm_00002", "loc_h1a1", 15, 15],
  ["ent_f4", "prj_feb", "itm_00003", "loc_h1a1", 40, 39],
  ["ent_f5", "prj_feb", "itm_00005", "loc_h1a2", 30, 32],
  ["ent_c1", "prj_cargo", "itm_00009", "loc_cg1", 500, 480],
  ["ent_c2", "prj_cargo", "itm_00005", "loc_cg1", 25, 25],
  ["ent_r1", "prj_recount", "itm_00005", "loc_h1a2", 30, 20],
].map(([id, project_id, item_id, location_id, system_qty, counted_qty]) => ({
  id, project_id, item_id, location_id, system_qty, counted_qty,
}));

const approvals = [
  ["apr_1", "prj_feb", "usr_np", "APPROVED", "Selisih kopi telah dikonfirmasi ke divisi pembelian.", "2026-02-02T08:00:00.000Z"],
  ["apr_2", "prj_recount", "usr_np", "REJECTED", "Hasil recount tidak masuk akal, perlu pengecekan ulang di lokasi H2 BD1.", "2026-02-21T10:00:00.000Z"],
].map(([id, project_id, approved_by, status, note, at]) => ({
  id, project_id, approved_by: userIds[approved_by], status, note, at,
}));

const tables = {
  branches: BATCH.branches,
  warehouses: BATCH.warehouses,
  locations: BATCH.locations,
  categories: BATCH.categories,
  items,
  barcode_formats: barcodeFormats,
  projects,
  scan_sessions: scanSessions,
  scan_records: scanRecords,
  opname_entries: opnameEntries,
  approvals,
};

for (const [table, rows] of Object.entries(tables)) {
  const { error } = await sb.from(table).upsert(rows, { onConflict: "id" });
  if (error) {
    console.error(`upsert ${table} gagal:`, error.message);
    process.exit(1);
  }
  console.log(`upsert ${table}: ${rows.length} baris`);
}

console.log("\nSeed selesai.");
console.log("Akun demo (password: " + PASSWORD + "):");
for (const u of USERS) {
  console.log("  " + u.email + "  [" + u.role + "]");
}
