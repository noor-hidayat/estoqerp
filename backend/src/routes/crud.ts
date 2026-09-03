import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { parseBatchNumber, type BatchFormatLike } from "../lib/batch-parse";
import { nextRowId } from "../lib/id";
import { canAccessEntity, canViewOpnameContext, checkAnyPermission, checkPermission, systemRoleId } from "../middleware/rbac";

// Tabel relasi yang disinkronisasi frontend dengan pola "hapus dulu, insert
// ulang" — insert duplikat (roleId/menu/action dst.) diabaikan agar save yang
// diulang setelah kegagalan parsial tidak menabrak unique constraint.
const INSERT_OR_IGNORE = new Set([
  "rolePermissions",
  "branchAccesses",
  "workspaceAccesses",
  "userSettings",
]);

// Kolom id tidak punya default di DB — id dibuat di sini dengan format
// {prefix}-{YYMM}-{0001} (itm-2608-0001, br-2608-0001, ...). Frontend tidak
// mengirim id saat insert agar penomoran tidak balapan antar klien.
const ID_PREFIXES: Record<string, string> = {
  rolePermissions: "pm",
  branchAccesses: "bxa",
  workspaceAccesses: "wsa",
  userSettings: "stg",
  branches: "br",
  warehouses: "wh",
  locations: "loc",
  itemGroups: "igr",
  items: "itm",
  roles: "role",
  barcodeFormats: "fmt",
  batchFormats: "bfmt",
  stockBalances: "sb",
  batches: "bat",
  uom: "uom",
  movementTypes: "mvt",
  opnameWarehouses: "opw",
  opnameScans: "ops",
  opnameScanDetails: "osd",
  stockMovementDetails: "smd",
  stockLedger: "sld",
  stockBatches: "stb",
  stockBarcodes: "sbc",
  suppliers: "sup",
  customers: "cus",
  workspaces: "wsp",
};

// Semua tabel memakai id serial {prefix}-{YYMM}-{0001} — lihat nextRowId().
// Tidak ada lagi id UUID: tabel volume tinggi (scan detail, ledger) ikut
// serial bulanan, dihitung via LIKE prefix agar tidak scan seluruh tabel.

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "23505"
  );
}

function isForeignKeyViolation(e: unknown): boolean {
  const code =
    (e as { code?: string } | null)?.code ??
    ((e as { cause?: { code?: string } } | null)?.cause?.code);
  return code === "23503";
}

// Pesan jelas saat hapus diblokir foreign key (data masih dipakai).
const DELETE_BLOCK_MESSAGES: Record<string, string> = {
  itemGroups:
    "Grup item ini masih dipakai oleh item — pindahkan item ke grup lain atau hapus item-nya terlebih dahulu.",
  items:
    "Item ini masih tercatat dalam hasil stock opname (scan detail) — data opname yang sudah masuk perhitungan tidak bisa dihapus.",
  branches:
    "Branch ini masih dipakai oleh gudang atau project opname — pindahkan atau hapus data terkait terlebih dahulu.",
  warehouses:
    "Gudang ini masih dipakai oleh lokasi, project opname, atau stock balance — pindahkan atau hapus data terkait terlebih dahulu.",
  locations:
    "Lokasi ini masih dipakai oleh scan opname atau stock — hapus data terkait terlebih dahulu.",
  roles:
    "Role ini masih dipakai oleh user — pindahkan user ke role lain terlebih dahulu.",
  users:
    "User ini masih terkait dengan data lain di sistem — tidak dapat dihapus.",
  movementTypes:
    "Tipe transaksi masih dipakai oleh transaksi stok — pindahkan atau hapus transaksi terkait terlebih dahulu.",
  uom:
    "Satuan ini masih dipakai oleh item atau transaksi — pindahkan atau hapus data terkait terlebih dahulu.",
  batches:
    "Batch ini masih tercatat dalam transaksi atau scan opname — hapus data terkait terlebih dahulu.",
};

async function ensureRowId(
  tableName: string,
  values: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (values.id) return values;
  const prefix = ID_PREFIXES[tableName];
  if (!prefix) return values;
  const table = CRUD_TABLES[tableName];
  return { ...values, id: await nextRowId(db, table, prefix) };
}

