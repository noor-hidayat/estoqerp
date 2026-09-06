# Project structure

Monorepo npm workspaces — 3 folder terpisah:

| Folder | Stack | Command |
|---|---|---|
| `frontend/` | React + Vite (SPA, react-router) | `npm run dev -w frontend` |
| `backend/` | Node + Express 5 + Drizzle ORM + PostgreSQL | `npm run dev -w backend` |
| `database/` | Skema SQL referensi (migrasi resmi via drizzle-kit di `backend/drizzle/`) | — |

- Frontend memakai pola route `src/app/app/...` (bukan Next.js) dengan `src/App.tsx` sebagai router.
- Semua data via `useDB()`/`useData()` dari `frontend/src/hooks/use-db.ts` → `frontend/src/lib/api/db-provider.tsx` → fetch ke REST API backend.
- Backend: auth JWT (access + refresh token, lihat `backend/src/routes/auth.ts`), semua CRUD lewat generic router `backend/src/routes/crud.ts` (whitelist tabel di `CRUD_TABLES`).
- Skema DB tunggal: `backend/src/db/schema.ts` (sumber kebenaran untuk drizzle-kit). Ubah di sana lalu `npm run db:generate && npm run db:migrate`.
- Perintah lint/typecheck dari root: `npm run lint`, `npm run typecheck`.

## Konvensi UI & Workflow (Receiving → QC → GNR)

> Disepakati 2026-09-05: semua agent baru wajib ikut pola ini. Detail UI lihat `design.md` (layout, tabel, tombol, gap header, flow save).

> Aturan baru yang diubah (2026-09-05): flow save, gap judul-header, ukuran tombol, layout Detail vs New harus identik — sudah dimasukkan ke `design.md` §1-4; yang lain menyusul.

**Layout Receiving (grid `sm:grid-cols-2`, `gap-x-6 gap-y-4`, `border border-border`, header `bg-zinc-100` + `divide-x`):**
- Baris 1: `Document (No PO, SearchableSelect)` | `Posting Date (DatePicker, w-full, h-8)` 
- Baris 2: `Supplier Name` (readOnly) | `Gudang Simpan (Target Warehouse, SearchableSelect)`
- Baris 3: `Notes` (`sm:col-span-2` atau dibagi 2 bila di QC detail)
- Baris 2 kolom `Posting Time` di kanan (`h-8 w-1/2`, `TimePicker` logic `1200 → 12:00:00` dari `src/components/ui/time-picker.tsx:parseTimeInput`), `Batch` tidak ditampilkan (hapus).
- Kolom `Posting Date` `w-full` (`DatePicker` `pl-9`), `Posting Time` di kanan baris 2.

**Tabel 1 kotak full (global):**
- `TableCell` untuk input = `p-0 border-r border-border` + `TableInput` (`src/components/ui/table-input.tsx`, `h-9 w-full border-0 bg-transparent`, `onWheel=>blur` agar scroll tidak ubah angka, placeholder `Qty` untuk angka / `columnTitle` untuk lain, background `bg-amber-50` saat focus).
- `SearchableSelect` di tabel pakai `table` prop → `border-0 bg-transparent h-9`, dropdown hanya muncul setelah ketik ( `onFocus` tidak `setOpen(true)`, hanya `onChange` ), garis vertikal tiap kolom `divide-x divide-border` + `border-r`.
- Header `bg-zinc-100 dark:bg-zinc-800` + `border-b`, tidak ada double-border.

**QC Inspection (dokumen terpisah `QC-YYMM-XXXX`):**
- Master `qc_parameters` (`code` unique, `RUSAK/ROBEK/EXPIRED` …) via `GET/POST /qc-parameters`, `qc_inspection_line_params` (`parameterId,qty`).
- Form New: `Document (No Receiving, PENDING_QC)` | `Posting Date` (dari `receiving.receiptDate`, disabled) / `Inspection Date | Supplier Name` (Supplier di kanan, Time dihapus), `Notes` span2 (tanpa `QC Notes`).
- Tabel 1 `No | Item Code | Qty Reject (TableInput) | Qty Accept (auto)` – satu baris per item, `Qty Origin` dihapus.
- Tabel 2 `No | Item Code(auto) | Parameter | Qty` – flat `paramRows: {itemIdx,parameterId,qty}[]`, `+ Add Parameter` auto `itemIdx = nextItem dengan sisa reject` (jika `reject 0` Tabel 2 tidak muncul), `TableInput` + `SearchableSelect(table)` dengan `qty` tanpa background, vertical lines.
- Submit → `POST /qc-inspections` + `POST /:id/submit` → propagasi `receiving_lines.qtyAccepted/Rejected` + `receivings.status=COMPLETED` → baru `Create GNR` (`POST /goods-receipts` guard cek `PENDING_QC`).
- Detail QC: 2 tabel sama, header bersih, tanpa `Back` di detail (hapus) + tanpa text di bawah judul (`Receiving: ...`), tanpa `Inspection Date` di detail, `Posting Date` editable default `actual date` (today), `Supplier` tanpa dropdown `v` (plain div, bukan `SearchableSelect`), `Notes` dibagi 2 (1 kolom, tidak `sm:col-span-2`).

