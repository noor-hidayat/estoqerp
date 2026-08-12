-- StockOpname schema (PostgreSQL standalone — tanpa Supabase).
--
-- Migrasi resmi dikelola dengan Drizzle ORM:
--   cd backend && npm run db:generate && npm run db:migrate
--
-- File ini adalah referensi skema lengkap untuk setup manual
-- atau perbandingan dengan hasil migrasi drizzle-kit.

-- ---------------------------------------------------------------------------
-- AUTH
-- ---------------------------------------------------------------------------
create table if not exists users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'STAFF'
    check (role in ('ADMINISTRATOR', 'ADMIN', 'STAFF')),
  branch_id text,
  warehouse_id text,
  active boolean not null default true,
  avatar_hue int not null default 200,
  created_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id text primary key,
  user_id text not null references users (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- MASTER DATA
-- ---------------------------------------------------------------------------
create table if not exists branches (
  id text primary key,
  code text not null,
  name text not null,
  city text not null
);

create table if not exists warehouses (
  id text primary key,
  branch_id text not null references branches (id) on delete cascade,
  code text not null,
  name text not null
);

create table if not exists locations (
  id text primary key,
  warehouse_id text not null references warehouses (id) on delete cascade,
  code text not null,
  name text not null
);

create table if not exists categories (
  id text primary key,
  code text not null,
  name text not null
);

create table if not exists items (
  id text primary key,
  code text not null,
  name text not null,
  unit text not null,
  category_id text not null references categories (id),
  system_stock jsonb not null default '{}'::jsonb,
  price bigint not null default 0,
  hue int not null default 200,
  barcode_id text,
  qty int
);

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
-- OPNAME
-- ---------------------------------------------------------------------------
create table if not exists projects (
  id text primary key,
  name text not null,
  branch_id text not null references branches (id),
  warehouse_id text not null references warehouses (id),
  mode text not null check (mode in ('COMPARE', 'SCRATCH')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'IN_PROGRESS', 'APPROVED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  deadline timestamptz,
  created_by text references users (id)
);

create table if not exists scan_sessions (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  location_id text references locations (id),
  scanned_by text references users (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED'))
);

create table if not exists scan_records (
  id text primary key,
  session_id text not null references scan_sessions (id) on delete cascade,
  project_id text not null references projects (id) on delete cascade,
  barcode text not null,
  item_id text references items (id),
  parsed jsonb not null default '{}'::jsonb,
  quantity int not null default 1,
  qty_mode text not null default 'AUTO' check (qty_mode in ('AUTO', 'MANUAL')),
  source text not null default 'SCANNER'
    check (source in ('SCANNER', 'CAMERA', 'MANUAL')),
  location_id text references locations (id),
  scanned_at timestamptz not null default now()
);

create table if not exists opname_entries (
  id text primary key,
  project_id text not null references projects (id) on delete cascade,
  item_id text not null references items (id),
  location_id text references locations (id),
  system_qty int not null default 0,
  counted_qty int not null default 0
);

-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
create index if not exists idx_scan_records_session on scan_records (session_id);
create index if not exists idx_scan_records_project on scan_records (project_id);
create index if not exists idx_scan_sessions_project on scan_sessions (project_id);
create index if not exists idx_opname_entries_project on opname_entries (project_id);
