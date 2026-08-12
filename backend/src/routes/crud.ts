import { Router, type Request, type Response } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { canAccessEntity, canViewOpnameContext, checkAnyPermission, checkPermission, systemRoleId } from "../middleware/rbac";

// Tabel relasi yang disinkronisasi frontend dengan pola "hapus dulu, insert
// ulang" — insert duplikat (roleId/menu/action dst.) diabaikan agar save yang
// diulang setelah kegagalan parsial tidak menabrak unique constraint.
const INSERT_OR_IGNORE = new Set([
  "rolePermissions",
  "branchAccesses",
  "userSettings",
]);

// Kolom id tidak punya default di DB — id dibuat di sini dengan format terbaca
// (pm_001, br_001, itm_001, ...). Frontend tidak mengirim id saat insert agar
// penomoran tidak balapan antar klien.
const ID_PREFIXES: Record<string, string> = {
  rolePermissions: "pm",
  branchAccesses: "bxa",
  userSettings: "stg",
  branches: "br",
  warehouses: "wh",
  locations: "loc",
  categories: "cat",
  items: "itm",
  roles: "role",
  barcodeFormats: "fmt",
  stockBalances: "sb",
  opnameEntries: "ent",
};

// Tabel volume tinggi (sesi & record scan): id UUID berprefix — tidak perlu
// scan tabel untuk mencari nomor berikutnya.
const UUID_ID_TABLES: Record<string, string> = {
  scanSessions: "ses",
  scanRecords: "rec",
};

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "23505"
  );
}

