// Backfill ID ke format mudah dibaca (sekali jalan):
//   br_001, wh_001, loc_001, cat_001, itm_001, stb_001, fmt_001, prj_001, usr_001
//   ses_yymm_0001, rec_yymm_0001, ope_yymm_0001 (per bulan dibuat)
//
// Strategi: semua FK di-drop sementara, mapping lama->baru dibangun,
// referensi di-update, PK di-update, lalu FK dipasang ulang — dalam 1 transaksi.
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { db, pool } from "./pool";
import * as schema from "./schema";

const seqCounters = new Map<string, number>();
function nextSeq(prefix: string): string {
  const n = (seqCounters.get(prefix) ?? 0) + 1;
  seqCounters.set(prefix, n);
  return `${prefix}_${String(n).padStart(3, "0")}`;
}

const serialCounters = new Map<string, number>();
function nextSerial(prefix: string, date: Date | string): string {
  const d = new Date(date);
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
  const key = `${prefix}_${yymm}`;
  const n = (serialCounters.get(key) ?? 0) + 1;
  serialCounters.set(key, n);
  return `${key}_${String(n).padStart(4, "0")}`;
}

const fmt =
  /^(usr|br|wh|loc|cat|itm|stb|fmt|prj)_\d{3,}$|^(ses|rec|ope)_\d{4}_\d{4,}$/;

const ALL_TABLES: AnyPgTable[] = [
  schema.users,
  schema.branches,
  schema.warehouses,
  schema.locations,
  schema.categories,
  schema.items,
  schema.stockBalances,
  schema.barcodeFormats,
  schema.projects,
  schema.scanSessions,
  schema.scanRecords,
  schema.opnameEntries,
];

function idOf(table: AnyPgTable): AnyPgColumn {
  return (table as unknown as { id: AnyPgColumn }).id;
}

async function needsBackfill(): Promise<boolean> {
  for (const t of ALL_TABLES) {
    const rows = await db.select({ id: idOf(t) }).from(t);
    if (rows.some((r) => !fmt.test(r.id as string))) return true;
  }
  return false;
}

const FK_ADD: string[] = [
  "ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;",
  "ALTER TABLE warehouses ADD CONSTRAINT warehouses_branch_id_branches_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;",
  "ALTER TABLE locations ADD CONSTRAINT locations_warehouse_id_warehouses_id_fk FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;",
  "ALTER TABLE items ADD CONSTRAINT items_category_id_categories_id_fk FOREIGN KEY (category_id) REFERENCES categories(id);",
  "ALTER TABLE projects ADD CONSTRAINT projects_branch_id_branches_id_fk FOREIGN KEY (branch_id) REFERENCES branches(id);",
  "ALTER TABLE projects ADD CONSTRAINT projects_warehouse_id_warehouses_id_fk FOREIGN KEY (warehouse_id) REFERENCES warehouses(id);",
  "ALTER TABLE projects ADD CONSTRAINT projects_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES users(id);",
  "ALTER TABLE scan_sessions ADD CONSTRAINT scan_sessions_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;",
  "ALTER TABLE scan_sessions ADD CONSTRAINT scan_sessions_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES locations(id);",
  "ALTER TABLE scan_sessions ADD CONSTRAINT scan_sessions_scanned_by_users_id_fk FOREIGN KEY (scanned_by) REFERENCES users(id);",
  "ALTER TABLE scan_records ADD CONSTRAINT scan_records_session_id_scan_sessions_id_fk FOREIGN KEY (session_id) REFERENCES scan_sessions(id) ON DELETE CASCADE;",
  "ALTER TABLE scan_records ADD CONSTRAINT scan_records_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;",
  "ALTER TABLE scan_records ADD CONSTRAINT scan_records_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES items(id);",
  "ALTER TABLE scan_records ADD CONSTRAINT scan_records_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES locations(id);",
  "ALTER TABLE opname_entries ADD CONSTRAINT opname_entries_project_id_projects_id_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;",
  "ALTER TABLE opname_entries ADD CONSTRAINT opname_entries_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES items(id);",
  "ALTER TABLE opname_entries ADD CONSTRAINT opname_entries_location_id_locations_id_fk FOREIGN KEY (location_id) REFERENCES locations(id);",
  "ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_warehouse_id_warehouses_id_fk FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE;",
  "ALTER TABLE stock_balances ADD CONSTRAINT stock_balances_item_id_items_id_fk FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE;",
];

