# StockOpname

Aplikasi web stock opname (penghitungan stok fisik) multi-cabang & multi-gudang dengan
**konfigurasi format barcode berbasis segmen yang dinamis** — tanpa perlu perubahan kode program.

Arsitektur monorepo 3 bagian terpisah:

| Folder | Isi |
|---|---|
| `frontend/` | React + Vite SPA (UI, hooks, routing, export PDF/XLSX) |
| `backend/` | Node.js + Express REST API (auth JWT, Drizzle ORM) |
| `database/` | Skema SQL PostgreSQL referensi |

## Menjalankan (development)

```bash
npm install
npm run dev        # jalankan backend (port 3001) + frontend (port 5173) bersamaan
```

Buka `http://localhost:5173`. Login dengan akun admin hasil seed:

| Akun | Password |
|---|---|
| `admin@opname.id` | `admin` |

> Akun dibuat via `npm run db:seed` (salah satu dari langkah setup di bawah).

## Setup Database

Requirement: PostgreSQL berjalan lokal (atau sesuaikan `DATABASE_URL` di `backend/.env`).

```bash
# 1. install PostgreSQL + buat user/database (perlu sudo, sekali saja)
sudo bash scripts/setup-postgres-local.sh install

# 2. isi backend/.env + migrasi + seed admin
bash scripts/setup-postgres-local.sh init
```

Atau manual:

```bash
createdb stockopname
cp backend/.env.example backend/.env   # isi DATABASE_URL, JWT_SECRET, dll
npm run db:migrate
npm run db:seed
```

`database/schema.sql` adalah referensi skema manual; migrasi resmi dikelola
Drizzle ORM (`backend/drizzle/`).

## Modul

- **Dashboard** — ringkasan aktivitas, project aktif, progress & log scan terakhir
- **Stock Opname** — Projects, Scan Session (keyboard-scanner + kamera HP), Variance Review, Approval
- **Product** — Kategori & Item List
- **Stock** — Stock Balance, Lokasi Gudang, Cabang & Gudang
- **Settings** — Barcode Format, User & Role
- **Laporan** — per project, variance, summary, riwayat scan; export **Excel (.xlsx)** & **PDF**

## Struktur

```
frontend/
  src/
    app/                # Halaman (pola route)
    components/         # UI primitives, app shell, barcode editor & camera
    lib/
      api/client.ts     # Fetch wrapper + interceptor JWT refresh
      api/db-provider.tsx  # DBProvider (fetch-all + optimistic CRUD)
      barcode/parser.ts # Mesin parsing barcode berbasis segmen
      compute.ts        # Variance, progress, status helpers
      export.ts         # Export XLSX/PDF
      session.tsx       # SessionProvider (auth JWT)
    hooks/use-db.ts     # useDB() / useData()
    types/              # Domain types

backend/
  src/
    index.ts            # Entry Express (CORS, JSON, error handler)
    config.ts           # Baca env (PORT, DATABASE_URL, JWT_*)
    db/schema.ts        # Skema Drizzle (12 tabel)
    db/pool.ts          # pg Pool + drizzle client
    db/seed.ts          # Seed admin user
    middleware/auth.ts  # requireAuth + requireRoles
    routes/auth.ts      # login / register / refresh / logout / me
    routes/full.ts      # GET /api/full (fetch-all)
    routes/crud.ts      # POST/PATCH/DELETE /api/:table(/:id)
    utils/jwt.ts        # sign/verify access token
    utils/tokens.ts     # refresh token generator & hashing
  drizzle/              # Migrasi hasil drizzle-kit

database/
  schema.sql            # Skema SQL referensi (setup manual)
```

## API Ringkas

| Method | Path | Auth | Fungsi |
|---|---|---|---|
| `POST` | `/api/auth/login` | — | Login → access + refresh token |
| `POST` | `/api/auth/refresh` | — | Rotasi refresh token |
| `POST` | `/api/auth/register` | Administrator | Buat user baru |
| `GET` | `/api/auth/me` | JWT | Profil user aktif |
| `POST` | `/api/auth/logout` | — | Revoke refresh token |
| `GET` | `/api/full` | JWT | Semua data (DB shape) |
| `POST` | `/api/:table` | JWT | Insert baris |
| `PATCH` | `/api/:table/:id` | JWT | Update baris |
| `DELETE` | `/api/:table/:id` | JWT | Hapus baris |

Tabel yang tersedia: `users`, `branches`, `warehouses`, `locations`, `categories`,
`items`, `barcodeFormats`, `projects`, `scanSessions`, `scanRecords`, `opnameEntries`.

## Perintah

```bash
npm run dev            # backend + frontend
npm run dev:backend    # hanya backend (tsx watch, port 3001)
npm run dev:frontend   # hanya frontend (vite, port 5173)
npm run build          # build frontend produksi
npm run start          # jalankan backend produksi (dist)
npm run typecheck      # typecheck frontend + backend
npm run lint           # eslint frontend + backend
npm run db:generate    # generate migrasi drizzle
npm run db:migrate     # jalankan migrasi
npm run db:seed        # seed admin user
```
