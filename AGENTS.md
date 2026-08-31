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
