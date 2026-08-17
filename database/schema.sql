-- ===========================================================================
-- LokaWMS — Skema lengkap PostgreSQL (referensi untuk setup manual)
--
-- Migrasi resmi dikelola dengan Drizzle ORM:
--   cd backend && npm run db:generate && npm run db:migrate
-- Sumber kebenaran kode: backend/src/db/schema.ts
--
-- Konvensi:
--   * Primary key: text, format "{prefix}_NNN" atau "{prefix}_{uuid}"
--   * Timestamp: timestamptz not null default now()
--   * Foreign key polos, on delete sesuai perilaku aplikasi
--
-- Status tabel:
--   [AKTIF]  dipakai oleh kode aplikasi saat ini
--   [BARU]   belum dipakai kode — disiapkan untuk fitur berikutnya
--   [LEGACY] masih dipakai, direncanakan diganti struktur [BARU] opname
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- AUTH
-- ---------------------------------------------------------------------------
-- [AKTIF]
create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'role_sys_admin',
  active boolean not null default true,
  avatar_hue integer not null default 200,
  created_at timestamptz not null default now()
);

-- [AKTIF]
create table if not exists refresh_tokens (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RBAC: role, permission, akses entitas, preferensi user, konfigurasi AI
-- ---------------------------------------------------------------------------
-- [AKTIF]
create table if not exists roles (
  id text primary key,
  name text not null,
  is_system boolean not null default false,
  active boolean not null default true
);

-- [AKTIF]
create table if not exists role_permissions (
  id text primary key,
  role_id text not null references roles (id) on delete cascade,
  menu text not null,
  action text not null,
  constraint uq_role_permissions unique (role_id, menu, action)
);

-- [AKTIF] Akses entitas (branch/warehouse) — per ROLE.
create table if not exists branch_access (
  id text primary key,
  role_id text not null references roles (id) on delete cascade,
  entity_type text not null check (entity_type in ('BRANCH', 'WAREHOUSE')),
  entity_id text not null,
  constraint uq_branch_access unique (role_id, entity_type, entity_id)
);

create index if not exists idx_branch_access_role on branch_access (role_id);

-- [AKTIF]
create table if not exists user_settings (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  constraint uq_user_settings_user_key unique (user_id, key)
);

create index if not exists idx_user_settings_user on user_settings (user_id);

-- [AKTIF] Satu baris global.
create table if not exists ai_settings (
  id text primary key,
  enabled boolean not null default false,
  default_provider text not null default 'GOOGLE'
    check (default_provider in ('GOOGLE', 'DEEPSEEK')),
  google_api_key text,
  google_model text not null default 'gemini-2.0-flash',
  deepseek_api_key text,
  deepseek_model text not null default 'deepseek-chat',
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MASTER DATA
-- ---------------------------------------------------------------------------
-- [AKTIF]
create table if not exists branches (
  id text primary key,
  code text not null,
  name text not null,
  city text not null,
  address text,                                -- [BARU]
  is_active boolean not null default true      -- [BARU]
);

-- [AKTIF]
create table if not exists warehouses (
  id text primary key,
  branch_id text not null references branches (id) on delete cascade,
  code text not null,
  name text not null,
  description text,                            -- [BARU]
  is_active boolean not null default true      -- [BARU]
);

-- [AKTIF]
create table if not exists locations (
  id text primary key,
  warehouse_id text not null references warehouses (id) on delete cascade,
  code text not null,
  name text not null,
  description text,                            -- [BARU]
  is_active boolean not null default true      -- [BARU]
);

-- [AKTIF]
create table if not exists categories (
  id text primary key,
  code text not null,
  name text not null
);

-- [BARU] Satuan (unit of measure).
create table if not exists uom (
  id text primary key,
  code text not null unique,
  name text not null,
  created_by text references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [BARU] Grup item (melengkapi categories).
create table if not exists groups (
  id text primary key,
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [AKTIF]
create table if not exists barcode_formats (
  id text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  qty_per_format boolean not null default true,
  unique_barcode boolean not null default false,
  segments jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ITEM
-- ---------------------------------------------------------------------------
-- [AKTIF] Kolom berlabel [BARU] ditambahkan untuk fitur berikutnya.
create table if not exists items (
  id text primary key,
  code text not null,
  name text not null,
  unit text not null,
  category_id text not null references categories (id),
  price integer not null default 0,
  hue integer not null default 200,
  barcode_id text,
  qty integer,
  uom_id text references uom (id),             -- [BARU]
  group_id text references groups (id),        -- [BARU]
  alternative_code text,                       -- [BARU]
  uom_qty numeric(15,3),                       -- [BARU]
  description text,                            -- [BARU]
  is_active boolean not null default true      -- [BARU]
);

-- ---------------------------------------------------------------------------
-- BATCH — nomor batch/lot per item + on-hand per (batch, warehouse)
-- ---------------------------------------------------------------------------
-- [BARU]
create table if not exists batches (
  id text primary key,
  item_id text not null references items (id),
  batch_number text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'EMPTY')),
  notes text,
  created_by text references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_batches_item_number unique (item_id, batch_number)
);

create index if not exists idx_batches_item on batches (item_id);

-- [BARU] On-hand per batch per gudang.
create table if not exists stock_batches (
  id text primary key,
  batch_id text not null references batches (id) on delete cascade,
  warehouse_id text not null references warehouses (id) on delete cascade,
  qty numeric(15,3) not null default 0,
  updated_at timestamptz not null default now(),
  constraint uq_stock_batches_batch_wh unique (batch_id, warehouse_id)
);

create index if not exists idx_stock_batches_wh on stock_batches (warehouse_id);

-- ---------------------------------------------------------------------------
-- STOCK: balance harian + movement + ledger
-- ---------------------------------------------------------------------------
-- [AKTIF] Snapshot balance per (warehouse, item).
create table if not exists stock_balances (
  id text primary key,
  balance_date date not null default current_date,
  warehouse_id text not null references warehouses (id) on delete cascade,
  item_id text not null references items (id) on delete cascade,
  opening_qty integer not null default 0,
  in_qty integer not null default 0,
  out_qty integer not null default 0,
  closing_qty integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_stock_balances_wh_item unique (warehouse_id, item_id)
);

create index if not exists idx_stock_balances_item on stock_balances (item_id);

-- [BARU] Jenis mutasi stok (transfer, adjustment, receiving, issuing, ...).
create table if not exists movement_types (
  id text primary key,
  code text not null unique,
  name text not null,
  created_by text references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [BARU] Header mutasi stok.
create table if not exists stock_movements (
  id text primary key,
  movement_number text not null unique,
  type_id text not null references movement_types (id),
  movement_date timestamptz not null default now(),
  status text not null default 'DRAFT',
  reference_type text,
  reference_id text,
  description text,
  created_by text references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- [BARU] Detail mutasi stok.
create table if not exists stock_movement_details (
  id text primary key,
  movement_id text not null references stock_movements (id) on delete cascade,
  item_id text not null references items (id),
  from_warehouse_id text references warehouses (id),
  to_warehouse_id text references warehouses (id),
  qty numeric(15,3) not null,
  uom_id text references uom (id),
  batch_id text references batches (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movement_details_movement
  on stock_movement_details (movement_id);

-- [BARU] Buku besar stok (riwayat transaksi per item/gudang/lokasi).
create table if not exists stock_ledger (
  id text primary key,
  transaction_id text not null,
  transaction_type text not null,
  transaction_date timestamptz not null default now(),
  item_id text not null references items (id),
  warehouse_id text not null references warehouses (id),
  location_id text references locations (id),
  qty_in numeric(15,3) not null default 0,
  qty_out numeric(15,3) not null default 0,
  qty_balance numeric(15,3) not null default 0,
  reference_type text,
  reference_id text,
  batch_id text references batches (id),
  created_by text references users (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_ledger_item_wh
  on stock_ledger (item_id, warehouse_id);
create index if not exists idx_stock_ledger_date
  on stock_ledger (transaction_date);

-- ---------------------------------------------------------------------------
-- OPNAME — struktur lama (masih dipakai kode)
-- ---------------------------------------------------------------------------
-- [AKTIF] Kolom berlabel [BARU] ditambahkan untuk fitur berikutnya.
create table if not exists opname_projects (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now(),
  deadline timestamptz,
  created_by text references users (id),
  opname_date date,                            -- [BARU]
  status text not null default 'DRAFT',        -- [BARU]
  description text                             -- [BARU]
);

-- [LEGACY] Project per gudang — digantikan opname_warehouses.
create table if not exists projects (
  id text primary key,
  name text not null,
  project_id text references opname_projects (id) on delete set null,
  branch_id text not null references branches (id),
  warehouse_id text not null references warehouses (id),
  mode text not null check (mode in ('COMPARE', 'SCRATCH')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'IN_PROGRESS', 'APPROVED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  deadline timestamptz,
  created_by text references users (id)
);

create index if not exists idx_projects_project_id on projects (project_id);
create index if not exists idx_projects_created_by on projects (created_by);

-- [LEGACY] Digantikan opname_sessions.
create table if not exists scan_sessions (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  location_id text references locations (id),
  scanned_by text references users (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'CLOSED'))
);

create index if not exists idx_scan_sessions_project on scan_sessions (project_id);

-- [LEGACY] Digantikan opname_scans.
create table if not exists scan_records (
  id text primary key,
  session_id text not null references scan_sessions (id) on delete cascade,
  project_id text not null references projects (id) on delete cascade,
  barcode text not null,
  item_id text references items (id) on delete set null,
  parsed jsonb not null default '{}'::jsonb,
  quantity integer not null default 1,
  qty_mode text not null default 'AUTO'
    check (qty_mode in ('AUTO', 'MANUAL')),
  source text not null default 'SCANNER'
    check (source in ('SCANNER', 'CAMERA', 'MANUAL')),
  location_id text references locations (id),
  scanned_at timestamptz not null default now()
);

create index if not exists idx_scan_records_session on scan_records (session_id);
create index if not exists idx_scan_records_project on scan_records (project_id);

-- [LEGACY] Digantikan opname_counts.
create table if not exists opname_entries (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  item_id text not null references items (id),
  location_id text references locations (id),
  system_qty integer not null default 0,
  counted_qty integer not null default 0
);

create index if not exists idx_opname_entries_project on opname_entries (project_id);

-- ---------------------------------------------------------------------------
-- OPNAME — struktur baru (belum dipakai kode)
-- ---------------------------------------------------------------------------
-- [BARU] Status per gudang dalam satu project opname.
create table if not exists opname_warehouses (
  id text primary key,
  opname_id text not null references opname_projects (id) on delete cascade,
  warehouse_id text not null references warehouses (id),
  status text not null default 'PENDING',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_opname_warehouses_opname
  on opname_warehouses (opname_id);

-- [BARU] Hasil hitung per item.
create table if not exists opname_counts (
  id text primary key,
  opname_id text not null references opname_projects (id) on delete cascade,
  warehouse_id text not null references warehouses (id),
  item_id text not null references items (id),
  system_qty numeric(15,3) not null default 0,
  counted_qty numeric(15,3) not null default 0,
  difference_qty numeric(15,3) not null default 0,
  status text not null default 'PENDING',
  counted_at timestamptz,
  counted_by text references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_opname_counts_opname on opname_counts (opname_id);

-- [BARU] Sesi scan per lokasi + item.
create table if not exists opname_sessions (
  id text primary key,
  opname_id text not null references opname_projects (id) on delete cascade,
  warehouse_id text not null references warehouses (id),
  location_id text not null references locations (id),
  item_id text not null references items (id),
  start_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by text references users (id)
);

create index if not exists idx_opname_sessions_opname on opname_sessions (opname_id);

-- [BARU] Log scan barcode.
create table if not exists opname_scans (
  id text primary key,
  session_id text not null references opname_sessions (id) on delete cascade,
  opname_id text not null references opname_projects (id) on delete cascade,
  warehouse_id text not null references warehouses (id),
  location_id text not null references locations (id),
  item_id text not null references items (id),
  barcode text not null,
  scanned_at timestamptz not null default now(),
  scanned_by text references users (id)
);

create index if not exists idx_opname_scans_session on opname_scans (session_id);
create index if not exists idx_opname_scans_opname on opname_scans (opname_id);

-- ---------------------------------------------------------------------------
-- Setelah kode dimigrasi ke struktur opname baru, tabel [LEGACY] bisa dihapus:
--
--   drop table if exists opname_entries;
--   drop table if exists scan_records;
--   drop table if exists scan_sessions;
--   drop table if exists projects;
-- ---------------------------------------------------------------------------
