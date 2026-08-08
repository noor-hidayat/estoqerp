-- StockOpname schema untuk Supabase (Postgres).
-- Jalankan di Supabase: SQL Editor > New query > paste > Run.

-- ---------------------------------------------------------------------------
-- PROFILES (terhubung ke auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null unique,
  role text not null default 'STAFF' check (role in ('ADMINISTRATOR', 'ADMIN', 'STAFF')),
  branch_id text,
  warehouse_id text,
  active boolean not null default true,
  avatar_hue int not null default 200,
  created_at timestamptz not null default now()
);

-- Buat baris profile otomatis saat user signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, avatar_hue)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    200
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- MASTER DATA
-- ---------------------------------------------------------------------------
create table if not exists public.branches (
  id text primary key,
  code text not null,
  name text not null,
  city text not null
);

create table if not exists public.warehouses (
  id text primary key,
  branch_id text not null references public.branches (id) on delete cascade,
  code text not null,
  name text not null
);

create table if not exists public.locations (
  id text primary key,
  warehouse_id text not null references public.warehouses (id) on delete cascade,
  code text not null,
  name text not null
);

create table if not exists public.categories (
  id text primary key,
  code text not null,
  name text not null
);

create table if not exists public.items (
  id text primary key,
  code text not null,
  name text not null,
  unit text not null,
  category_id text not null references public.categories (id),
  system_stock jsonb not null default '{}'::jsonb,
  price bigint not null default 0,
  hue int not null default 200,
  barcode_id text,
  qty int
);

create table if not exists public.barcode_formats (
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
create table if not exists public.projects (
  id text primary key,
  name text not null,
  branch_id text not null references public.branches (id),
  warehouse_id text not null references public.warehouses (id),
  mode text not null check (mode in ('COMPARE', 'SCRATCH')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'IN_PROGRESS', 'APPROVED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  deadline timestamptz,
  created_by uuid references public.profiles (id)
);

create table if not exists public.scan_sessions (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  location_id text references public.locations (id),
  scanned_by uuid references public.profiles (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED'))
);

create table if not exists public.scan_records (
  id text primary key,
  session_id text not null references public.scan_sessions (id) on delete cascade,
  project_id text not null references public.projects (id) on delete cascade,
  barcode text not null,
  item_id text references public.items (id),
  parsed jsonb not null default '{}'::jsonb,
  quantity int not null default 1,
  qty_mode text not null default 'AUTO' check (qty_mode in ('AUTO', 'MANUAL')),
  source text not null default 'SCANNER' check (source in ('SCANNER', 'CAMERA', 'MANUAL')),
  location_id text references public.locations (id),
  scanned_at timestamptz not null default now()
);

create table if not exists public.opname_entries (
  id text primary key,
  project_id text not null references public.projects (id) on delete cascade,
  item_id text not null references public.items (id),
  location_id text references public.locations (id),
  system_qty int not null default 0,
  counted_qty int not null default 0
);

create index if not exists idx_scan_records_session on public.scan_records (session_id);
create index if not exists idx_scan_records_project on public.scan_records (project_id);
create index if not exists idx_scan_sessions_project on public.scan_sessions (project_id);
create index if not exists idx_opname_entries_project on public.opname_entries (project_id);

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- MVP: semua user terautentikasi punya akses penuh.
-- (Tingkatkan ke policy berbasis role ADMINISTRATOR/ADMIN/STAFF sesuai kebutuhan.)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.warehouses enable row level security;
alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.barcode_formats enable row level security;
alter table public.projects enable row level security;
alter table public.scan_sessions enable row level security;
alter table public.scan_records enable row level security;
alter table public.opname_entries enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','branches','warehouses','locations','categories','items',
    'barcode_formats','projects','scan_sessions','scan_records',
    'opname_entries'
  ] loop
    execute format('drop policy if exists "authenticated_all" on public.%I;', t);
    execute format(
      'create policy "authenticated_all" on public.%I for all to authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;