async function main() {
  if (!(await needsBackfill())) {
    console.log("Semua ID sudah dalam format baru, tidak ada yang perlu diubah.");
    return;
  }

  await db.transaction(async (tx) => {
    // 1) Drop semua FK sementara.
    const fks = await tx.execute(sql`
      SELECT conrelid::regclass::text AS tbl, conname
      FROM pg_constraint
      WHERE contype = 'f'
    `);
    for (const fk of fks.rows) {
      const tbl = String(fk.tbl).replace(/^public\./, "");
      const con = String(fk.conname);
      await tx.execute(sql.raw(`ALTER TABLE ${tbl} DROP CONSTRAINT ${con};`));
    }

    // 2) Bangun mapping lama -> baru.
    const usersAll = await tx.select().from(schema.users);
    const branchesAll = await tx.select().from(schema.branches);
    const warehousesAll = await tx.select().from(schema.warehouses);
    const locationsAll = await tx.select().from(schema.locations);
    const categoriesAll = await tx.select().from(schema.categories);
    const itemsAll = await tx.select().from(schema.items);
    const stockAll = await tx.select().from(schema.stockBalances);
    const formatsAll = await tx.select().from(schema.barcodeFormats);
    const projectsAll = await tx.select().from(schema.projects);
    const sessionsAll = await tx.select().from(schema.scanSessions);
    const recordsAll = await tx.select().from(schema.scanRecords);
    const entriesAll = await tx.select().from(schema.opnameEntries);

    const cmp = (a: string, b: string) => a.localeCompare(b);
    const mapOf = (rows: { id: string }[], gen: () => string) =>
      new Map(rows.map((r) => [r.id, gen()]));

    const usersMap = mapOf(
      [...usersAll].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          cmp(a.id, b.id)
      ),
      () => nextSeq("usr")
    );
    const branchesMap = mapOf(
      [...branchesAll].sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id)),
      () => nextSeq("br")
    );
    const warehousesMap = mapOf(
      [...warehousesAll].sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id)),
      () => nextSeq("wh")
    );
    const locationsMap = mapOf(
      [...locationsAll].sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id)),
      () => nextSeq("loc")
    );
    const categoriesMap = mapOf(
      [...categoriesAll].sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id)),
      () => nextSeq("cat")
    );
    const itemsMap = mapOf(
      [...itemsAll].sort((a, b) => cmp(a.code, b.code) || cmp(a.id, b.id)),
      () => nextSeq("itm")
    );
    const stockMap = mapOf(
      [...stockAll].sort((a, b) => cmp(a.id, b.id)),
      () => nextSeq("stb")
    );
    const formatsMap = mapOf(
      [...formatsAll].sort((a, b) => cmp(a.name, b.name) || cmp(a.id, b.id)),
      () => nextSeq("fmt")
    );
    const projectsMap = mapOf(
      [...projectsAll].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          cmp(a.id, b.id)
      ),
      () => nextSeq("prj")
    );

    // Serial REC/SES sesuai bulan dari tanggal barisnya.
    const sesMap = new Map<string, string>();
    for (const s of [...sessionsAll].sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() ||
        cmp(a.id, b.id)
    )) {
      sesMap.set(s.id, nextSerial("ses", s.startedAt));
    }
    const recMap = new Map<string, string>();
    for (const r of [...recordsAll].sort(
      (a, b) =>
        new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime() ||
        cmp(a.id, b.id)
    )) {
      recMap.set(r.id, nextSerial("rec", r.scannedAt));
    }

    const projectCreatedAt = new Map(
      projectsAll.map((p) => [p.id, p.createdAt])
    );
    const entriesMap = new Map<string, string>();
    for (const e of [...entriesAll].sort((a, b) => {
      const ca = projectCreatedAt.get(a.projectId)?.getTime() ?? 0;
      const cb = projectCreatedAt.get(b.projectId)?.getTime() ?? 0;
      return ca - cb || cmp(a.itemId, b.itemId) || cmp(a.id, b.id);
    })) {
      entriesMap.set(
        e.id,
        nextSerial("ope", projectCreatedAt.get(e.projectId) ?? new Date())
      );
    }

    // Helper referensi.
    const get = (
      map: Map<string, string>,
      v: string | null | undefined
    ): string | null => {
      if (!v) return v ?? null;
      return map.get(v) ?? v;
    };

    // 3) Update referensi (child -> parent) ke id baru.
    const rts = await tx.select().from(schema.refreshTokens);
    for (const rt of rts) {
      const next = get(usersMap, rt.userId);
      if (next !== rt.userId)
        await tx
          .update(schema.refreshTokens)
          .set({ userId: next as string })
          .where(eq(schema.refreshTokens.id, rt.id));
    }

    for (const w of warehousesAll) {
      const next = get(branchesMap, w.branchId);
      if (next !== w.branchId)
        await tx
          .update(schema.warehouses)
          .set({ branchId: next as string })
          .where(eq(schema.warehouses.id, w.id));
    }

    for (const l of locationsAll) {
      const next = get(warehousesMap, l.warehouseId);
      if (next !== l.warehouseId)
        await tx
          .update(schema.locations)
          .set({ warehouseId: next as string })
          .where(eq(schema.locations.id, l.id));
    }

    for (const it of itemsAll) {
      const cat = get(categoriesMap, it.categoryId);
      if (cat !== it.categoryId)
        await tx
          .update(schema.items)
          .set({ categoryId: cat as string })
          .where(eq(schema.items.id, it.id));
    }

    // stock_balances -> warehouses & items
    for (const sb of stockAll) {
      const set: Record<string, string> = {};
      const w = get(warehousesMap, sb.warehouseId);
      const i = get(itemsMap, sb.itemId);
      if (w !== sb.warehouseId) set.warehouseId = w as string;
      if (i !== sb.itemId) set.itemId = i as string;
      if (Object.keys(set).length)
        await tx
          .update(schema.stockBalances)
          .set(set)
          .where(eq(schema.stockBalances.id, sb.id));
    }

    for (const f of formatsAll) {
      const segs = (f.segments ?? []) as {
        id: string;
        field: string;
        start: number;
        end: number;
        label?: string;
      }[];
      const rebuilt = segs.map((s, i) => ({
        id: `seg_${String(i + 1).padStart(2, "0")}`,
        field: s.field,
        start: s.start,
        end: s.end,
        ...(s.label ? { label: s.label } : {}),
      }));
      await tx
        .update(schema.barcodeFormats)
        .set({ segments: rebuilt })
        .where(eq(schema.barcodeFormats.id, f.id));
    }

    for (const p of projectsAll) {
      const set: Record<string, string | null> = {};
      const b = get(branchesMap, p.branchId);
      const w = get(warehousesMap, p.warehouseId);
      const u = get(usersMap, p.createdBy);
      if (b !== p.branchId) set.branchId = b;
      if (w !== p.warehouseId) set.warehouseId = w;
      if (u !== p.createdBy) set.createdBy = u;
      if (Object.keys(set).length)
        await tx
          .update(schema.projects)
          .set(set)
          .where(eq(schema.projects.id, p.id));
    }

    for (const s of sessionsAll) {
      const set: Record<string, string | null> = {};
      const p = get(projectsMap, s.projectId);
      const l = get(locationsMap, s.locationId);
      const u = get(usersMap, s.scannedBy);
      if (p !== s.projectId) set.projectId = p;
      if (l !== s.locationId) set.locationId = l;
      if (u !== s.scannedBy) set.scannedBy = u;
      if (Object.keys(set).length)
        await tx
          .update(schema.scanSessions)
          .set(set)
          .where(eq(schema.scanSessions.id, s.id));
    }

    for (const r of recordsAll) {
      const set: Record<string, string | null> = {};
      const s = get(sesMap, r.sessionId);
      const p = get(projectsMap, r.projectId);
      const i = get(itemsMap, r.itemId);
      const l = get(locationsMap, r.locationId);
      if (s !== r.sessionId) set.sessionId = s;
      if (p !== r.projectId) set.projectId = p;
      if (i !== r.itemId) set.itemId = i;
      if (l !== r.locationId) set.locationId = l;
      if (Object.keys(set).length)
        await tx
          .update(schema.scanRecords)
          .set(set)
          .where(eq(schema.scanRecords.id, r.id));
    }

    for (const e of entriesAll) {
      const set: Record<string, string | null> = {};
      const p = get(projectsMap, e.projectId);
      const i = get(itemsMap, e.itemId);
      const l = get(locationsMap, e.locationId);
      if (p !== e.projectId) set.projectId = p;
      if (i !== e.itemId) set.itemId = i;
      if (l !== e.locationId) set.locationId = l;
      if (Object.keys(set).length)
        await tx
          .update(schema.opnameEntries)
          .set(set)
          .where(eq(schema.opnameEntries.id, e.id));
    }

    // 4) Update PK semua tabel.
    const setPk = async (table: AnyPgTable, map: Map<string, string>) => {
      const idCol = idOf(table);
      for (const [old, next] of map) {
        await tx
          .update(table)
          .set({ id: next } as never)
          .where(eq(idCol, old));
      }
    };
    await setPk(schema.opnameEntries, entriesMap);
    await setPk(schema.scanRecords, recMap);
    await setPk(schema.scanSessions, sesMap);
    await setPk(schema.projects, projectsMap);
    await setPk(schema.barcodeFormats, formatsMap);
    await setPk(schema.items, itemsMap);
    await setPk(schema.stockBalances, stockMap);
    await setPk(schema.categories, categoriesMap);
    await setPk(schema.locations, locationsMap);
    await setPk(schema.warehouses, warehousesMap);
    await setPk(schema.branches, branchesMap);
    await setPk(schema.users, usersMap);

    // 5) Pasang ulang semua FK.
    for (const stmt of FK_ADD) {
      await tx.execute(sql.raw(stmt));
    }
  });

  console.log("Backfill ID selesai — semua ID dalam format baru.");
}

main()
  .catch((e) => {
    console.error("Backfill gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