const CRUD_TABLES: Record<string, AnyPgTable> = {
  users: schema.users,
  roles: schema.roles,
  rolePermissions: schema.rolePermissions,
  branchAccesses: schema.branchAccesses,
  workspaceAccesses: schema.workspaceAccesses,
  workspaces: schema.workspaces,
  branches: schema.branches,
  warehouses: schema.warehouses,
  locations: schema.locations,
  itemGroups: schema.itemGroups,
  items: schema.items,
  stockBalances: schema.stockBalances,
  barcodeFormats: schema.barcodeFormats,
  batchFormats: schema.batchFormats,
  userSettings: schema.userSettings,
  uom: schema.uom,
  movementTypes: schema.movementTypes,
  stockMovements: schema.stockMovements,
  stockMovementDetails: schema.stockMovementDetails,
  stockLedger: schema.stockLedger,
  batches: schema.batches,
  stockBatches: schema.stockBatches,
  stockBarcodes: schema.stockBarcodes,
  opnameWarehouses: schema.opnameWarehouses,
  opnameScans: schema.opnameScans,
  opnameScanDetails: schema.opnameScanDetails,
  suppliers: schema.suppliers,
  customers: schema.customers,
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

/** Format batch aktif (segments JSONB → tipe parser). */
async function activeBatchFormats(): Promise<BatchFormatLike[]> {
  return (await db
    .select()
    .from(schema.batchFormats)
    .where(eq(schema.batchFormats.isActive, true))) as unknown as BatchFormatLike[];
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

/** Token tanggal yang dipakai di field series (lihat expandSeriesDate). */
const SERIES_DATE_TOKENS = /YYYY|YY|DD|MM|HH/gi;

/** Buat code tipe transaksi otomatis dari series: bagian statis (tanpa token
 * tanggal) dijadikan code; kalau bentrok, ditambah angka (-2, -3, ...). */
async function autoMovementTypeCode(
  seriesRaw: string,
  kind: string,
  excludeId?: string
): Promise<string> {
  const series = String(seriesRaw ?? "").trim();
  const base = (series.replace(SERIES_DATE_TOKENS, "").trim() || kind).toUpperCase();
  const slug =
    base.replace(/[^A-Z0-9_-]/g, "").replace(/^[-_]+|[-_]+$/g, "").slice(0, 12) ||
    "TYPE";
  const existing = await db
    .select({ code: schema.movementTypes.code, id: schema.movementTypes.id })
    .from(schema.movementTypes);
  const used = new Set(
    existing
      .filter((r) => r.id !== excludeId)
      .map((r) => r.code.toUpperCase())
  );
  if (!used.has(slug)) return slug;
  let i = 2;
  while (used.has(`${slug}-${i}`)) i += 1;
  return `${slug}-${i}`;
}

const TABLE_MENU: Record<string, string | string[]> = {
  users: "settings.users",
  roles: "settings.roles",
  rolePermissions: "settings.roles",
  branchAccesses: "settings.roles",
  workspaceAccesses: "settings.roles",
  workspaces: "settings.roles",
  branches: "inventory",
  warehouses: "inventory",
  locations: "inventory",
  stockBalances: "inventory",
  itemGroups: "master",
  items: "master",
  barcodeFormats: "master",
  batchFormats: "master",
  userSettings: "opname.variance.column",
  uom: "master",
  movementTypes: "master.movementTypes",
  stockMovements: "inventory.transactions",
  stockMovementDetails: "inventory.transactions",
  stockLedger: "inventory.stockLedger",
  batches: "inventory.batches",
  stockBatches: "inventory.batches",
  stockBarcodes: "inventory.batches",
  opnameWarehouses: "opname",
  // Dibaca lintas fitur: halaman Scan, riwayat scan, detail scan, dan
  // laporan Riwayat Scan — cukup punya salah satu menu untuk MEMBACA.
  opnameScans: ["opname.detail.scan", "opname.detail.sessions", "opname.detail.sessions.detail"],
  opnameScanDetails: ["opname.detail.scan", "opname.detail.sessions", "opname.detail.sessions.detail"],
  suppliers: "supply.suppliers",
  customers: "supply.customers",
};

// MENULIS scan (membuat header scan, menyimpan detail barcode, menutup scan)
// adalah aksi "Scan" — wajib punya permission menu scan, bukan menu lain.
const WRITE_MENU_OVERRIDE: Record<string, string> = {
  opnameScans: "opname.detail.scan",
  opnameScanDetails: "opname.detail.scan",
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

const SORT_COLS: Record<string, AnyPgColumn> = {
  items: schema.items.code,
  warehouses: schema.warehouses.code,
  locations: schema.locations.code,
  itemGroups: schema.itemGroups.code,
  branches: schema.branches.code,
  stockBalances: schema.stockBalances.id,
  users: schema.users.name,
  roles: schema.roles.name,
  barcodeFormats: schema.barcodeFormats.updatedAt,
  batchFormats: schema.batchFormats.updatedAt,
  uom: schema.uom.code,
  movementTypes: schema.movementTypes.code,
  stockMovements: schema.stockMovements.movementDate,
  stockLedger: schema.stockLedger.transactionDate,
  batches: schema.batches.createdAt,
  stockBatches: schema.stockBatches.updatedAt,
  stockBarcodes: schema.stockBarcodes.updatedAt,
  opnameScans: schema.opnameScans.startedAt,
  opnameScanDetails: schema.opnameScanDetails.scannedAt,
  suppliers: schema.suppliers.name,
  customers: schema.customers.name,
};

function getOrderBy(req: Request, tableName: string) {
  const col = SORT_COLS[tableName];
  if (!col) return undefined;
  const dir = queryStr(req, "orderDir") === "asc" ? "asc" : "desc";
  return dir === "asc" ? sql`${col} ASC NULLS LAST` : sql`${col} DESC NULLS LAST`;
}

// Kolom yang dicari via param `query` — filter dilakukan di SQL
// (SELECT * FROM t WHERE <col> ILIKE ...), bukan ambil semua lalu filter.
const SEARCHABLE_COLS: Record<string, AnyPgColumn[]> = {
  itemGroups: [schema.itemGroups.code, schema.itemGroups.name],
  uom: [schema.uom.code, schema.uom.name],
  movementTypes: [schema.movementTypes.code, schema.movementTypes.name],
  batches: [schema.batches.batchNumber, schema.batches.status],
  batchFormats: [schema.batchFormats.name, schema.batchFormats.id],
  stockBatches: [schema.stockBatches.batchId],
  stockBarcodes: [schema.stockBarcodes.barcode, schema.stockBarcodes.itemId],
  stockMovements: [
    schema.stockMovements.id,
    schema.stockMovements.status,
    schema.stockMovements.description,
  ],
  stockLedger: [schema.stockLedger.transactionId, schema.stockLedger.transactionType],
  items: [
    schema.items.code,
    schema.items.name,
    schema.items.alternativeCode,
    schema.items.itemGroupId,
    schema.items.id,
  ],
  suppliers: [schema.suppliers.code, schema.suppliers.name],
  customers: [schema.customers.code, schema.customers.name],
};

/**
 * Kondisi WHERE untuk pencarian teks lintas kolom. opnameScanDetails dicari
 * sampai nama hasil join (item, project, lokasi, user) lewat subquery EXISTS
 * agar bentuk SELECT utama tidak berubah.
 */
function searchCondition(tableName: string, q: string): ReturnType<typeof sql> | undefined {
  const p = `%${q}%`;
  if (tableName === "opnameScanDetails") {
    const s = schema;
    return sql`(
      ${s.opnameScanDetails.barcode}::text ILIKE ${p}
      OR ${s.opnameScanDetails.id}::text ILIKE ${p}
      OR ${s.opnameScanDetails.quantity}::text ILIKE ${p}
      OR ${s.opnameScanDetails.source}::text ILIKE ${p}
      OR ${s.opnameScanDetails.qtyMode}::text ILIKE ${p}
      OR ${s.opnameScanDetails.scanId}::text ILIKE ${p}
      OR ${s.opnameScanDetails.batch}::text ILIKE ${p}
      OR EXISTS (
        SELECT 1 FROM ${s.items} WHERE ${s.items.id} = ${s.opnameScanDetails.itemId}
          AND (${s.items.code}::text ILIKE ${p} OR ${s.items.name}::text ILIKE ${p})
      )
      OR EXISTS (
        SELECT 1 FROM ${s.opnameProjects} WHERE ${s.opnameProjects.id} = ${s.opnameScanDetails.opnameId}
          AND ${s.opnameProjects.name}::text ILIKE ${p}
      )
      OR EXISTS (
        SELECT 1 FROM ${s.locations} WHERE ${s.locations.id} = ${s.opnameScanDetails.locationId}
          AND ${s.locations.code}::text ILIKE ${p}
      )
      OR EXISTS (
        SELECT 1 FROM ${s.opnameScans} WHERE ${s.opnameScans.id} = ${s.opnameScanDetails.scanId}
          AND EXISTS (
            SELECT 1 FROM ${s.users} WHERE ${s.users.id} = ${s.opnameScans.scannedBy}
              AND ${s.users.name}::text ILIKE ${p}
          )
      )
    )`;
  }
  const cols = SEARCHABLE_COLS[tableName];
  if (!cols || cols.length === 0) return undefined;
  const ors = cols.map((col) => sql`${col}::text ILIKE ${p}`);
  return ors.length === 1 ? ors[0] : sql`(${sql.join(ors, sql.raw(" OR "))})`;
}

async function applyEntityScope(req: Request, tableName: string) {
  if (!req.user) return undefined;
  if (req.user.role === systemRoleId) return undefined;

  const s = schema;
  const branchIds = req.accessibleBranchIds ?? [];
  const warehouseIds = req.accessibleWarehouseIds ?? [];
  const workspaceIds = (req as unknown as { accessibleWorkspaceIds?: string[] }).accessibleWorkspaceIds ?? [];

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
  if (tableName === "stockLedger" || tableName === "stockBatches") {
    const whCol = tableName === "stockLedger" ? s.stockLedger.warehouseId : s.stockBatches.warehouseId;
    if (warehouseIds.length > 0) return inArray(whCol, warehouseIds);
    if (branchIds.length > 0) {
      return inArray(
        whCol,
        db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))
      ) as ReturnType<typeof sql>;
    }
    return sql`FALSE`;
  }
  if (tableName === "stockMovements" || tableName === "stockMovementDetails") {
    if (warehouseIds.length > 0) {
      const mvIds = db
        .select({ id: s.stockMovements.id })
        .from(s.stockMovements)
        .innerJoin(s.stockMovementDetails, eq(s.stockMovementDetails.movementId, s.stockMovements.id))
        .where(
          or(
            inArray(s.stockMovementDetails.fromWarehouseId, warehouseIds),
            inArray(s.stockMovementDetails.toWarehouseId, warehouseIds)
          )
        );
      return tableName === "stockMovements"
        ? inArray(s.stockMovements.id, mvIds)
        : inArray(s.stockMovementDetails.movementId, mvIds);
    }
    return sql`FALSE`;
  }
  if (tableName === "opnameWarehouses") {
    if (warehouseIds.length > 0) return inArray(s.opnameWarehouses.warehouseId, warehouseIds);
    if (branchIds.length > 0) {
      return inArray(
        s.opnameWarehouses.warehouseId,
        db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))
      ) as ReturnType<typeof sql>;
    }
    return sql`FALSE`;
  }
  if (tableName === "opnameScans") {
    // Header scan tidak punya warehouse — scope via opname_warehouses.
    const whConds: ReturnType<typeof sql>[] = [];
    if (warehouseIds.length > 0) whConds.push(inArray(s.opnameWarehouses.warehouseId, warehouseIds));
    if (branchIds.length > 0) {
      whConds.push(
        inArray(
          s.opnameWarehouses.warehouseId,
          db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))
        ) as ReturnType<typeof sql>
      );
    }
    if (whConds.length === 0) return undefined;
    return inArray(
      s.opnameScans.opnameId,
      db.select({ opnameId: s.opnameWarehouses.opnameId }).from(s.opnameWarehouses).where(or(...whConds))
    ) as ReturnType<typeof sql>;
  }
  if (tableName === "opnameScanDetails") {
    if (warehouseIds.length > 0) return inArray(s.opnameScanDetails.warehouseId, warehouseIds);
    if (branchIds.length > 0) {
      return inArray(
        s.opnameScanDetails.warehouseId,
        db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))
      ) as ReturnType<typeof sql>;
    }
    return sql`FALSE`;
  }
  if (tableName === "workspaces") {
    return workspaceIds.length > 0 ? inArray(s.workspaces.id, workspaceIds) : sql`FALSE`;
  }
  if (tableName === "dashboards") {
    // Dashboard per workspace — jika workspaceIds ada, filter
    if (workspaceIds.length > 0) {
      return or(inArray(s.dashboards.workspaceId, workspaceIds), eq(s.dashboards.isGlobal, true)) as ReturnType<typeof sql>;
    }
    return undefined;
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
    const itemGroupId = queryStr(req, "itemGroupId");
    if (itemGroupId) conditions.push(eq(s.items.itemGroupId, itemGroupId));
  }
  const q = queryStr(req, "query");
  if (q) {
    const sc = searchCondition(tableName, q);
    if (sc) conditions.push(sc);
  }
  if (tableName === "stockBalances") {
    const warehouseId = queryStr(req, "warehouseId");
    if (warehouseId) conditions.push(eq(s.stockBalances.warehouseId, warehouseId));
    const itemId = queryStr(req, "itemId");
    if (itemId) conditions.push(eq(s.stockBalances.itemId, itemId));
  }
  if (tableName === "rolePermissions") {
    const roleId = queryStr(req, "roleId");
    if (roleId) conditions.push(eq(s.rolePermissions.roleId, roleId));
  }
  if (tableName === "branchAccesses") {
    const roleId = queryStr(req, "roleId");
    if (roleId) conditions.push(eq(s.branchAccesses.roleId, roleId));
  }
  if (tableName === "opnameWarehouses") {
    const opnameId = queryStr(req, "opnameId");
    if (opnameId) conditions.push(eq(s.opnameWarehouses.opnameId, opnameId));
  }
  if (tableName === "opnameScans") {
    const opnameId = queryStr(req, "opnameId");
    if (opnameId) conditions.push(eq(s.opnameScans.opnameId, opnameId));
    const status = queryStr(req, "status");
    if (status) conditions.push(sql`${s.opnameScans.status} = ${status}`);
  }
  if (tableName === "opnameScanDetails") {
    const opnameId = queryStr(req, "opnameId");
    if (opnameId) conditions.push(eq(s.opnameScanDetails.opnameId, opnameId));
    const scanId = queryStr(req, "scanId");
    if (scanId) conditions.push(eq(s.opnameScanDetails.scanId, scanId));
    const source = queryStr(req, "source");
    if (source) conditions.push(sql`${s.opnameScanDetails.source} = ${source}`);
    const date = queryStr(req, "date");
    if (date) conditions.push(sql`DATE(${s.opnameScanDetails.scannedAt}) = ${date}`);
  }
  if (tableName === "stockBarcodes") {
    const warehouseId = queryStr(req, "warehouseId");
    if (warehouseId) conditions.push(eq(s.stockBarcodes.warehouseId, warehouseId));
    const barcode = queryStr(req, "barcode");
    if (barcode) conditions.push(eq(s.stockBarcodes.barcode, barcode));
    const itemId = queryStr(req, "itemId");
    if (itemId) conditions.push(eq(s.stockBarcodes.itemId, itemId));
    const batchId = queryStr(req, "batchId");
    if (batchId) conditions.push(eq(s.stockBarcodes.batchId, batchId));
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

    // Pagination aktif bila param page/pageSize dikirim eksplisit, untuk semua
    // tabel. Tanpa param, kembalikan array penuh (untuk lookup/hook non-paginated).
    const wantsPagination =
      queryStr(req, "page") !== null || queryStr(req, "pageSize") !== null;

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

// Kondisi WHERE umum untuk stock balances: filter scope entitas, warehouse,
// item, tanggal balance (from/to), dan pencarian teks lintas kolom
// (termasuk nama hasil join).
async function stockBalanceConds(req: Request): Promise<ReturnType<typeof sql> | undefined> {
  const conds: ReturnType<typeof sql>[] = [];
  const scope = await applyEntityScope(req, "stockBalances");
  if (scope) conds.push(scope);
  const warehouseId = queryStr(req, "warehouseId");
  if (warehouseId) conds.push(eq(schema.stockBalances.warehouseId, warehouseId));
  const itemId = queryStr(req, "itemId");
  if (itemId) conds.push(eq(schema.stockBalances.itemId, itemId));
  // Filter tanggal between pada balanceDate (inclusive). Param `from` & `to`
  // mengikuti pola /stock-ledger (YYYY-MM-DD). Alias dateFrom/dateTo/startDate/endDate
  // juga diterima untuk fleksibilitas.
  const from = queryStr(req, "from") ?? queryStr(req, "dateFrom") ?? queryStr(req, "startDate");
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) conds.push(gte(schema.stockBalances.balanceDate, from));
  const to = queryStr(req, "to") ?? queryStr(req, "dateTo") ?? queryStr(req, "endDate");
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) conds.push(lte(schema.stockBalances.balanceDate, to));
  const q = queryStr(req, "query");
  if (q) {
    const p = `%${q}%`;
    const s = schema;
    conds.push(sql`(
      ${s.stockBalances.id}::text ILIKE ${p}
      OR EXISTS (
        SELECT 1 FROM ${s.items} WHERE ${s.items.id} = ${s.stockBalances.itemId}
          AND (${s.items.code}::text ILIKE ${p} OR ${s.items.name}::text ILIKE ${p})
      )
      OR EXISTS (
        SELECT 1 FROM ${s.warehouses} WHERE ${s.warehouses.id} = ${s.stockBalances.warehouseId}
          AND ${s.warehouses.name}::text ILIKE ${p}
      )
      OR EXISTS (
        SELECT 1 FROM ${s.items} i2
          JOIN ${s.itemGroups} ON ${s.itemGroups.id} = i2."item_group_id"
          WHERE i2.id = ${s.stockBalances.itemId}
            AND ${s.itemGroups.name}::text ILIKE ${p}
      )
    )`);
  }
  return conds.length > 0 ? and(...conds) : undefined;
}