**Receiving Detail:** `Alasan Reject` dihapus global (tidak tampil di semua status), `Batch` dihapus global. Label `Document` (bukan `No PO`) untuk `purchaseOrderId`, `Supplier Name` & `Target Warehouse` tampil sebagai `div bg-zinc-100` (readOnly, bukan `SearchableSelect` saat view) agar tidak kosong. Kotak `rounded-xl border bg-card p-5` yang mengelilingi Document→Note **dihapus** di menu RCV (detail view/edit); grid kini `gap-x-8 gap-y-5` via `FormGrid` sama persis dengan New Receiving. Judul pakai `FormPage title` (`text-[24px] font-semibold tracking-[-0.02em]`) — posisi geser di-fix agar sama dengan New; tombol Save `size="sm"` + ikon `<Save size={15}/>` disamakan New vs Detail.

**Receiving List (`/app/inbound/receiving`):** Kolom `Supplier Name | Status | Return(progress 10%/50%/100% bar `h-1.5 bg-muted`+`bg-primary`) | ID=documentNo RCV | PO ID=documentNo PO | Created=timeAgo`. Header tanpa `description` (`PageHeader` tanpa `description`). `PO ID` & `ID` wajib tampil `documentNo` (fallback `formatId` hanya jika `documentNo` null), jangan `"-"`.

**QC List (`/app/inbound/qc`):** Kolom `ID=documentNo QC | PR ID=documentNo PO (via `qc.purchaseOrderId` fallback `receiving.purchaseOrderId`) | Posting date=`inspectionDate.slice(0,10)` | Status | Created=timeAgo`. Header tanpa `description`. Samakan fallback `documentNo` untuk `ID`/`PR ID`.

**QC Detail:** Tambah `Target Warehouse` (readOnly `div`) agar tidak kosong, mapping `warehouseId` & `supplierId` dari `qc`/`receiving` ke `publicId` via backend `GET /receivings` & `GET /qc-inspections` (map internal `bigint` → `publicId`).

**Flow Save Receiving (2026-09-05 revisi):**
- `New > Save` → `POST /receivings` status `DRAFT` (tanpa `Save & Submit` di bawah, `Back` dihapus di menu Receiving).
- `Edit > Save` → `PUT /receivings/:id` tetap `DRAFT`; tombol `Save` berubah jadi `Submit` setelah save.
- `Submit` → `POST /receivings/:id/submit` via `toast.custom` Sonner `No / Yes` (duration Infinity, `Yes` autoFocus, `Enter` = Yes, `Esc` = No).
- Shortcut `Ctrl+S` / `Cmd+S` trigger `Save` (New/Edit) atau `Submit`/`Update` sesuai konteks (preventDefault browser save).

**PO View:** `documentNo` mengandung `/` (`PO/2026/09/0004`) → navigasi pakai `id` (UUID) + `encodeURIComponent` agar tidak 404 di `react-router :id` & `express :id`.


## Context7 - MANDATORY (STRICT - GLOBAL)
> **FAILURE jika agent lupa pakai Context7 untuk library.** Rule ini global untuk semua sesi di repo ini. Tidak ada toleransi.

**WAJIB** pakai `mcp.context7` (`context7_resolve-library-id` -> `context7_query-docs`, max 3 query/pertanyaan):
- Trigger: user mention library/framework/SDK/API/CLI/cloud APAPUN di `frontend/package.json` / `backend/package.json`: `vite@5.4`, `react@19`, `react-router-dom@7.6`, `@tanstack/react-query@5.101`, `react-hook-form@7.85`+`zod@4`, `tailwindcss@4`, `@radix-ui/*`, `recharts`, `drizzle-orm@0.45`/`drizzle-kit@0.31`, `express@5.2`, `pg`, `jsonwebtoken`, `jspdf`, `html5-qrcode`, `date-fns`, dll - termasuk syntax, config (`vite.config.ts`, `drizzle.config.ts`), migrasi versi, setup, CLI, debugging spesifik library.
- Bahkan kalau model merasa tau - WAJIB fetch docs terbaru. Prioritas `context7` over `websearch` untuk docs.
- Project ini 100% Vite SPA (React Router) - tidak ada Next.js. Jangan pakai docs Next, jangan import `next/*`.

**DILARANG** pakai context7 untuk: rapihin layout/refactoring, nulis script dari scratch, debugging business logic (`lib/barcode/parser.ts`, `lib/batch/parser.ts`, `db/schema.ts`), code review, konsep umum.

**Flow wajib:**
1. `context7_resolve-library-id` dengan `libraryName` official (contoh: `Vite` -> `/vitejs/vite`, `Drizzle ORM` -> `/drizzle-team/drizzle-orm`)
2. `context7_query-docs` dengan `query` 1 konsep spesifik (contoh: `server.proxy` bukan `vite config semua`)

**Contoh Estoq (mapping):**
- `vite server proxy / https / HMR / preview` -> `/vitejs/vite`
- `react-router v7 loader/action` -> `/remix-run/react-router`
- `drizzle relations / pgTable / drizzle-kit` -> `/drizzle-team/drizzle-orm`
- `tanstack query v5` -> `/tanstack/query`
- `express 5 breaking / middleware` -> `/expressjs/express`
- `tailwindcss 4 / @tailwindcss/postcss` -> `/tailwindlabs/tailwindcss`
- `radix-ui / base-ui` -> `/radix-ui/primitives`
