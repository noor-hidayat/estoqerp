// Migrasi opname + rewrite ID ke format {prefix}-{YYMM}-{0001} (sekali jalan).
//
// Alur:
//  1. Baca data opname legacy (projects/scan_sessions/scan_records/opname_entries
//     + opname_projects/opname_warehouses lama) ke memori.
//  2. Jalankan SQL migrasi drizzle terbaru (0023_*) — drop tabel legacy,
//     buat 4 tabel opname baru.
//  3. Insert ulang data opname yang sudah ditransformasi (id format baru).
//  4. Rewrite ID SEMUA tabel lain ke format baru (drop FK → remap → pasang ulang).
//  5. Tandai migrasi 0023 sebagai sudah dijalankan di tabel journal drizzle.
//
// Wajib backup DB sebelum menjalankan script ini!
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { db, pool } from "./pool";
import * as schema from "./schema";

const MIGRATIONS_DIR = join(__dirname, "../../drizzle");

function yymmOf(d: Date | string | null | undefined): string {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return yymmOf(null);
  return `${String(dt.getFullYear()).slice(-2)}${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function makeCounter() {
  const counters = new Map<string, number>();
  return (prefix: string, date?: Date | string | null): string => {
    const key = `${prefix}-${yymmOf(date)}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return `${key}-${String(n).padStart(4, "0")}`;
  };
}

const nextId = makeCounter();

/** Normalisasi nilai tanggal dari hasil query raw → Date | null. */
function asDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

interface FkDef {
  tbl: string;
  conname: string;
  def: string;
}

async function captureFks(): Promise<FkDef[]> {
  const res = await db.execute(sql`
    SELECT conrelid::regclass::text AS tbl, conname,
           pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype = 'f'
    ORDER BY conname
  `);
  return (res.rows as { tbl: string; conname: string; def: string }[]).map((r) => ({
    tbl: String(r.tbl).replace(/^public\./, ""),
    conname: String(r.conname),
    def: String(r.def),
  }));
}

async function dropAllFks() {
  const fks = await captureFks();
  for (const fk of fks) {
    await db.execute(sql.raw(`ALTER TABLE ${fk.tbl} DROP CONSTRAINT ${fk.conname};`));
  }
  return fks;
}

async function restoreFks(fks: FkDef[]) {
  for (const fk of fks) {
    await db.execute(sql.raw(`ALTER TABLE ${fk.tbl} ADD CONSTRAINT ${fk.conname} ${fk.def};`));
  }
}

function idOf(table: AnyPgTable): AnyPgColumn {
  return (table as unknown as { id: AnyPgColumn }).id;
}

const get = (map: Map<string, string>, v: string | null | undefined): string | null => {
  if (!v) return v ?? null;
  return map.get(v) ?? v;
};

// ---------------------------------------------------------------------------
// STEP 1 — baca data opname legacy (tabel sudah dihapus dari schema.ts,
// dibaca via raw SQL)
// ---------------------------------------------------------------------------
async function readLegacy() {
  const camel = (row: Record<string, any>) => {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    return out;
  };
  const q = async (table: string) => {
    try {
      const res = await db.execute(sql.raw(`SELECT * FROM ${table}`));
      return ((res.rows ?? []) as Record<string, any>[]).map(camel);
    } catch {
      return [] as Record<string, any>[];
    }
  };
  const [projects, sessions, records, parents, whs] = await Promise.all([
    q("projects"),
    q("scan_sessions"),
    q("scan_records"),
    q("opname_projects"),
    q("opname_warehouses"),
  ]);
  console.log(
    `[migrate-opname] legacy: ${projects.length} projects, ${sessions.length} sessions, ${records.length} records, ${parents.length} parents, ${whs.length} opname_warehouses`
  );
  return { projects, sessions, records, parents, whs };
}