// GET /stock-balances/ledger?page=&pageSize=&query=&warehouseId=&itemId=&from=&to=
// Join stockBalances × items × warehouses × item_groups dengan pagination
// server-side (dipakai halaman Stock Balance). `from` & `to` filter balanceDate (YYYY-MM-DD, inclusive).
// Behavior sesuai request user:
// - Tanpa filter tanggal: tampilkan 1 row per (warehouse, item) = saldo terkini (MAX balance_date) -> item uniq per WH
// - Dengan filter tanggal from/to: agregat per (warehouse, item) -> opening dari tgl paling awal di range, closing dari tgl paling akhir, in/out di-sum
//   Contoh: tgl1 opening10 in20 out5 closing25, tgl2 opening25 in5 out20 closing10 => filter 1-2 => opening10 in25 out25 closing10 (1 row per WH+item)
crudRouter.get("/stock-balances/ledger", async (req, res) => {
  if (!(await checkTablePermission(req, res, "stockBalances", "view"))) return;
  try {
    const page = queryNum(req, "page") ?? 1;
    const pageSize = queryNum(req, "pageSize") ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const from = queryStr(req, "from") ?? queryStr(req, "dateFrom") ?? queryStr(req, "startDate");
    const to = queryStr(req, "to") ?? queryStr(req, "dateTo") ?? queryStr(req, "endDate");
    const hasDateFilter = !!(from && /^\d{4}-\d{2}-\d{2}$/.test(from) || to && /^\d{4}-\d{2}-\d{2}$/.test(to));
    console.log(`[stock-ledger] hasDateFilter=${hasDateFilter} from=${from} to=${to} query=${JSON.stringify(req.query)}`);

    // Jika ada filter tanggal, kita agregat per (warehouse, item)
    if (hasDateFilter) {
      const whereCond = await stockBalanceConds(req);
      // Subquery agregat per wh+item
      const aggSub = db
        .select({
          warehouseId: schema.stockBalances.warehouseId,
          itemId: schema.stockBalances.itemId,
          minDate: sql<string>`MIN(${schema.stockBalances.balanceDate})`.as("minDate"),
          maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate"),
          sumIn: sql<number>`SUM(${schema.stockBalances.inQty})`.as("sumIn"),
          sumOut: sql<number>`SUM(${schema.stockBalances.outQty})`.as("sumOut"),
        })
        .from(schema.stockBalances)
        .where(whereCond ?? undefined)
        .groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId)
        .as("agg");

      // Count total distinct wh+item in range
      const countQ = await db.select({ count: sql<number>`count(*)` }).from(aggSub);
      const total = Number(countQ[0]?.count ?? 0);

      const rows = await db
        .select({
          warehouseId: aggSub.warehouseId,
          itemId: aggSub.itemId,
          code: schema.items.code,
          name: schema.items.name,
          itemGroup: schema.itemGroups.name,
          warehouse: schema.warehouses.name,
          balanceDate: aggSub.maxDate,
          openingQty: sql<number>`(SELECT ${schema.stockBalances.openingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${aggSub.warehouseId} AND ${schema.stockBalances.itemId} = ${aggSub.itemId} AND ${schema.stockBalances.balanceDate} = ${aggSub.minDate} LIMIT 1)`.as("openingQty"),
          inQty: aggSub.sumIn,
          outQty: aggSub.sumOut,
          closingQty: sql<number>`(SELECT ${schema.stockBalances.closingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${aggSub.warehouseId} AND ${schema.stockBalances.itemId} = ${aggSub.itemId} AND ${schema.stockBalances.balanceDate} = ${aggSub.maxDate} LIMIT 1)`.as("closingQty"),
          id: sql<string>`${aggSub.warehouseId} || '|' || ${aggSub.itemId}`.as("id"),
        })
        .from(aggSub)
        .leftJoin(schema.items, eq(schema.items.id, aggSub.itemId))
        .leftJoin(schema.warehouses, eq(schema.warehouses.id, aggSub.warehouseId))
        .leftJoin(schema.itemGroups, eq(schema.itemGroups.id, schema.items.itemGroupId))
        .orderBy(sql`${schema.items.code} ASC NULLS LAST`, sql`${schema.warehouses.name} ASC NULLS LAST`)
        .offset(offset)
        .limit(pageSize);

      res.json({
        rows: rows.map((r) => ({
          id: String((r as any).id),
          warehouseId: (r as any).warehouseId,
          itemId: (r as any).itemId,
          code: (r as any).code,
          name: (r as any).name,
          itemGroup: (r as any).itemGroup,
          warehouse: (r as any).warehouse,
          balanceDate: (r as any).balanceDate,
          openingQty: Number((r as any).openingQty ?? 0),
          inQty: Number((r as any).inQty ?? 0),
          outQty: Number((r as any).outQty ?? 0),
          closingQty: Number((r as any).closingQty ?? 0),
        })),
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
      return;
    }

    // Tanpa filter tanggal: hanya saldo terkini per (warehouse, item) -> 1 row per WH+item
    const baseWhere = await stockBalanceConds(req);
    // Filter whereCond tanpa balance_date sudah di baseWhere, tapi kita perlu tambahan latest filter
    // Buat subquery latest
    const latestSub = db
      .select({
        warehouseId: schema.stockBalances.warehouseId,
        itemId: schema.stockBalances.itemId,
        maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate"),
      })
      .from(schema.stockBalances)
      .where(baseWhere ?? undefined)
      .groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId)
      .as("latest");

    const countQ = await db
      .select({ count: sql<number>`count(*)` })
      .from(latestSub);
    const total = Number(countQ[0]?.count ?? 0);

    const rows = await db
      .select({
        id: schema.stockBalances.id,
        warehouseId: schema.stockBalances.warehouseId,
        itemId: schema.stockBalances.itemId,
        code: schema.items.code,
        name: schema.items.name,
        itemGroup: schema.itemGroups.name,
        warehouse: schema.warehouses.name,
        balanceDate: schema.stockBalances.balanceDate,
        openingQty: schema.stockBalances.openingQty,
        inQty: schema.stockBalances.inQty,
        outQty: schema.stockBalances.outQty,
        closingQty: schema.stockBalances.closingQty,
      })
      .from(schema.stockBalances)
      .innerJoin(
        latestSub,
        and(
          eq(schema.stockBalances.warehouseId, latestSub.warehouseId),
          eq(schema.stockBalances.itemId, latestSub.itemId),
          eq(schema.stockBalances.balanceDate, latestSub.maxDate)
        )
      )
      .leftJoin(schema.items, eq(schema.items.id, schema.stockBalances.itemId))
      .leftJoin(schema.warehouses, eq(schema.warehouses.id, schema.stockBalances.warehouseId))
      .leftJoin(schema.itemGroups, eq(schema.itemGroups.id, schema.items.itemGroupId))
      .where(baseWhere ?? undefined)
      .orderBy(sql`${schema.items.code} ASC NULLS LAST`, sql`${schema.warehouses.name} ASC NULLS LAST`)
      .offset(offset)
      .limit(pageSize);

    res.json({
      rows,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /stock-balances/summary?query=&warehouseId=&itemId=&from=&to=
// Ringkasan untuk summary card halaman Stock Balance: total item, total qty
// (closing stock), dan jumlah baris — mengikuti filter & scope yang sama (termasuk from/to tanggal).
// Konsisten dengan ledger: tanpa filter tanggal -> hitung dari saldo terkini per WH+item (1 per WH+item)
// Dengan filter tanggal -> agregat per WH+item (closing dari tgl akhir di range, in/out sum, opening dari awal)
crudRouter.get("/stock-balances/summary", async (req, res) => {
  if (!(await checkTablePermission(req, res, "stockBalances", "view"))) return;
  try {
    const from = queryStr(req, "from") ?? queryStr(req, "dateFrom") ?? queryStr(req, "startDate");
    const to = queryStr(req, "to") ?? queryStr(req, "dateTo") ?? queryStr(req, "endDate");
    const hasDateFilter = !!(from && /^\d{4}-\d{2}-\d{2}$/.test(from) || to && /^\d{4}-\d{2}-\d{2}$/.test(to));
    const whereCond = await stockBalanceConds(req);

    if (hasDateFilter) {
      const aggSub = db
        .select({
          warehouseId: schema.stockBalances.warehouseId,
          itemId: schema.stockBalances.itemId,
          maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate"),
        })
        .from(schema.stockBalances)
        .where(whereCond ?? undefined)
        .groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId)
        .as("agg");
      const [row] = await db
        .select({
          totalItems: sql<number>`count(distinct ${aggSub.itemId})`,
          totalQty: sql<number>`coalesce(sum((SELECT ${schema.stockBalances.closingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${aggSub.warehouseId} AND ${schema.stockBalances.itemId} = ${aggSub.itemId} AND ${schema.stockBalances.balanceDate} = ${aggSub.maxDate} LIMIT 1)),0)`,
          totalRows: sql<number>`count(*)`,
        })
        .from(aggSub);
      res.json({
        totalItems: Number(row.totalItems ?? 0),
        totalQty: Number(row.totalQty ?? 0),
        totalRows: Number(row.totalRows ?? 0),
      });
      return;
    }

    // Tanpa filter tanggal: hanya saldo terkini per WH+item
    const latestSub = db
      .select({
        warehouseId: schema.stockBalances.warehouseId,
        itemId: schema.stockBalances.itemId,
        maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate"),
      })
      .from(schema.stockBalances)
      .where(whereCond ?? undefined)
      .groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId)
      .as("latest");
    const [row] = await db
      .select({
        totalItems: sql<number>`count(distinct ${latestSub.itemId})`,
        totalQty: sql<number>`coalesce(sum((SELECT ${schema.stockBalances.closingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${latestSub.warehouseId} AND ${schema.stockBalances.itemId} = ${latestSub.itemId} AND ${schema.stockBalances.balanceDate} = ${latestSub.maxDate} LIMIT 1)),0)`,
        totalRows: sql<number>`count(*)`,
      })
      .from(latestSub);
    res.json({
      totalItems: Number(row.totalItems ?? 0),
      totalQty: Number(row.totalQty ?? 0),
      totalRows: Number(row.totalRows ?? 0),
    });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /:table/:id — single row
// ---- Special endpoints (registered before generic /:table routes) ----

// GET /item-groups/counts — jumlah item per item group (untuk kolom
// "Item Count" di daftar Item Groups, tanpa harus memuat semua items).
crudRouter.get("/item-groups/counts", async (req, res) => {
  if (!(await checkTablePermission(req, res, "itemGroups", "view"))) return;
  try {
    const rows = await db
      .select({
        itemGroupId: schema.items.itemGroupId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.items)
      .where(sql`${schema.items.itemGroupId} is not null`)
      .groupBy(schema.items.itemGroupId);

    res.json({
      counts: Object.fromEntries(rows.map((r) => [r.itemGroupId, Number(r.count)])),
    });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /items/lookup?barcode=&formatId?
crudRouter.get("/items/lookup", async (req, res) => {  if (!req.user) {
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

    const itemGroupsAll = await db.select().from(schema.itemGroups);
    const itemsAll = await db.select().from(schema.items);

    for (const fmt of formats) {
      const segments = (fmt.segments ?? []) as { id: string; field: string; start: number; end: number; label?: string; batchFormatId?: string }[];
      if (barcode.length < segments.reduce((m, s) => Math.max(m, s.end), 0)) continue;

      const values: Record<string, string> = {};
      let itemCode: string | null = null;
      let itemGroupCode: string | null = null;

      for (const seg of segments) {
        const val = barcode.slice(seg.start - 1, seg.end);
        values[seg.field] = val;
        if (seg.field === "ITEM_CODE") itemCode = val;
        if (seg.field === "ITEM_GROUP") itemGroupCode = val;
      }

      // Segmen BATCH wajib menunjuk format batch — tanpa ikatan format tidak valid.
      const batchSeg = segments.find((s) => s.field === "BATCH");
      let batch: ReturnType<typeof parseBatchNumber> | null = null;
      if (batchSeg) {
        if (!batchSeg.batchFormatId) continue;
        const bf = (await activeBatchFormats()).find(
          (f) => f.id === batchSeg.batchFormatId
        );
        if (bf) batch = parseBatchNumber(values.BATCH, [bf]);
      }

      if (itemCode) {
        const item = itemsAll.find((it) => it.code.toLowerCase() === itemCode!.toLowerCase());
        if (item) {
          const ig = itemGroupsAll.find((c) => itemGroupCode ? c.code.toLowerCase() === itemGroupCode.toLowerCase() : c.id === item.itemGroupId) ?? null;
          res.json({ found: true, item, itemGroup: ig ? { id: ig.id, code: ig.code, name: ig.name } : null, matched: true, formatId: fmt.id, formatName: fmt.name, values, batchNumber: values.BATCH ?? undefined, batch });
          return;
        }
      }
      // Fallback terakhir: item terkode lewat alternative code di batch.
      if (batch?.alternativeCode) {
        const alt = batch.alternativeCode.trim().toLowerCase();
        const item = itemsAll.find(
          (it) =>
            it.alternativeCode &&
            it.alternativeCode.trim().toLowerCase() === alt
        );
        if (item) {
          const ig = itemGroupsAll.find((c) => c.id === item.itemGroupId) ?? null;
          res.json({ found: true, item, itemGroup: ig ? { id: ig.id, code: ig.code, name: ig.name } : null, matched: true, formatId: fmt.id, formatName: fmt.name, values, batchNumber: values.BATCH ?? undefined, batch });
          return;
        }
      }
    }
    res.json({ found: false, detail: "no match" });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /opname-scan-details/check?opnameId=&barcode=&excludeScanId=
// Cek duplikat barcode unik dalam satu project opname (termasuk scan yang
// sudah di-post dari sesi lain).
crudRouter.get("/opname-scan-details/check", async (req, res) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;
  try {
    const opnameId = queryStr(req, "opnameId");
    const barcode = queryStr(req, "barcode");
    const excludeScanId = queryStr(req, "excludeScanId");
    if (!opnameId || !barcode) { res.json({ exists: false }); return; }

    const conds: ReturnType<typeof sql>[] = [
      eq(schema.opnameScanDetails.opnameId, opnameId),
      eq(schema.opnameScanDetails.barcode, barcode),
    ];
    if (excludeScanId) {
      conds.push(sql`${schema.opnameScanDetails.scanId} != ${excludeScanId}`);
    }

    const [detail] = await db
      .select({
        scanId: schema.opnameScanDetails.scanId,
        locationId: schema.opnameScanDetails.locationId,
        scannedAt: schema.opnameScanDetails.scannedAt,
        scannedBy: schema.opnameScans.scannedBy,
      })
      .from(schema.opnameScanDetails)
      .leftJoin(schema.opnameScans, eq(schema.opnameScanDetails.scanId, schema.opnameScans.id))
      .where(and(...conds))
      .orderBy(sql`${schema.opnameScanDetails.scannedAt} DESC`)
      .limit(1);

    if (!detail) { res.json({ exists: false }); return; }

    const [user] = detail.scannedBy
      ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, detail.scannedBy)).limit(1)
      : [null];
    const [loc] = detail.locationId
      ? await db.select({ code: schema.locations.code }).from(schema.locations).where(eq(schema.locations.id, detail.locationId)).limit(1)
      : [null];

    res.json({
      exists: true,
      record: {
        scanId: detail.scanId,
        scannedBy: user?.name ?? "—",
        locationCode: loc?.code ?? "—",
        scannedAt: detail.scannedAt,
      },
    });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /batch-formats/parse?number= — hint live saat input batch number
// (form stock movement, master batch). Bisa dibaca oleh siapa pun yang
// boleh membuka master, inventory, atau opname.
crudRouter.get("/batch-formats/parse", async (req, res) => {
  if (!(await checkAnyPermission(req, res, ["master", "inventory", "opname"], "view"))) return;
  try {
    const number = queryStr(req, "number");
    if (!number) { res.json({ parsed: null }); return; }
    res.json({ parsed: parseBatchNumber(number, await activeBatchFormats()) });
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});

// GET /projects/:id/sessions & /projects/:id/stats dipindah ke
// /api/opname-projects/:id/scans & /api/opname-projects/:id/stats
// (lihat routes/opname-projects.ts).

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

// Cari atau buat batch (item, batch_number) dari scan record — metadata
// (tanggal produksi/shift/custom) diisi otomatis dari parse batch format.
// Bila batch number meng-encode kode alternatif item yang tidak cocok,
// lempar error (kode BATCH_MISMATCH → 409 di caller).
async function resolveBatchFromScan(
  itemId: string,
  batchNumber: string
): Promise<string | null> {
  const [item] = await db
    .select({ alternativeCode: schema.items.alternativeCode })
    .from(schema.items)
    .where(eq(schema.items.id, itemId))
    .limit(1);
  const parsed = parseBatchNumber(batchNumber, await activeBatchFormats());
  const alt = parsed?.alternativeCode;
  if (alt && item?.alternativeCode) {
    if (alt.trim().toLowerCase() !== item.alternativeCode.trim().toLowerCase()) {
      const err = new Error(
        `Batch "${batchNumber}" meng-encode kode alternatif "${alt}" tetapi item ini punya kode alternatif "${item.alternativeCode}" — batch tidak cocok dengan item.`
      ) as Error & { code?: string };
      err.code = "BATCH_MISMATCH";
      throw err;
    }
  }

  const [existing] = await db
    .select({ id: schema.batches.id })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.itemId, itemId),
        eq(schema.batches.batchNumber, batchNumber)
      )
    )
    .limit(1);
  if (existing) return existing.id;

  const id = await nextRowId(db, schema.batches, "bat");
  const values: typeof schema.batches.$inferInsert = {
    id,
    itemId,
    batchNumber,
    status: "ACTIVE",
  };
  if (parsed) {
    if (parsed.productionDate) values.productionDate = parsed.productionDate;
    if (parsed.shift) values.shift = parsed.shift;
    if (Object.keys(parsed.meta).length > 0) values.meta = parsed.meta;
  }
  try {
    await db.insert(schema.batches).values(values).onConflictDoNothing();
  } catch {
    // race — batch dibuat request lain; cari lagi di bawah
  }
  const [row] = await db
    .select({ id: schema.batches.id })
    .from(schema.batches)
    .where(
      and(
        eq(schema.batches.itemId, itemId),
        eq(schema.batches.batchNumber, batchNumber)
      )
    )
    .limit(1);
  return row?.id ?? null;
}

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
    if (tableName === "movementTypes") {
      if (!values.code || !String(values.code).trim()) {
        values.code = await autoMovementTypeCode(
          String(values.series ?? ""),
          String(values.kind ?? "OTHER")
        );
      } else {
        values.code = String(values.code).trim();
      }
    }
    if (tableName === "opnameScanDetails") {
      const parsed = (values.parsed ?? {}) as Record<string, unknown>;
      const batchNumber =
        typeof parsed.BATCH === "string" && parsed.BATCH.trim()
          ? parsed.BATCH.trim()
          : null;
      if (typeof values.batch === "string" && values.batch.trim()) {
        // Kolom batch (nomor batch) bisa datang dari parsed.BATCH — isi bila kosong.
        if (!values.batch) values.batch = batchNumber;
      }
      if (batchNumber && typeof values.itemId === "string") {
        const batchId = await resolveBatchFromScan(values.itemId, batchNumber);
        if (batchId) values.batchId = batchId;
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
      if (!values.id && isUniqueViolation(e) && ID_PREFIXES[tableName]) {
        insertValues = await ensureRowId(tableName, values);
        rows = await db.insert(table).values(insertValues).returning();
      } else {
        throw e;
      }
    }
    const row = rows[0] ?? insertValues;
    // Flip status project & warehouse saat scan mulai berjalan.
    if (tableName === "opnameScans") {
      const opnameId = String(insertValues.opnameId ?? "");
      if (opnameId) {
        await db
          .update(schema.opnameProjects)
          .set({ status: "IN_PROGRESS", updatedAt: new Date() })
          .where(eq(schema.opnameProjects.id, opnameId));
      }
    }
    if (tableName === "opnameScanDetails") {
      const opnameId = String(insertValues.opnameId ?? "");
      const warehouseId = String(insertValues.warehouseId ?? "");
      if (opnameId && warehouseId) {
        await db
          .update(schema.opnameWarehouses)
          .set({
            status: "IN_PROGRESS",
            startedAt: sql`coalesce(${schema.opnameWarehouses.startedAt}, now())`,
          })
          .where(
            and(
              eq(schema.opnameWarehouses.opnameId, opnameId),
              eq(schema.opnameWarehouses.warehouseId, warehouseId),
              eq(schema.opnameWarehouses.status, "PENDING")
            )
          );
        // Otomatis COMPLETED bila semua lokasi gudang sudah tercount.
        const [locTotal] = await db
          .select({ total: sql<number>`count(*)` })
          .from(schema.locations)
          .where(eq(schema.locations.warehouseId, warehouseId));
        const [countedRow] = await db
          .select({ counted: sql<number>`count(distinct ${schema.opnameScanDetails.locationId})` })
          .from(schema.opnameScanDetails)
          .where(
            and(
              eq(schema.opnameScanDetails.opnameId, opnameId),
              eq(schema.opnameScanDetails.warehouseId, warehouseId),
              sql`${schema.opnameScanDetails.locationId} IS NOT NULL`
            )
          );
        if (Number(locTotal.total) > 0 && Number(countedRow.counted) >= Number(locTotal.total)) {
          await db
            .update(schema.opnameWarehouses)
            .set({ status: "COMPLETED", completedAt: new Date() })
            .where(
              and(
                eq(schema.opnameWarehouses.opnameId, opnameId),
                eq(schema.opnameWarehouses.warehouseId, warehouseId)
              )
            );
        }
      }
    }
    res.status(201).json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) {
    if (
      typeof e === "object" &&
      e !== null &&
      (e as { code?: string }).code === "BATCH_MISMATCH"
    ) {
      res.status(409).json({ error: (e as Error).message });
      return;
    }
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
    const rowId = paramString(req, "id");
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
      .where(eq(idColumn(table), rowId))
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
    if (tableName === "movementTypes") {
      const rowId = paramString(req, "id");
      const [mt] = await db
        .select({ builtin: schema.movementTypes.builtin })
        .from(schema.movementTypes)
        .where(eq(schema.movementTypes.id, rowId))
        .limit(1);
      if (mt?.builtin) {
        res.status(409).json({ error: "Tipe transaksi bawaan (Receipt/Issue/Transfer) tidak dapat dihapus." });
        return;
      }
    }
    if (tableName === "batchFormats") {
      const rowId = paramString(req, "id");
      const refs = await db
        .select({ id: schema.barcodeFormats.id, name: schema.barcodeFormats.name, segments: schema.barcodeFormats.segments })
        .from(schema.barcodeFormats);
      const usedBy = refs.find((f) =>
        ((f.segments ?? []) as { batchFormatId?: string }[]).some(
          (s) => s.batchFormatId === rowId
        )
      );
      if (usedBy) {
        res.status(409).json({
          error: `Format batch ini masih dipakai oleh format barcode "${usedBy.name}" — ubah atau hapus segmen BATCH-nya terlebih dahulu.`,
        });
        return;
      }
    }
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
    if (isForeignKeyViolation(e)) {
      res
        .status(409)
        .json({
          error:
            DELETE_BLOCK_MESSAGES[tableName] ??
            "Data masih dipakai oleh data lain — tidak dapat dihapus.",
        });
      return;
    }
    res.status(500).json({ error: messageOf(e) });
  }
});