async function ensureRowId(
  tableName: string,
  values: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (values.id) return values;
  const uuidPrefix = UUID_ID_TABLES[tableName];
  if (uuidPrefix) {
    return { ...values, id: `${uuidPrefix}_${crypto.randomUUID()}` };
  }
  if (tableName === "projects") {
    // ID project historis berupa angka berurutan: "1", "2", ...
    const rows = await db.select({ id: schema.projects.id }).from(schema.projects);
    const max = rows.reduce((m, r) => {
      const n = Number(r.id);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return { ...values, id: String(max + 1) };
  }
  const prefix = ID_PREFIXES[tableName];
  if (!prefix) return values;
  const table = CRUD_TABLES[tableName];
  const rows = await db.select({ id: idColumn(table) }).from(table);
  const max = rows.reduce((m, r) => {
    const id = String(r.id);
    if (!id.startsWith(prefix + "_")) return m;
    const n = Number(id.slice(prefix.length + 1));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return { ...values, id: `${prefix}_${String(max + 1).padStart(3, "0")}` };
}

const CRUD_TABLES: Record<string, AnyPgTable> = {
  users: schema.users,
  roles: schema.roles,
  rolePermissions: schema.rolePermissions,
  branchAccesses: schema.branchAccesses,
  branches: schema.branches,
  warehouses: schema.warehouses,
  locations: schema.locations,
  categories: schema.categories,
  items: schema.items,
  stockBalances: schema.stockBalances,
  barcodeFormats: schema.barcodeFormats,
  projects: schema.projects,
  scanSessions: schema.scanSessions,
  scanRecords: schema.scanRecords,
  opnameEntries: schema.opnameEntries,
  userSettings: schema.userSettings,
};

export const crudRouter = Router();

function resolveTable(req: Request, res: Response): AnyPgTable | null {
  const tableName = paramString(req, "table");
  const table = CRUD_TABLES[tableName];
  if (!table) {
    res.status(404).json({ error: `Tabel "${tableName}" tidak dikenal.` });
    return null;
  }
  return table;
}

function paramString(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function queryStr(req: Request, name: string): string | null {
  const v = req.query[name];
  if (Array.isArray(v)) return String(v[0]);
  if (typeof v === "string") return v;
  return null;
}

function queryNum(req: Request, name: string): number | null {
  const v = queryStr(req, name);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function idColumn(table: AnyPgTable) {
  return (table as unknown as { id: AnyPgColumn }).id;
}

function sanitizeRow(table: AnyPgTable, row: Record<string, unknown>) {
  if (table === schema.users) {
    const { passwordHash: _passwordHash, ...rest } = row;
    return rest;
  }
  return row;
}

async function enforceSettingsOwner(req: Request, res: Response): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === systemRoleId) return true;
  const tableName = paramString(req, "table");
  if (tableName !== "userSettings") return true;

  const id = paramString(req, "id");
  if (!id) return true;
  const [row] = await db
    .select({ userId: schema.userSettings.userId })
    .from(schema.userSettings)
    .where(eq(schema.userSettings.id, id));
  if (!row || row.userId !== req.user.id) {
    res.status(403).json({ error: "Tidak dapat mengakses setting user lain." });
    return false;
  }
  return true;
}

function coerceDates(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (
      typeof value === "string" &&
      (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) ||
        /^\d{4}-\d{2}-\d{2}$/.test(value))
    ) {
      out[key] = new Date(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const TABLE_MENU: Record<string, string | string[]> = {
  users: "settings.users",
  roles: "settings.roles",
  rolePermissions: "settings.roles",
  branchAccesses: "settings.roles",
  branches: "inventory",
  warehouses: "inventory",
  locations: "inventory",
  stockBalances: "inventory",
  categories: "master",
  items: "master",
  barcodeFormats: "master",
  projects: "opname",
  // Dibaca lintas fitur: halaman Scan, daftar Session, detail Session, dan
  // laporan Riwayat Scan — cukup punya salah satu menu untuk MEMBACA.
  scanSessions: ["opname.detail.scan", "opname.detail.sessions", "opname.detail.sessions.detail"],
  scanRecords: ["opname.detail.scan", "opname.detail.sessions", "opname.detail.sessions.detail"],
  opnameEntries: "opname",
  userSettings: "opname.variance.column",
};

// MENULIS sesi/catatan scan (membuat sesi, menyimpan scan, menutup sesi)
// adalah aksi "Scan" — wajib punya permission menu scan, bukan menu lain.
const WRITE_MENU_OVERRIDE: Record<string, string> = {
  scanSessions: "opname.detail.scan",
  scanRecords: "opname.detail.scan",
};

/** Normalisasi menu tabel → daftar menu yang dicek. */
function menuListOf(tableName: string): string[] {
  const menu = TABLE_MENU[tableName];
  if (!menu) return [];
  return Array.isArray(menu) ? menu : [menu];
}

// Tabel pendukung yang dibaca halaman opname (scan, detail project, variance):
// lokasi/rak, item, format barcode, branch/warehouse, dan nama user. Data ini
// perlu terlihat oleh siapa pun yang boleh membuka fitur opname — tanpa harus
// punya permission menu master/inventory/settings.
const OPNAME_SUPPORT_READ = new Set([
  "locations",
  "branches",
  "warehouses",
  "items",
  "barcodeFormats",
  "users",
]);

/** Cek permission CRUD untuk sebuah tabel (mendukung multi-menu OR). */
async function checkTablePermission(
  req: Request,
  res: Response,
  tableName: string,
  action: string
): Promise<boolean> {
  if (
    action === "view" &&
    OPNAME_SUPPORT_READ.has(tableName) &&
    req.user &&
    (await canViewOpnameContext(req.user.role))
  ) {
    return true;
  }
  const writeMenu = WRITE_MENU_OVERRIDE[tableName];
  if (writeMenu && action !== "view") {
    return checkPermission(req, res, writeMenu, action);
  }
  const menus = menuListOf(tableName);
  if (menus.length > 1) return checkAnyPermission(req, res, menus, action);
  return checkPermission(req, res, menus[0], action);
}

const ENTITY_TYPES: Record<string, string> = {
  branchId: "BRANCH",
  warehouseId: "WAREHOUSE",
};

async function enforceEntity(
  req: Request,
  body: Record<string, unknown>
): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === systemRoleId) return true;
  for (const [field, type] of Object.entries(ENTITY_TYPES)) {
    const entityId = body[field] as string | undefined;
    if (entityId && !(await canAccessEntity(req.user.role, type as "BRANCH" | "WAREHOUSE", entityId)))
      return false;
  }
  return true;
}

function messageOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Terjadi kesalahan pada server.";
}

// ---- GET helpers ----

const DEFAULT_PAGE_SIZE = 20;
const PAGINABLE = new Set(["items", "scanSessions", "scanRecords", "stockBalances"]);

const SORT_COLS: Record<string, AnyPgColumn> = {
  items: schema.items.code,
  warehouses: schema.warehouses.code,
  locations: schema.locations.code,
  categories: schema.categories.code,
  branches: schema.branches.code,
  projects: schema.projects.createdAt,
  scanSessions: schema.scanSessions.startedAt,
  scanRecords: schema.scanRecords.scannedAt,
  stockBalances: schema.stockBalances.id,
  users: schema.users.name,
  roles: schema.roles.name,
  barcodeFormats: schema.barcodeFormats.updatedAt,
};

function getOrderBy(req: Request, tableName: string) {
  const col = SORT_COLS[tableName];
  if (!col) return undefined;
  const dir = queryStr(req, "orderDir") === "asc" ? "asc" : "desc";
  return dir === "asc" ? sql`${col} ASC NULLS LAST` : sql`${col} DESC NULLS LAST`;
}

async function applyEntityScope(req: Request, tableName: string) {
  if (!req.user) return undefined;
  if (req.user.role === systemRoleId) return undefined;

  const s = schema;
  const branchIds = req.accessibleBranchIds ?? [];
  const warehouseIds = req.accessibleWarehouseIds ?? [];

  if (tableName === "branches") {
    return branchIds.length > 0 ? inArray(s.branches.id, branchIds) : sql`FALSE`;
  }
  if (tableName === "warehouses") {
    const conds: ReturnType<typeof sql>[] = [];
    if (warehouseIds.length > 0) conds.push(inArray(s.warehouses.id, warehouseIds));
    if (branchIds.length > 0) conds.push(inArray(s.warehouses.branchId, branchIds));
    return conds.length > 0 ? or(...conds) : sql`FALSE`;
  }
  if (tableName === "locations") {
    if (warehouseIds.length > 0) return inArray(s.locations.warehouseId, warehouseIds);
    if (branchIds.length > 0) {
      return inArray(
        s.locations.warehouseId,
        db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))
      );
    }
    return sql`FALSE`;
  }
  if (tableName === "projects") {
    const conds: ReturnType<typeof sql>[] = [];
    if (branchIds.length > 0) conds.push(inArray(s.projects.branchId, branchIds));
    if (warehouseIds.length > 0) conds.push(inArray(s.projects.warehouseId, warehouseIds));
    return conds.length > 0 ? or(...conds) : sql`FALSE`;
  }
  if (tableName === "scanSessions" || tableName === "scanRecords" || tableName === "opnameEntries") {
    const tbl: AnyPgTable = tableName === "scanSessions" ? s.scanSessions : tableName === "scanRecords" ? s.scanRecords : s.opnameEntries;
    const projectCol = (tbl as unknown as { projectId: AnyPgColumn }).projectId;
    const projConds: ReturnType<typeof sql>[] = [];
    if (branchIds.length > 0) projConds.push(inArray(s.projects.branchId, branchIds));
    if (warehouseIds.length > 0) projConds.push(inArray(s.projects.warehouseId, warehouseIds));
    if (projConds.length > 0) {
      return inArray(projectCol, db.select({ id: s.projects.id }).from(s.projects).where(or(...projConds)));
    }
    return undefined;
  }
  if (tableName === "stockBalances") {
    if (warehouseIds.length > 0) return inArray(s.stockBalances.warehouseId, warehouseIds);
    if (branchIds.length > 0) {
      return inArray(
        s.stockBalances.warehouseId,
        db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))
      ) as ReturnType<typeof sql>;
    }
    return sql`FALSE`;
  }
  return undefined;
}