// ---------------------------------------------------------------------------
// STEP 2 — jalankan migrasi 0023 (schema opname baru)
// ---------------------------------------------------------------------------
async function applyMigration(fileName: string): Promise<string> {
  const filePath = join(MIGRATIONS_DIR, fileName);
  const content = readFileSync(filePath, "utf8");
  const statements = content
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt));
  }
  return createHash("sha256").update(content).digest("hex");
}

async function markMigrationApplied(fileName: string, hash: string) {
  await db.execute(sql.raw(`
    INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
    VALUES ('${hash}', ${Date.now()})
    ON CONFLICT DO NOTHING
  `));
  console.log(`[migrate-opname] migrasi ${fileName} ditandai sudah dijalankan.`);
}

// ---------------------------------------------------------------------------
// STEP 3 — transformasi data opname legacy → 4 tabel baru
// ---------------------------------------------------------------------------
async function insertTransformed(
  projects: Record<string, any>[],
  sessions: Record<string, any>[],
  records: Record<string, any>[],
  parents: Record<string, any>[],
  whs: Record<string, any>[]
) {
  const childByParent = new Map<string, Record<string, any>[]>();
  for (const p of projects) {
    if (!p.projectId) continue;
    const arr = childByParent.get(p.projectId) ?? [];
    arr.push(p);
    childByParent.set(p.projectId, arr);
  }

  const derive = (children: Record<string, any>[]): string => {
    const all = children.map((c) => c.status);
    if (all.length === 0) return "DRAFT";
    if (all.every((s) => s === "APPROVED")) return "APPROVED";
    if (all.every((s) => s === "CANCELLED")) return "CANCELLED";
    if (all.some((s) => s === "IN_PROGRESS")) return "IN_PROGRESS";
    return "DRAFT";
  };
  const whStatusOf = (st: string): string =>
    st === "APPROVED" ? "COMPLETED" : st === "CANCELLED" ? "CANCELLED" : st === "IN_PROGRESS" ? "IN_PROGRESS" : "PENDING";

  const projectIdMap = new Map<string, string>(); // old parent id → new
  const childIdMap = new Map<string, string>(); // old child project id → new opname_warehouses id
  const scanIdMap = new Map<string, string>(); // old session id → new opname_scans id

  // Parents lama (PRJ-*) — termasuk yang tidak punya children.
  const allParents = new Set([...parents.map((p) => p.id), ...childByParent.keys()]);
  for (const pid of allParents) {
    const old = parents.find((p) => p.id === pid);
    const children = childByParent.get(pid) ?? [];
    const createdAt = asDate(old?.createdAt) ?? asDate(children[0]?.createdAt) ?? new Date();
    const mode = children[0]?.mode ?? "COMPARE";
    const status = old?.status && old.status !== "DRAFT" ? old.status : derive(children);
    const newId = nextId("opj", createdAt);
    projectIdMap.set(pid, newId);
    await db.insert(schema.opnameProjects).values({
      id: newId,
      name: old?.name ?? children[0]?.name ?? "Opname",
      mode,
      status,
      createdAt,
      updatedAt: asDate(old?.updatedAt) ?? createdAt,
      deadline: asDate(old?.deadline) ?? asDate(children[0]?.deadline),
      opnameDate: asDate(old?.opnameDate)?.toISOString().slice(0, 10) ?? null,
      createdBy: old?.createdBy ?? children[0]?.createdBy ?? null,
      description: old?.description ?? null,
    });
  }

  // Child project tanpa parent (id numerik legacy) → jadikan project sendiri.
  for (const child of projects) {
    if (child.projectId || projectIdMap.has(child.id)) continue;
    const createdAt = asDate(child.createdAt) ?? new Date();
    const newId = nextId("opj", createdAt);
    projectIdMap.set(child.id, newId);
    await db.insert(schema.opnameProjects).values({
      id: newId,
      name: child.name ?? "Opname",
      mode: child.mode ?? "COMPARE",
      status: child.status ?? "DRAFT",
      createdAt,
      updatedAt: createdAt,
      deadline: asDate(child.deadline),
      opnameDate: null,
      createdBy: child.createdBy ?? null,
      description: null,
    });
  }

  // opname_warehouses dari children + opname_warehouses lama.
  const seenWh = new Set<string>();
  for (const child of [...projects].sort((a, b) => (asDate(a.createdAt) ?? new Date(0)).getTime() - (asDate(b.createdAt) ?? new Date(0)).getTime())) {
    const parentKey = child.projectId ?? child.id;
    const parentNewId = projectIdMap.get(parentKey);
    if (!parentNewId) continue;
    const key = `${parentKey}|${child.warehouseId}`;
    if (seenWh.has(key)) continue;
    seenWh.add(key);
    const newId = nextId("opw", child.createdAt);
    childIdMap.set(child.id, newId);
    await db.insert(schema.opnameWarehouses).values({
      id: newId,
      opnameId: parentNewId,
      warehouseId: child.warehouseId,
      status: whStatusOf(child.status) as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
      startedAt: child.status === "DRAFT" ? null : asDate(child.createdAt),
      completedAt: child.status === "APPROVED" || child.status === "CANCELLED" ? asDate(child.deadline) ?? asDate(child.createdAt) : null,
      createdAt: asDate(child.createdAt) ?? new Date(),
    });
  }
  for (const w of whs) {
    const key = `${w.opnameId}|${w.warehouseId}`;
    if (seenWh.has(key) || !projectIdMap.has(w.opnameId)) continue;
    seenWh.add(key);
    await db.insert(schema.opnameWarehouses).values({
      id: nextId("opw", w.createdAt),
      opnameId: projectIdMap.get(w.opnameId)!,
      warehouseId: w.warehouseId,
      status: (w.status ?? "PENDING") as "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
      startedAt: asDate(w.startedAt),
      completedAt: asDate(w.completedAt),
      createdAt: asDate(w.createdAt) ?? new Date(),
    });
  }

  // opname_scans dari sessions.
  const childOfSession = new Map<string, Record<string, any>>();
  for (const s of sessions) {
    const child = projects.find((p) => p.id === s.projectId);
    if (!child) continue;
    const parentKey = child.projectId ?? child.id;
    const parentNewId = projectIdMap.get(parentKey);
    if (!parentNewId) continue;
    childOfSession.set(s.id, child);
    const newId = nextId("ops", s.startedAt);
    scanIdMap.set(s.id, newId);
    const startedAt = asDate(s.startedAt) ?? new Date();
    await db.insert(schema.opnameScans).values({
      id: newId,
      opnameId: parentNewId,
      scannedBy: s.scannedBy ?? null,
      status: s.status === "ACTIVE" ? "DRAFT" : "POSTED",
      startedAt,
      completedAt: asDate(s.endedAt),
      createdAt: startedAt,
      updatedAt: asDate(s.endedAt) ?? startedAt,
    });
  }

  // opname_scan_details dari records.
  let detailCount = 0;
  for (const r of [...records].sort((a, b) => (asDate(a.scannedAt) ?? new Date(0)).getTime() - (asDate(b.scannedAt) ?? new Date(0)).getTime())) {
    const child = childOfSession.get(r.sessionId);
    const scanId = scanIdMap.get(r.sessionId);
    if (!child || !scanId) continue;
    const parentNewId = projectIdMap.get(child.projectId ?? child.id);
    if (!parentNewId) continue;
    const parsed = (r.parsed ?? {}) as Record<string, unknown>;
    const batchNumber = typeof parsed.BATCH === "string" && parsed.BATCH.trim() ? parsed.BATCH.trim() : null;
    await db.insert(schema.opnameScanDetails).values({
      id: nextId("osd", r.scannedAt),
      scanId,
      opnameId: parentNewId,
      warehouseId: child.warehouseId,
      locationId: r.locationId ?? null,
      itemId: r.itemId ?? "",
      barcode: r.barcode,
      batch: batchNumber,
      batchId: r.batchId ?? null,
      parsed,
      quantity: r.quantity,
      qtyMode: r.qtyMode ?? "AUTO",
      source: r.source ?? "SCANNER",
      scannedAt: asDate(r.scannedAt) ?? new Date(),
    });
    detailCount += 1;
  }
  console.log(`[migrate-opname] transformasi: ${projectIdMap.size} project, ${seenWh.size} opname_warehouses, ${scanIdMap.size} scan, ${detailCount} detail`);
}

