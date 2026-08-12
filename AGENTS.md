<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

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
