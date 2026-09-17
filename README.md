# Estoq ERP

Estoq ERP adalah aplikasi ERP berbasis web (React + Vite SPA) yang berawal dari StockOpname / StockOps dan berkembang menjadi sistem ERP terintegrasi untuk manajemen stok, pembelian, penjualan, dan gudang.

Repositori ini saat ini berada pada **fase frontend-first**: pengembangan aktif berfokus pada `frontend/`, sementara implementasi `backend` dan `database` yang lama dipertahankan sebagai **referensi arsip** untuk pembangunan ulang backend di masa depan.

> `archive/backend` dan `archive/database` **bukan** layanan produksi aktif. Jangan menjalankannya sebagai bagian dari workflow pengembangan saat ini.

## Status Proyek

- **Frontend (`frontend/`)** — aplikasi aktif (React 19 + Vite 5 + React Router 7 + TanStack Query)
- **Backend (`archive/backend/`)** — arsip referensi (Express + Drizzle ORM + PostgreSQL), tidak dijalankan di dev saat ini
- **Database (`archive/database/`)** — skema SQL referensi arsip

## Instalasi

```bash
npm install
```

Hanya `frontend` yang terdaftar sebagai workspace aktif. `archive/backend` tidak akan diinstal sebagai workspace.

Untuk verifikasi instalasi bersih:

```bash
rm -rf node_modules
npm install
```

## Menjalankan Frontend (Development)

```bash
npm run dev            # vite dev server di http://localhost:5173
# atau
npm run dev:frontend
```

Proxy API (`/api → http://localhost:3001`) tetap dikonfigurasi di `frontend/vite.config.js`, tetapi backend arsip tidak diperlukan untuk pengembangan UI. Komponen frontend dirancang untuk berjalan dengan mock data / local state hingga backend baru tersedia.

## Build Frontend

```bash
npm run build          # vite build (output di frontend/dist)
npm run preview        # preview hasil build
```

## Typecheck & Lint

```bash
npm run typecheck      # tsc --noEmit (frontend)
npm run lint           # eslint (frontend)
```

## Struktur Proyek

```
estoqerp/
├── frontend/
│   ├── public/
│   └── src/
│       ├── app/               # Routing (pola src/app/app/..., bukan Next.js)
│       ├── components/
│       │   ├── ui/            # Primitif UI generik (button, dialog, table, dsb) — tanpa logika bisnis
│       │   ├── layout/        # Shell, sidebar, topbar, navigation, global-search
│       │   ├── data-display/  # Komponen data reusable (filters, frame, icon-tile, timeline, status)
│       │   └── feedback/      # State kosong, loader, feedback UI
│       ├── modules/           # Domain modules (business logic terisolasi per domain)
│       │   ├── access/
│       │   ├── activity/
│       │   ├── ai/
│       │   ├── barcode/
│       │   ├── dashboard/
│       │   ├── stock-opname/
│       │   ├── purchasing/
│       │   ├── inventory/
│       │   ├── warehouse/
│       │   └── receiving/
│       ├── hooks/             # Shared hooks (hooks domain-spesifik ada di modules/<domain>/hooks)
│       ├── lib/               # Utilitas teknis bersama (formatters, date, client, storage)
│       ├── types/             # Tipe global bersama (tipe domain di modules/<domain>/)
│       └── main.tsx
├── docs/
│   └── design.md              # Design system & konvensi UI
├── archive/
│   ├── backend/               # Arsip backend lama (referensi, tidak aktif)
│   └── database/              # Arsip skema database lama (referensi)
├── AGENTS.md
├── package.json               # Workspace: frontend only
└── package-lock.json
```

### Prinsip Arsitektur

> **Shared UI stays shared. Business logic stays inside its domain. Infrastructure stays with the infrastructure that owns it.**

- `components/ui`, `components/layout`, `components/data-display` tidak boleh mengimpor `modules/*`
- `modules/<domain>` boleh menggunakan `components/ui`, `hooks`, `lib`, `types` tetapi hindari circular antar domain
- Hook yang hanya relevan untuk satu domain diletakkan di `modules/<domain>/hooks/`
- Worker / background file diletakkan di `modules/<domain>/workers/`

Contoh penempatan:

```
New Purchase Order UI     → modules/purchasing/components/
New Stock Balance UI      → modules/inventory/components/
New Warehouse Transfer UI → modules/warehouse/components/
New Barcode Scanner       → modules/barcode/components/
New Global Dialog         → components/ui/
New Sidebar               → components/layout/
New AI Chat Hook          → modules/ai/hooks/
```

## Dokumentasi UI

Lihat `docs/design.md` untuk aturan layout, tabel, tombol, gap header, dan flow save (Receiving → QC → GNR).

## Catatan Arsip

- `archive/backend/src/db/schema.ts` adalah sumber kebenaran historis untuk Drizzle; migrasi ada di `archive/backend/drizzle/`
- `archive/database/schema.sql` adalah skema SQL referensi manual
- Jangan menghapus isi `archive/` — dipertahankan sebagai referensi rebuild backend