// ---------------------------------------------------------------------------
// STEP 4 — rewrite ID semua tabel ke format baru
// ---------------------------------------------------------------------------
async function rewriteIds() {
  const s = schema;
  const cmp = (a: string, b: string) => a.localeCompare(b);

  const usersAll = await db.select().from(s.users);
  const branchesAll = await db.select().from(s.branches);
  const warehousesAll = await db.select().from(s.warehouses);
  const locationsAll = await db.select().from(s.locations);
  const itemGroupsAll = await db.select().from(s.itemGroups);
  const itemsAll = await db.select().from(s.items);
  const uomAll = await db.select().from(s.uom);
  const stockAll = await db.select().from(s.stockBalances);
  const formatsAll = await db.select().from(s.barcodeFormats);
  const bformatsAll = await db.select().from(s.batchFormats);
  const batchesAll = await db.select().from(s.batches);
  const stockBatchesAll = await db.select().from(s.stockBatches);
  const mvtAll = await db.select().from(s.movementTypes);
  const movementsAll = await db.select().from(s.stockMovements);
  const detailsAll = await db.select().from(s.stockMovementDetails);
  const ledgerAll = await db.select().from(s.stockLedger);
  const permsAll = await db.select().from(s.rolePermissions);
  const bxaAll = await db.select().from(s.branchAccesses);
  const stgAll = await db.select().from(s.userSettings);

  const byDate = (rows: { id: string }[], dateOf: (r: any) => Date | string | null, prefix: string) =>
    new Map(
      [...rows]
        .sort((a, b) => new Date(dateOf(a) ?? 0).getTime() - new Date(dateOf(b) ?? 0).getTime() || cmp(a.id, b.id))
        .map((r) => [r.id, nextId(prefix, dateOf(r))]) as [string, string][]
    );
  const simple = (rows: { id: string }[], prefix: string) =>
    new Map([...rows].sort((a, b) => cmp(a.id, b.id)).map((r) => [r.id, nextId(prefix)]));

  const usersMap = byDate(usersAll, (r) => r.createdAt, "usr");
  const branchesMap = byDate(branchesAll, (r) => r.createdAt, "br");
  const warehousesMap = byDate(warehousesAll, (r) => r.createdAt, "wh");
  const locationsMap = byDate(locationsAll, (r) => r.createdAt, "loc");
  const itemGroupsMap = byDate(itemGroupsAll, (r) => r.createdAt, "igr");
  const itemsMap = byDate(itemsAll, (r) => r.createdAt, "itm");
  const uomMap = byDate(uomAll, (r) => r.createdAt, "uom");
  const stockMap = byDate(stockAll, (r) => r.createdAt, "sb");
  const formatsMap = byDate(formatsAll, (r) => r.createdAt, "fmt");
  const bformatsMap = byDate(bformatsAll, (r) => r.createdAt, "bfmt");
  const batchesMap = byDate(batchesAll, (r) => r.createdAt, "bat");
  const stockBatchesMap = byDate(stockBatchesAll, (r) => r.updatedAt, "stb");
  const mvtMap = byDate(mvtAll, (r) => r.createdAt, "mvt");
  const movementsMap = byDate(movementsAll, (r) => r.movementDate, "smv");
  const detailsMap = byDate(detailsAll, (r) => r.createdAt, "smd");
  const ledgerMap = byDate(ledgerAll, (r) => r.transactionDate, "sld");
  const permsMap = simple(permsAll, "pm");
  const bxaMap = simple(bxaAll, "bxa");
  const stgMap = simple(stgAll, "stg");

  // Referensi (child → parent).
  for (const rt of await db.select().from(s.refreshTokens)) {
    const n = get(usersMap, rt.userId);
    if (n !== rt.userId) await db.update(s.refreshTokens).set({ userId: n as string }).where(eq(s.refreshTokens.id, rt.id));
  }
  for (const r of bxaAll) {
    const set: Record<string, string | null> = {};
    const b = get(branchesMap, r.entityId);
    const w = get(warehousesMap, r.entityId);
    // entity_id bisa branch ATAU warehouse — remap keduanya (satu akan no-op).
    if (b !== r.entityId && r.entityType === "BRANCH") set.entityId = b;
    else if (w !== r.entityId && r.entityType === "WAREHOUSE") set.entityId = w;
    if (Object.keys(set).length) await db.update(s.branchAccesses).set(set).where(eq(s.branchAccesses.id, r.id));
  }
  for (const r of stgAll) {
    const n = get(usersMap, r.userId);
    if (n !== r.userId) await db.update(s.userSettings).set({ userId: n as string }).where(eq(s.userSettings.id, r.id));
  }
  for (const r of warehousesAll) {
    const n = get(branchesMap, r.branchId);
    if (n !== r.branchId) await db.update(s.warehouses).set({ branchId: n as string }).where(eq(s.warehouses.id, r.id));
  }
  for (const r of locationsAll) {
    const n = get(warehousesMap, r.warehouseId);
    if (n !== r.warehouseId) await db.update(s.locations).set({ warehouseId: n as string }).where(eq(s.locations.id, r.id));
  }
  for (const r of itemsAll) {
    const set: Record<string, string | null> = {};
    const ig = get(itemGroupsMap, r.itemGroupId);
    const u = get(uomMap, r.uomId);
    if (ig !== r.itemGroupId) set.itemGroupId = ig;
    if (u !== r.uomId) set.uomId = u;
    if (Object.keys(set).length) await db.update(s.items).set(set).where(eq(s.items.id, r.id));
  }
  for (const r of uomAll) {
    const n = get(usersMap, r.createdBy);
    if (n !== r.createdBy) await db.update(s.uom).set({ createdBy: n }).where(eq(s.uom.id, r.id));
  }
  for (const r of stockAll) {
    const set: Record<string, string> = {};
    const w = get(warehousesMap, r.warehouseId);
    const i = get(itemsMap, r.itemId);
    if (w !== r.warehouseId) set.warehouseId = w as string;
    if (i !== r.itemId) set.itemId = i as string;
    if (Object.keys(set).length) await db.update(s.stockBalances).set(set).where(eq(s.stockBalances.id, r.id));
  }
  for (const r of batchesAll) {
    const set: Record<string, string | null> = {};
    const i = get(itemsMap, r.itemId);
    const u = get(usersMap, r.createdBy);
    if (i !== r.itemId) set.itemId = i as string;
    if (u !== r.createdBy) set.createdBy = u;
    if (Object.keys(set).length) await db.update(s.batches).set(set).where(eq(s.batches.id, r.id));
  }
  for (const r of stockBatchesAll) {
    const set: Record<string, string> = {};
    const b = get(batchesMap, r.batchId);
    const w = get(warehousesMap, r.warehouseId);
    if (b !== r.batchId) set.batchId = b as string;
    if (w !== r.warehouseId) set.warehouseId = w as string;
    if (Object.keys(set).length) await db.update(s.stockBatches).set(set).where(eq(s.stockBatches.id, r.id));
  }
  for (const r of mvtAll) {
    const n = get(usersMap, r.createdBy);
    if (n !== r.createdBy) await db.update(s.movementTypes).set({ createdBy: n }).where(eq(s.movementTypes.id, r.id));
  }
  for (const r of movementsAll) {
    const set: Record<string, string | null> = {};
    const t = get(mvtMap, r.typeId);
    const u = get(usersMap, r.createdBy);
    if (t !== r.typeId) set.typeId = t as string;
    if (u !== r.createdBy) set.createdBy = u;
    if (Object.keys(set).length) await db.update(s.stockMovements).set(set).where(eq(s.stockMovements.id, r.id));
  }
  for (const r of detailsAll) {
    const set: Record<string, string | null> = {};
    const m = get(movementsMap, r.movementId);
    const i = get(itemsMap, r.itemId);
    const fw = get(warehousesMap, r.fromWarehouseId);
    const tw = get(warehousesMap, r.toWarehouseId);
    const u = get(uomMap, r.uomId);
    const b = get(batchesMap, r.batchId);
    if (m !== r.movementId) set.movementId = m as string;
    if (i !== r.itemId) set.itemId = i as string;
    if (fw !== r.fromWarehouseId) set.fromWarehouseId = fw;
    if (tw !== r.toWarehouseId) set.toWarehouseId = tw;
    if (u !== r.uomId) set.uomId = u;
    if (b !== r.batchId) set.batchId = b;
    if (Object.keys(set).length) await db.update(s.stockMovementDetails).set(set).where(eq(s.stockMovementDetails.id, r.id));
  }
  for (const r of ledgerAll) {
    const set: Record<string, string | null> = {};
    const i = get(itemsMap, r.itemId);
    const w = get(warehousesMap, r.warehouseId);
    const l = get(locationsMap, r.locationId);
    const b = get(batchesMap, r.batchId);
    const u = get(usersMap, r.createdBy);
    if (i !== r.itemId) set.itemId = i as string;
    if (w !== r.warehouseId) set.warehouseId = w as string;
    if (l !== r.locationId) set.locationId = l;
    if (b !== r.batchId) set.batchId = b;
    if (u !== r.createdBy) set.createdBy = u;
    if (Object.keys(set).length) await db.update(s.stockLedger).set(set).where(eq(s.stockLedger.id, r.id));
  }
  for (const f of formatsAll) {
    const segs = (f.segments ?? []) as { id: string; field: string; start: number; end: number; label?: string; batchFormatId?: string }[];
    const rebuilt = segs.map((seg, i) => ({
      id: `seg_${String(i + 1).padStart(2, "0")}`,
      field: seg.field,
      start: seg.start,
      end: seg.end,
      ...(seg.label ? { label: seg.label } : {}),
      ...(seg.batchFormatId ? { batchFormatId: get(bformatsMap, seg.batchFormatId) ?? seg.batchFormatId } : {}),
    }));
    await db.update(s.barcodeFormats).set({ segments: rebuilt }).where(eq(s.barcodeFormats.id, f.id));
  }

  // Tabel opname baru (referensi ke tabel lain ikut di-remap).
  for (const r of await db.select().from(s.opnameProjects)) {
    const n = get(usersMap, r.createdBy);
    if (n !== r.createdBy) await db.update(s.opnameProjects).set({ createdBy: n }).where(eq(s.opnameProjects.id, r.id));
  }
  for (const r of await db.select().from(s.opnameWarehouses)) {
    const n = get(warehousesMap, r.warehouseId);
    if (n !== r.warehouseId) await db.update(s.opnameWarehouses).set({ warehouseId: n as string }).where(eq(s.opnameWarehouses.id, r.id));
  }
  for (const r of await db.select().from(s.opnameScans)) {
    const n = get(usersMap, r.scannedBy);
    if (n !== r.scannedBy) await db.update(s.opnameScans).set({ scannedBy: n }).where(eq(s.opnameScans.id, r.id));
  }
  for (const r of await db.select().from(s.opnameScanDetails)) {
    const set: Record<string, string | null> = {};
    const w = get(warehousesMap, r.warehouseId);
    const l = get(locationsMap, r.locationId);
    const i = get(itemsMap, r.itemId);
    const b = get(batchesMap, r.batchId);
    if (w !== r.warehouseId) set.warehouseId = w as string;
    if (l !== r.locationId) set.locationId = l;
    if (i !== r.itemId) set.itemId = i as string;
    if (b !== r.batchId) set.batchId = b;
    if (Object.keys(set).length) await db.update(s.opnameScanDetails).set(set).where(eq(s.opnameScanDetails.id, r.id));
  }

  // Update PK.
  const setPk = async (table: AnyPgTable, map: Map<string, string>) => {
    for (const [old, next] of map) {
      await db.update(table).set({ id: next } as never).where(eq(idOf(table), old));
    }
  };
  await setPk(s.userSettings, stgMap);
  await setPk(s.branchAccesses, bxaMap);
  await setPk(s.rolePermissions, permsMap);
  await setPk(s.stockLedger, ledgerMap);
  await setPk(s.stockMovementDetails, detailsMap);
  await setPk(s.stockMovements, movementsMap);
  await setPk(s.movementTypes, mvtMap);
  await setPk(s.stockBatches, stockBatchesMap);
  await setPk(s.batches, batchesMap);
  await setPk(s.batchFormats, bformatsMap);
  await setPk(s.barcodeFormats, formatsMap);
  await setPk(s.stockBalances, stockMap);
  await setPk(s.uom, uomMap);
  await setPk(s.items, itemsMap);
  await setPk(s.itemGroups, itemGroupsMap);
  await setPk(s.locations, locationsMap);
  await setPk(s.warehouses, warehousesMap);
  await setPk(s.branches, branchesMap);
  await setPk(s.users, usersMap);

  console.log(
    `[migrate-opname] rewrite id: ${usersMap.size} users, ${branchesMap.size} branches, ${warehousesMap.size} warehouses, ${locationsMap.size} locations, ${itemsMap.size} items, ${movementsMap.size} movements, ${detailsMap.size} details, ${ledgerMap.size} ledger, ${batchesMap.size} batches`
  );
}