async function buildWhere(req: Request, table: AnyPgTable, tableName: string) {
  const conditions: ReturnType<typeof sql>[] = [];
  const scope = await applyEntityScope(req, tableName);
  if (scope) conditions.push(scope);

  const s = schema;
  if (tableName === "warehouses") {
    const branchId = queryStr(req, "branchId");
    if (branchId) conditions.push(eq(s.warehouses.branchId, branchId));
  }
  if (tableName === "locations") {
    const warehouseId = queryStr(req, "warehouseId");
    if (warehouseId) conditions.push(eq(s.locations.warehouseId, warehouseId));
  }
  if (tableName === "items") {
    const q = queryStr(req, "query");
    if (q) conditions.push(sql`(${s.items.code} ILIKE ${`%${q}%`} OR ${s.items.name} ILIKE ${`%${q}%`})`);
    const categoryId = queryStr(req, "categoryId");
    if (categoryId) conditions.push(eq(s.items.categoryId, categoryId));
  }
  if (tableName === "stockBalances") {
    const warehouseId = queryStr(req, "warehouseId");
    if (warehouseId) conditions.push(eq(s.stockBalances.warehouseId, warehouseId));
    const itemId = queryStr(req, "itemId");
    if (itemId) conditions.push(eq(s.stockBalances.itemId, itemId));
  }
  if (tableName === "projects") {
    const branchId = queryStr(req, "branchId");
    if (branchId) conditions.push(eq(s.projects.branchId, branchId));
  }
  if (tableName === "scanSessions") {
    const projectId = queryStr(req, "projectId");
    if (projectId) conditions.push(eq(s.scanSessions.projectId, projectId));
    const status = queryStr(req, "status");
    if (status) conditions.push(sql`${s.scanSessions.status} = ${status}`);
  }
  if (tableName === "scanRecords") {
    const projectId = queryStr(req, "projectId");
    if (projectId) conditions.push(eq(s.scanRecords.projectId, projectId));
    const sessionId = queryStr(req, "sessionId");
    if (sessionId) conditions.push(eq(s.scanRecords.sessionId, sessionId));
    const source = queryStr(req, "source");
    if (source) conditions.push(sql`${s.scanRecords.source} = ${source}`);
    const date = queryStr(req, "date");
    if (date) conditions.push(sql`DATE(${s.scanRecords.scannedAt}) = ${date}`);
  }
  if (tableName === "rolePermissions") {
    const roleId = queryStr(req, "roleId");
    if (roleId) conditions.push(eq(s.rolePermissions.roleId, roleId));
  }
  if (tableName === "branchAccesses") {
    const roleId = queryStr(req, "roleId");
    if (roleId) conditions.push(eq(s.branchAccesses.roleId, roleId));
  }
  if (tableName === "opnameEntries") {
    const projectId = queryStr(req, "projectId");
    if (projectId) conditions.push(eq(s.opnameEntries.projectId, projectId));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// GET /:table — list with filters & pagination
crudRouter.get("/:table", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;

  if (!(await checkTablePermission(req, res, tableName, "view"))) return;

  try {
    const whereCond = await buildWhere(req, table, tableName);
    const orderBy = getOrderBy(req, tableName);

    // Pagination hanya aktif bila param page/pageSize dikirim eksplisit.
    // Tanpa param, kembalikan array penuh (untuk lookup/hook non-paginated).
    const wantsPagination =
      PAGINABLE.has(tableName) &&
      (queryStr(req, "page") !== null || queryStr(req, "pageSize") !== null);

    if (wantsPagination) {
      const page = queryNum(req, "page") ?? 1;
      const pageSize = queryNum(req, "pageSize") ?? DEFAULT_PAGE_SIZE;
      const offset = (page - 1) * pageSize;

      let q = db.select().from(table).$dynamic();
      if (whereCond) q = q.where(whereCond);

      const countQ = db.select({ count: sql<number>`count(*)` }).from(table).$dynamic();
      if (whereCond) countQ.where(whereCond!);
      const [c] = await countQ;
      const total = Number(c.count);

      if (orderBy) q = q.orderBy(orderBy);
      q = q.offset(offset).limit(pageSize);

      const rows = (await q).map((r) => sanitizeRow(table, r as Record<string, unknown>));

      res.json({
        rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } else {
      let q = db.select().from(table).$dynamic();
      if (whereCond) q = q.where(whereCond);
      if (orderBy) q = q.orderBy(orderBy);
      const rows = (await q).map((r) => sanitizeRow(table, r as Record<string, unknown>));
      res.json(rows);
    }
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /:table/:id — single row
// ---- Special endpoints (registered before generic /:table routes) ----

// GET /items/lookup?barcode=&formatId?
crudRouter.get("/items/lookup", async (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  // Scan page membutuhkan lookup item — izinkan siapa pun yang boleh
  // membuka opname; selain itu tetap butuh akses master.
  if (!(await canViewOpnameContext(req.user.role))) {
    if (!(await checkPermission(req, res, "master", "view"))) return;
  }
  try {
    const barcodeRaw = queryStr(req, "barcode");
    const formatId = queryStr(req, "formatId");
    if (!barcodeRaw) { res.json({ found: false, detail: "no barcode" }); return; }
    const barcode = barcodeRaw.trim();

    const formats = formatId
      ? await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.id, formatId)).limit(1)
      : await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.isActive, true));

    const categoriesAll = await db.select().from(schema.categories);
    const itemsAll = await db.select().from(schema.items);

    for (const fmt of formats) {
      const segments = (fmt.segments ?? []) as { id: string; field: string; start: number; end: number; label?: string }[];
      if (barcode.length < segments.reduce((m, s) => Math.max(m, s.end), 0)) continue;

      const values: Record<string, string> = {};
      let itemCode: string | null = null;
      let categoryCode: string | null = null;
      let barcodeId: string | null = null;

      for (const seg of segments) {
        const val = barcode.slice(seg.start, seg.end);
        values[seg.field] = val;
        if (seg.field === "ITEM_CODE") itemCode = val;
        if (seg.field === "CATEGORY") categoryCode = val;
        if (seg.field === "BARCODE_ID") barcodeId = val;
      }

      if (barcodeId) {
        const item = itemsAll.find((it) => it.barcodeId === barcodeId);
        if (item) {
          const cat = categoriesAll.find((c) => c.id === item.categoryId) ?? null;
          res.json({ found: true, item, category: cat ? { id: cat.id, code: cat.code, name: cat.name } : null, matched: true, formatId: fmt.id, formatName: fmt.name, values });
          return;
        }
      }
      if (itemCode) {
        const item = itemsAll.find((it) => it.code.toLowerCase() === itemCode!.toLowerCase());
        if (item) {
          const cat = categoriesAll.find((c) => categoryCode ? c.code.toLowerCase() === categoryCode.toLowerCase() : c.id === item.categoryId) ?? null;
          res.json({ found: true, item, category: cat ? { id: cat.id, code: cat.code, name: cat.name } : null, matched: true, formatId: fmt.id, formatName: fmt.name, values });
          return;
        }
      }
    }
    res.json({ found: false, detail: "no match" });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /scan-records/check?projectId=&barcode=&excludeSessionId=
crudRouter.get("/scan-records/check", async (req, res) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;
  try {
    const projectId = queryStr(req, "projectId");
    const barcode = queryStr(req, "barcode");
    const excludeSessionId = queryStr(req, "excludeSessionId");
    if (!projectId || !barcode) { res.json({ exists: false }); return; }

    const conds: ReturnType<typeof sql>[] = [
      eq(schema.scanRecords.projectId, projectId),
      eq(schema.scanRecords.barcode, barcode),
    ];
    if (excludeSessionId) {
      conds.push(sql`${schema.scanRecords.sessionId} != ${excludeSessionId}`);
    }

    const [record] = await db
      .select({
        sessionId: schema.scanRecords.sessionId,
        locationId: schema.scanRecords.locationId,
        scannedAt: schema.scanRecords.scannedAt,
        scannedBy: schema.scanSessions.scannedBy,
      })
      .from(schema.scanRecords)
      .leftJoin(schema.scanSessions, eq(schema.scanRecords.sessionId, schema.scanSessions.id))
      .where(and(...conds))
      .orderBy(sql`${schema.scanRecords.scannedAt} DESC`)
      .limit(1);

    if (!record) { res.json({ exists: false }); return; }

    const [user] = record.scannedBy
      ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, record.scannedBy)).limit(1)
      : [null];
    const [loc] = record.locationId
      ? await db.select({ code: schema.locations.code }).from(schema.locations).where(eq(schema.locations.id, record.locationId)).limit(1)
      : [null];

    res.json({
      exists: true,
      record: {
        sessionId: record.sessionId,
        scannedBy: user?.name ?? "—",
        locationCode: loc?.code ?? "—",
        scannedAt: record.scannedAt,
      },
    });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /projects/:id/stats
crudRouter.get("/projects/:id/stats", async (req, res) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;
  try {
    const projectId = paramString(req, "id");
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
    if (!project) { res.status(404).json({ error: "Project tidak ditemukan." }); return; }

    const [{ count: totalLoc }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.locations)
      .where(eq(schema.locations.warehouseId, project.warehouseId));

    const scannedLocs = await db
      .selectDistinct({ locationId: schema.scanRecords.locationId })
      .from(schema.scanRecords)
      .where(sql`${schema.scanRecords.projectId} = ${projectId} AND ${schema.scanRecords.locationId} IS NOT NULL`);

    const whLocIds = new Set(
      (await db.select({ id: schema.locations.id }).from(schema.locations)
        .where(eq(schema.locations.warehouseId, project.warehouseId)))
        .map((l) => l.id)
    );
    const counted = scannedLocs.filter((s) => s.locationId && whLocIds.has(s.locationId)).length;
    const pct = Number(totalLoc) > 0 ? Math.round((counted / Number(totalLoc)) * 100) : 0;

    const records = await db
      .select({ itemId: schema.scanRecords.itemId, quantity: schema.scanRecords.quantity })
      .from(schema.scanRecords)
      .where(eq(schema.scanRecords.projectId, projectId));

    const balances = await db
      .select({ itemId: schema.stockBalances.itemId, qty: schema.stockBalances.qty })
      .from(schema.stockBalances)
      .where(eq(schema.stockBalances.warehouseId, project.warehouseId));

    const itemsAll = await db.select().from(schema.items);

    const countedByItem = new Map<string, number>();
    for (const r of records) {
      if (!r.itemId) continue;
      countedByItem.set(r.itemId, (countedByItem.get(r.itemId) ?? 0) + r.quantity);
    }

    const stockByItem = new Map<string, number>();
    for (const sb of balances) {
      stockByItem.set(sb.itemId, (stockByItem.get(sb.itemId) ?? 0) + sb.qty);
    }

    const candidateIds = new Set([...stockByItem.keys(), ...countedByItem.keys()]);
    const variance: { itemId: string; itemCode: string; itemName: string; unit: string; systemQty: number; countedQty: number; diff: number }[] = [];

    for (const itemId of candidateIds) {
      const item = itemsAll.find((it) => it.id === itemId);
      if (!item) continue;
      const systemQty = stockByItem.get(itemId) ?? 0;
      const countedQty = countedByItem.get(itemId) ?? 0;
      variance.push({
        itemId, itemCode: item.code, itemName: item.name, unit: item.unit,
        systemQty, countedQty,
        diff: countedQty - systemQty,
      });
    }
    variance.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

    res.json({
      projectId, progress: { total: Number(totalLoc), counted, pct }, variance,
    });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

crudRouter.get("/:table/:id", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;

  if (!(await checkTablePermission(req, res, tableName, "view"))) return;

  try {
    const [row] = await db
      .select()
      .from(table)
      .where(eq(idColumn(table), paramString(req, "id")));
    if (!row) {
      res.status(404).json({ error: "Data tidak ditemukan." });
      return;
    }
    res.json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// POST /:table
crudRouter.post("/:table", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;

  if (!(await checkTablePermission(req, res, tableName, "create"))) return;

  try {
    const values = coerceDates(req.body);
    if (!(await enforceEntity(req, values)))
      return res.status(403).json({ error: "Tidak memiliki akses entitas." });
    if (tableName === "userSettings" && req.user) {
      values.userId = req.user.id;
    }
    if (tableName === "items" && typeof values.code === "string") {
      values.code = values.code.trim();
      const [dup] = await db
        .select({ id: schema.items.id })
        .from(schema.items)
        .where(sql`lower(${schema.items.code}) = lower(${values.code})`)
        .limit(1);
      if (dup) {
        return res.status(409).json({ error: "Kode item sudah digunakan." });
      }
    }
    let insertValues = await ensureRowId(tableName, values);
    let rows: Record<string, unknown>[];
    try {
      rows = INSERT_OR_IGNORE.has(tableName)
        ? await db.insert(table).values(insertValues).onConflictDoNothing().returning()
        : await db.insert(table).values(insertValues).returning();
    } catch (e) {
      // Dua request bersamaan bisa menghitung id max+1 yang sama — coba lagi
      // dengan id baru (hanya bila id dibuat di server, bukan dikirim klien).
      if (!values.id && isUniqueViolation(e) && (ID_PREFIXES[tableName] || tableName === "projects")) {
        insertValues = await ensureRowId(tableName, values);
        rows = await db.insert(table).values(insertValues).returning();
      } else {
        throw e;
      }
    }
    const row = rows[0] ?? insertValues;
    res.status(201).json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// PATCH /:table/:id
crudRouter.patch("/:table/:id", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;

  if (!(await checkTablePermission(req, res, tableName, "update"))) return;

  try {
    if (!(await enforceSettingsOwner(req, res))) return;
    const values = coerceDates(req.body);
    if (tableName === "userSettings") delete values.userId;
    if (tableName === "items" && typeof values.code === "string") {
      values.code = values.code.trim();
      const [dup] = await db
        .select({ id: schema.items.id })
        .from(schema.items)
        .where(
          sql`lower(${schema.items.code}) = lower(${values.code}) AND ${schema.items.id} != ${paramString(req, "id")}`
        )
        .limit(1);
      if (dup) {
        return res.status(409).json({ error: "Kode item sudah digunakan." });
      }
    }
    const [row] = await db
      .update(table)
      .set(values)
      .where(eq(idColumn(table), paramString(req, "id")))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Data tidak ditemukan." });
      return;
    }
    res.json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// DELETE /:table/:id
crudRouter.delete("/:table/:id", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;

  if (!(await checkTablePermission(req, res, tableName, "delete"))) return;

  try {
    if (!(await enforceSettingsOwner(req, res))) return;
    const [row] = await db
      .delete(table)
      .where(eq(idColumn(table), paramString(req, "id")))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Data tidak ditemukan." });
      return;
    }
    res.json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});