// ---------------------------------------------------------------------------
async function main() {
  const migrationFile = "0023_fat_aaron_stack.sql";

  // Cek apakah opname sudah bermigrasi (guard).
  const tables = await db.execute(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
      AND tablename IN ('projects', 'opname_scan_details')
  `);
  const names = (tables.rows as { tablename: string }[]).map((r) => r.tablename);
  if (names.includes("opname_scan_details") && !names.includes("projects")) {
    console.log("[migrate-opname] Sudah bermigrasi — hanya rewrite id yang mungkin perlu dijalankan.");
    const fks = await dropAllFks();
    try {
      await rewriteIds();
    } finally {
      await restoreFks(fks);
    }
    return;
  }

  // 1) Snapshot data legacy.
  const legacy = await readLegacy();

  // 2) Jalankan migrasi schema opname.
  console.log("[migrate-opname] apply migration...");
  const hash = await applyMigration(migrationFile);
  console.log("[migrate-opname] schema migrated.");

  // 3) Transformasi data ke 4 tabel baru.
  console.log("[migrate-opname] transform data...");
  await insertTransformed(legacy.projects, legacy.sessions, legacy.records, legacy.parents, legacy.whs);
  console.log("[migrate-opname] transform done.");

  // 4) Rewrite id semua tabel (FK di-drop sementara).
  const fks = await dropAllFks();
  try {
    await rewriteIds();
  } finally {
    await restoreFks(fks);
  }

  // 5) Tandai migrasi sudah dijalankan agar drizzle-kit migrate tidak
  //    menerapkannya ulang ke DB yang sudah dimigrasi.
  await markMigrationApplied(migrationFile, hash);

  console.log("[migrate-opname] Selesai. Jalankan kembali untuk rewrite id saja bila perlu.");
}

main()
  .catch((e) => {
    console.error("Migrasi gagal:", e instanceof Error ? e.message : e);
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });