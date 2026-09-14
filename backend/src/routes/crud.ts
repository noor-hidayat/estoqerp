import { Router, type Request, type Response } from "express";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { parseBatchNumber, type BatchFormatLike } from "../lib/batch-parse";
import { canAccessEntity, canViewOpnameContext, checkAnyPermission, checkPermission, getRoleInternalId, hasPermission, isAdminUser } from "../middleware/rbac";
import { logActivity, getActorInfo } from "../lib/activity-log";
import { computeDiff, DIFF_DENYLIST } from "../lib/diff";

// small helper to check uuid
function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// FK resolver map for generic crud
const FK_MAP: Record<string, AnyPgTable> = {
  roleId: schema.roles,
  userId: schema.users,
  branchId: schema.branches,
  warehouseId: schema.warehouses,
  parentId: schema.warehouses,
  locationId: schema.locations,
  itemGroupId: schema.itemGroups,
  itemId: schema.items,
  uomId: schema.uom,
  batchId: schema.batches,
  typeId: schema.movementTypes,
  movementId: schema.stockMovements,
  fromWarehouseId: schema.warehouses,
  toWarehouseId: schema.warehouses,
  supplierId: schema.suppliers,
  customerId: schema.customers,
  purchaseOrderId: schema.purchaseOrders,
  salesOrderId: schema.salesOrders,
  goodsReceiptId: schema.goodsReceipts,
  deliveryId: schema.deliveries,
  opnameId: schema.opnameProjects,
  projectId: schema.opnameProjects,
  countId: schema.opnameCounts,
  scanId: schema.opnameScans,
  dashboardId: schema.dashboards,
  workspaceId: schema.workspaces,
  ownerId: schema.users,
  createdBy: schema.users,
  scannedBy: schema.users,
  taxCategoryId: (schema as any).taxCategories,
  priceListId: (schema as any).priceLists,
};

async function resolveValueToInternalId(field: string, value: unknown): Promise<unknown> {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return value;
  const str = String(value).trim();
  if (!isUuid(str)) {
    // if numeric string, keep as number for bigint column? Drizzle can handle string numeric, but we convert to number
    if (/^\d+$/.test(str) && field.endsWith("Id")) return Number(str);
    return value;
  }
  const table = FK_MAP[field];
  if (!table) return value;
  // lookup publicId -> internal id
  const colPublic = (table as any).publicId as AnyPgColumn;
  const colId = (table as any).id as AnyPgColumn;
  if (!colPublic || !colId) return value;
  try {
    const [row] = await db.select({ id: colId }).from(table).where(eq(colPublic, str)).limit(1);
    if (row) return (row as any).id;
  } catch {}
  return value;
}

async function resolveIncomingIds(values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...values };
  // handle branchAccesses entityId special
  if (out.entityId && out.entityType) {
    const eType = String(out.entityType);
    const eIdStr = String(out.entityId);
    if (isUuid(eIdStr)) {
      if (eType === "BRANCH") {
        const [b] = await db.select({ id: schema.branches.id }).from(schema.branches).where(eq(schema.branches.publicId, eIdStr)).limit(1);
        if (b) out.entityId = b.id;
      } else if (eType === "WAREHOUSE") {
        const [w] = await db.select({ id: schema.warehouses.id }).from(schema.warehouses).where(eq(schema.warehouses.publicId, eIdStr)).limit(1);
        if (w) out.entityId = w.id;
      }
    } else if (/^\d+$/.test(eIdStr)) {
      out.entityId = Number(eIdStr);
    }
  }
  for (const [k, v] of Object.entries(out)) {
    if (k === "entityId") continue; // handled
    if (k.endsWith("Id") || k === "branchId" || k === "warehouseId" || k === "locationId" || k === "itemGroupId") {
      if (typeof v === "string" && isUuid(v)) {
        const resolved = await resolveValueToInternalId(k, v);
        out[k] = resolved;
      } else if (typeof v === "string" && /^\d+$/.test(v) && FK_MAP[k]) {
        const maybeNum = Number(v);
        if (!Number.isNaN(maybeNum)) out[k] = maybeNum;
      }
    }
  }
  // role legacy handling: users.roleId vs role string
  if ("role" in out && typeof out.role === "string" && isUuid(String(out.role))) {
    const rPub = String(out.role);
    const [r] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.publicId, rPub)).limit(1);
    if (r) {
      out.roleId = r.id;
      delete out.role;
    }
  }
  if ("roleId" in out && typeof out.roleId === "string" && isUuid(String(out.roleId))) {
    const rPub = String(out.roleId);
    const [r] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.publicId, rPub)).limit(1);
    if (r) out.roleId = r.id;
  }
  return out;
}

// Tabel relasi yang disinkronisasi frontend dengan pola "hapus dulu, insert ulang"
const INSERT_OR_IGNORE = new Set([
  "rolePermissions",
  "branchAccesses",
  "workspaceAccesses",
  "userSettings",
]);

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}
function isForeignKeyViolation(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code ?? ((e as { cause?: { code?: string } } | null)?.cause?.code);
  return code === "23503";
}
const DELETE_BLOCK_MESSAGES: Record<string, string> = {
  itemGroups: "Grup item ini masih dipakai oleh item — pindahkan item ke grup lain atau hapus item-nya terlebih dahulu.",
  items: "Item ini masih tercatat dalam hasil stock opname (scan detail) — data opname yang sudah masuk perhitungan tidak bisa dihapus.",
  branches: "Branch ini masih dipakai oleh gudang atau project opname — pindahkan atau hapus data terkait terlebih dahulu.",
  warehouses: "Gudang ini masih dipakai oleh lokasi, sub-gudang, project opname, atau stock balance — pindahkan atau hapus data terkait terlebih dahulu.",
  locations: "Lokasi ini masih dipakai oleh scan opname atau stock — hapus data terkait terlebih dahulu.",
  roles: "Role ini masih dipakai oleh user — pindahkan user ke role lain terlebih dahulu.",
  users: "User ini masih terkait dengan data lain di sistem — tidak dapat dihapus.",
  movementTypes: "Tipe transaksi masih dipakai oleh transaksi stok — pindahkan atau hapus transaksi terkait terlebih dahulu.",
  uom: "Satuan ini masih dipakai oleh item atau transaksi — pindahkan atau hapus data terkait terlebih dahulu.",
  departments: "Departemen ini masih dipakai oleh data lain — hapus relasi terlebih dahulu.",
  batches: "Batch ini masih tercatat dalam transaksi atau scan opname — hapus data terkait terlebih dahulu.",
  taxCategories: "Kategori pajak ini masih dipakai oleh Purchase Order — hapus relasi PO terlebih dahulu.",
  priceLists: "Price list ini masih dipakai oleh baris harga — hapus baris terlebih dahulu.",
  priceListLines: "Baris price list tidak dapat dihapus.",
};

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
  departments: (schema as any).departments,
  taxCategories: (schema as any).taxCategories,
  priceLists: (schema as any).priceLists,
  priceListLines: (schema as any).priceListLines,
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

// DocumentType mapping for generic CRUD activity log (master setup)
const CRUD_DOC_TYPE: Record<string, string> = {
  users: "USER",
  roles: "ROLE",
  rolePermissions: "ROLE_PERMISSION",
  branchAccesses: "BRANCH_ACCESS",
  workspaceAccesses: "WORKSPACE_ACCESS",
  workspaces: "WORKSPACE",
  branches: "BRANCH",
  warehouses: "WAREHOUSE",
  locations: "LOCATION",
  itemGroups: "ITEM_GROUP",
  items: "ITEM",
  stockBalances: "STOCK_BALANCE",
  barcodeFormats: "BARCODE_FORMAT",
  batchFormats: "BATCH_FORMAT",
  userSettings: "USER_SETTING",
  uom: "UOM",
  departments: "DEPARTMENT",
  taxCategories: "TAX_CATEGORY",
  priceLists: "PRICE_LIST",
  priceListLines: "PRICE_LIST_LINE",
  movementTypes: "MOVEMENT_TYPE",
  stockMovements: "SMV",
  stockMovementDetails: "SMV_LINE",
  stockLedger: "STOCK_LEDGER",
  batches: "BATCH",
  stockBatches: "STOCK_BATCH",
  stockBarcodes: "STOCK_BARCODE",
  opnameWarehouses: "OPW",
  opnameScans: "OP_SCAN",
  opnameScanDetails: "OP_SCAN_DETAIL",
  suppliers: "SUPPLIER",
  customers: "CUSTOMER",
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
function publicIdColumn(table: AnyPgTable): AnyPgColumn | null {
  return (table as unknown as { publicId?: AnyPgColumn }).publicId ?? null;
}
async function activeBatchFormats(): Promise<BatchFormatLike[]> {
  return (await db.select().from(schema.batchFormats).where(eq(schema.batchFormats.isActive, true))) as unknown as BatchFormatLike[];
}
function sanitizeRow(table: AnyPgTable, row: Record<string, unknown>) {
  if (table === schema.users) {
    const { passwordHash: _passwordHash, ...rest } = row;
    // expose publicId as id for API compat, keep internal id as _internalId
    const r: any = rest;
    if (r.publicId) r.id = r.publicId;
    return rest;
  }
  const r: any = { ...row };
  // Map internal id to publicId for external API: frontend expects id = publicId (uuid)
  // Keep documentNo as display, but id remains publicId
  if (r.publicId) {
    r._internalId = r.id;
    r.id = r.publicId;
  }
  // For document tables, expose documentNo as primary display
  if (r.documentNo) r.documentNo = r.documentNo;
  return r;
}

// Enrich FK bigint ids → publicId for access tables (frontend uses publicId).
async function enrichAccessRows(tableName: string, rows: any[]): Promise<any[]> {
  if (!rows.length) return rows;
  if (tableName === "workspaceAccesses") {
    const wsIds = [...new Set(rows.map((r: any) => r.workspaceId).filter((v: any) => v != null))];
    const roleIds = [...new Set(rows.map((r: any) => r.roleId).filter((v: any) => v != null))];
    const wsMap = new Map<number, string>();
    const roleMap = new Map<number, string>();
    if (wsIds.length) {
      const wsRows = await db.select({ id: schema.workspaces.id, publicId: schema.workspaces.publicId }).from(schema.workspaces).where(inArray(schema.workspaces.id, wsIds as any));
      for (const w of wsRows) wsMap.set(w.id as unknown as number, w.publicId);
    }
    if (roleIds.length) {
      const roleRows = await db.select({ id: schema.roles.id, publicId: schema.roles.publicId }).from(schema.roles).where(inArray(schema.roles.id, roleIds as any));
      for (const r of roleRows) roleMap.set(r.id as unknown as number, r.publicId);
    }
    rows.forEach((r: any) => {
      if (r.workspaceId != null && wsMap.has(r.workspaceId)) r.workspaceId = wsMap.get(r.workspaceId);
      if (r.roleId != null && roleMap.has(r.roleId)) r.roleId = roleMap.get(r.roleId);
    });
  } else if (tableName === "branchAccesses") {
    const roleIds = [...new Set(rows.map((r: any) => r.roleId).filter((v: any) => v != null))];
    const branchIds = [...new Set(rows.filter((r: any) => r.entityType === "BRANCH").map((r: any) => r.entityId).filter((v: any) => v != null))];
    const whIds = [...new Set(rows.filter((r: any) => r.entityType === "WAREHOUSE").map((r: any) => r.entityId).filter((v: any) => v != null))];
    const roleMap = new Map<number, string>();
    if (roleIds.length) {
      const roleRows = await db.select({ id: schema.roles.id, publicId: schema.roles.publicId }).from(schema.roles).where(inArray(schema.roles.id, roleIds as any));
      for (const r of roleRows) roleMap.set(r.id as unknown as number, r.publicId);
    }
    const branchMap = new Map<number, string>();
    if (branchIds.length) {
      const bRows = await db.select({ id: schema.branches.id, publicId: schema.branches.publicId }).from(schema.branches).where(inArray(schema.branches.id, branchIds as any));
      for (const b of bRows) branchMap.set(b.id as unknown as number, b.publicId);
    }
    const whMap = new Map<number, string>();
    if (whIds.length) {
      const wRows = await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId }).from(schema.warehouses).where(inArray(schema.warehouses.id, whIds as any));
      for (const w of wRows) whMap.set(w.id as unknown as number, w.publicId);
    }
    rows.forEach((r: any) => {
      if (r.roleId != null && roleMap.has(r.roleId)) r.roleId = roleMap.get(r.roleId);
      if (r.entityType === "BRANCH" && r.entityId != null && branchMap.has(r.entityId)) r.entityId = branchMap.get(r.entityId);
      if (r.entityType === "WAREHOUSE" && r.entityId != null && whMap.has(r.entityId)) r.entityId = whMap.get(r.entityId);
    });
  } else if (tableName === "rolePermissions") {
    const roleIds = [...new Set(rows.map((r: any) => r.roleId).filter((v: any) => v != null))];
    if (roleIds.length) {
      const roleRows = await db.select({ id: schema.roles.id, publicId: schema.roles.publicId }).from(schema.roles).where(inArray(schema.roles.id, roleIds as any));
      const map = new Map(roleRows.map((r) => [r.id as unknown as number, r.publicId]));
      rows.forEach((r: any) => { if (r.roleId != null && map.has(r.roleId)) r.roleId = map.get(r.roleId); });
    }
  }
  return rows;
}
async function enforceSettingsOwner(req: Request, res: Response): Promise<boolean> {
  if (!req.user) return false;
  if (await isAdminUser(req.user.role)) return true;
  const tableName = paramString(req, "table");
  if (tableName !== "userSettings") return true;
  const id = paramString(req, "id");
  if (!id) return true;
  // need to lookup by publicId
  let internalId: number | null = null;
  if (isUuid(id)) {
    const [row] = await db.select({ userId: schema.userSettings.userId, publicId: schema.userSettings.publicId }).from(schema.userSettings).where(eq(schema.userSettings.publicId, id)).limit(1);
    if (!row || String(row.userId) !== String(req.user.internalId ?? req.user.id)) {
      // fallback to publicId lookup
      const userInternal = req.user.internalId ?? (isUuid(req.user.id) ? (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.publicId, req.user.id)).limit(1).then(r=>r[0]?.id) ) : Number(req.user.id));
      if (!row || row.userId !== userInternal) {
        res.status(403).json({ error: "Tidak dapat mengakses setting user lain." });
        return false;
      }
    }
  } else {
    const [row] = await db.select({ userId: schema.userSettings.userId }).from(schema.userSettings).where(eq(schema.userSettings.id, Number(id) as any)).limit(1);
    if (!row) {
      res.status(403).json({ error: "Tidak dapat mengakses setting user lain." });
      return false;
    }
    const userInternal = req.user.internalId ?? Number(req.user.id);
    if (row.userId !== userInternal) {
      res.status(403).json({ error: "Tidak dapat mengakses setting user lain." });
      return false;
    }
  }
  return true;
}
function coerceDates(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string" && (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value))) {
      out[key] = new Date(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
const SERIES_DATE_TOKENS = /YYYY|YY|DD|MM|HH/gi;
async function autoMovementTypeCode(seriesRaw: string, kind: string, excludeId?: string): Promise<string> {
  const series = String(seriesRaw ?? "").trim();
  const base = (series.replace(SERIES_DATE_TOKENS, "").trim() || kind).toUpperCase();
  const slug = base.replace(/[^A-Z0-9_-]/g, "").replace(/^[-_]+|[-_]+$/g, "").slice(0, 12) || "TYPE";
  const existing = await db.select({ code: schema.movementTypes.code, id: schema.movementTypes.id }).from(schema.movementTypes);
  const used = new Set(existing.filter((r) => String(r.id) !== String(excludeId)).map((r) => r.code.toUpperCase()));
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
  branches: "inventory.branches",
  warehouses: "inventory.warehouses",
  locations: "inventory.locations",
  stockBalances: "inventory.stockBalance",
  itemGroups: "master.itemGroups",
  items: "master.items",
  barcodeFormats: "master.barcodeFormats",
  batchFormats: "master.batchFormats",
  userSettings: "opname.variance.column",
  uom: "master.uom",
  departments: "master.departments",
  taxCategories: "master.taxCategories",
  priceLists: "master.priceLists",
  priceListLines: "master.priceLists",
  movementTypes: "master.movementTypes",
  stockMovements: "inventory.transactions",
  stockMovementDetails: "inventory.transactions",
  stockLedger: "inventory.stockLedger",
  batches: "inventory.batches",
  stockBatches: "inventory.batches",
  stockBarcodes: "inventory.batches",
  opnameWarehouses: "opname",
  opnameScans: ["opname.detail.scan", "opname.detail.sessions", "opname.detail.sessions.detail"],
  opnameScanDetails: ["opname.detail.scan", "opname.detail.sessions", "opname.detail.sessions.detail"],
  suppliers: "supply.suppliers",
  customers: "supply.customers",
};
const WRITE_MENU_OVERRIDE: Record<string, string> = {
  opnameScans: "opname.detail.scan",
  opnameScanDetails: "opname.detail.scan",
};
function menuListOf(tableName: string): string[] {
  const menu = TABLE_MENU[tableName];
  if (!menu) return [];
  return Array.isArray(menu) ? menu : [menu];
}
const OPNAME_SUPPORT_READ = new Set(["locations","branches","warehouses","items","barcodeFormats","users"]);
// UOM dan ItemGroups diperlukan untuk display ItemsPage, allow view untuk semua authenticated yang bisa view items
const ITEM_AUX_VIEW_OPEN = new Set(["uom", "itemGroups"]);
// Workspaces & roles needed for UI shell (workspace switcher, role labels) — allow view for any authenticated with any app access
const SHELL_OPEN_VIEW = new Set(["workspaces", "roles", "userSettings"]);
async function checkTablePermission(req: Request, res: Response, tableName: string, action: string): Promise<boolean> {
  if (action === "view" && SHELL_OPEN_VIEW.has(tableName) && req.user) {
    if (await isAdminUser(req.user.role)) return true;
    // any authenticated with at least one app permission can view workspaces/roles for UI
    if (await hasPermission(req.user.role, "dashboard", "view")) return true;
    if (await hasPermission(req.user.role, "inventory", "view")) return true;
    if (await hasPermission(req.user.role, "inventory.stockBalance", "view")) return true;
    if (await hasPermission(req.user.role, "supply.purchaseRequests", "view")) return true;
    if (await hasPermission(req.user.role, "supply.materialRequests", "view")) return true;
    if (await hasPermission(req.user.role, "master.items", "view")) return true;
    if (await canViewOpnameContext(req.user.role)) return true;
    // fallback: any authenticated can view workspaces (needed for topbar)
    if (tableName === "workspaces") return true;
    // roles: allow if user has any workspace access (has branch_access)
    if (tableName === "roles") {
      const internalId = await getRoleInternalId(req.user.role);
      if (internalId !== null) {
        const [hasAccess] = await db.select({ id: schema.branchAccesses.id }).from(schema.branchAccesses).where(eq(schema.branchAccesses.roleId, internalId)).limit(1);
        if (hasAccess) return true;
        // also allow if has any permission at all
        const perms = await db.select({ menu: schema.rolePermissions.menu }).from(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, internalId)).limit(1);
        if (perms.length > 0) return true;
      }
    }
  }
  if (action === "view" && ITEM_AUX_VIEW_OPEN.has(tableName) && req.user) {
    if (await isAdminUser(req.user.role)) return true;
    if (await hasPermission(req.user.role, "master.items", "view")) return true;
    if (await hasPermission(req.user.role, "master", "view")) return true;
  }
  if (action === "view" && OPNAME_SUPPORT_READ.has(tableName) && req.user && (await canViewOpnameContext(req.user.role))) {
    return true;
  }
  const writeMenu = WRITE_MENU_OVERRIDE[tableName];
  if (writeMenu && action !== "view") return checkPermission(req, res, writeMenu, action);
  const menus = menuListOf(tableName);
  if (menus.length > 1) return checkAnyPermission(req, res, menus, action);
  return checkPermission(req, res, menus[0], action);
}
const ENTITY_TYPES: Record<string, string> = { branchId: "BRANCH", warehouseId: "WAREHOUSE" };
async function enforceEntity(req: Request, body: Record<string, unknown>): Promise<boolean> {
  if (!req.user) return false;
  if (await isAdminUser(req.user.role)) return true;
  for (const [field, type] of Object.entries(ENTITY_TYPES)) {
    const entityId = body[field] as string | number | undefined;
    if (entityId && !(await canAccessEntity(req.user.role, type as "BRANCH" | "WAREHOUSE", String(entityId)))) return false;
  }
  return true;
}
function messageOf(e: unknown): string { if (e instanceof Error) return e.message; return "Terjadi kesalahan pada server."; }
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
  departments: (schema as any).departments.code,
  taxCategories: (schema as any).taxCategories.code,
  priceLists: (schema as any).priceLists.code,
  priceListLines: (schema as any).priceListLines.id,
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
const SEARCHABLE_COLS: Record<string, AnyPgColumn[]> = {
  itemGroups: [schema.itemGroups.code, schema.itemGroups.name],
  uom: [schema.uom.code, schema.uom.name],
  departments: [(schema as any).departments.code, (schema as any).departments.name],
  taxCategories: [(schema as any).taxCategories.code, (schema as any).taxCategories.name],
  priceLists: [(schema as any).priceLists.code, (schema as any).priceLists.name],
  priceListLines: [(schema as any).priceListLines.id as any],
  movementTypes: [schema.movementTypes.code, schema.movementTypes.name],
  batches: [schema.batches.batchNumber, schema.batches.status],
  batchFormats: [schema.batchFormats.name],
  stockBatches: [schema.stockBatches.batchId as any],
  stockBarcodes: [schema.stockBarcodes.barcode, schema.stockBarcodes.itemId as any],
  stockMovements: [schema.stockMovements.documentNo as any, schema.stockMovements.status, schema.stockMovements.description as any],
  stockLedger: [schema.stockLedger.transactionId as any, schema.stockLedger.transactionType],
  items: [schema.items.code, schema.items.name, schema.items.alternativeCode as any, schema.items.itemGroupId as any],
  suppliers: [schema.suppliers.code, schema.suppliers.name],
  customers: [schema.customers.code, schema.customers.name],
};
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
      OR EXISTS (SELECT 1 FROM ${s.items} WHERE ${s.items.id} = ${s.opnameScanDetails.itemId} AND (${s.items.code}::text ILIKE ${p} OR ${s.items.name}::text ILIKE ${p}))
      OR EXISTS (SELECT 1 FROM ${s.opnameProjects} WHERE ${s.opnameProjects.id} = ${s.opnameScanDetails.opnameId} AND ${s.opnameProjects.name}::text ILIKE ${p})
      OR EXISTS (SELECT 1 FROM ${s.locations} WHERE ${s.locations.id} = ${s.opnameScanDetails.locationId} AND ${s.locations.code}::text ILIKE ${p})
      OR EXISTS (SELECT 1 FROM ${s.opnameScans} WHERE ${s.opnameScans.id} = ${s.opnameScanDetails.scanId} AND EXISTS (SELECT 1 FROM ${s.users} WHERE ${s.users.id} = ${s.opnameScans.scannedBy} AND ${s.users.name}::text ILIKE ${p}))
    )`;
  }
  const cols = SEARCHABLE_COLS[tableName];
  if (!cols || cols.length === 0) return undefined;
  // also search publicId and documentNo if exists
  const publicSearch: ReturnType<typeof sql>[] = [];
  const table: any = (schema as any)[tableName] ?? (schema as any)[CRUD_TABLES[tableName] as any];
  // try publicId/documentNo search generically via raw sql on id? skip
  const ors = cols.map((col) => sql`${col}::text ILIKE ${p}`);
  // add publicId / documentNo search for document tables
  if (["stockMovements","purchaseOrders","salesOrders","goodsReceipts","deliveries","opnameProjects","opnameCounts"].includes(tableName)) {
    // will be handled via generic ilike on those columns if searchable
  }
  return ors.length === 1 ? ors[0] : sql`(${sql.join(ors, sql.raw(" OR "))})`;
}
async function applyEntityScope(req: Request, tableName: string) {
  if (!req.user) return undefined;
  if (await isAdminUser(req.user.role)) return undefined;
  const s = schema;
  const branchIds = (req.accessibleBranchIds ?? []) as (number|string)[];
  const warehouseIds = (req.accessibleWarehouseIds ?? []) as (number|string)[];
  const workspaceIds = (req as unknown as { accessibleWorkspaceIds?: (number|string)[] }).accessibleWorkspaceIds ?? [];
  // convert to numbers for bigint comparison
  const toNums = (arr: (number|string)[]) => arr.map(v => typeof v === "number" ? v : Number(v)).filter(n => !Number.isNaN(n));
  const bNums = toNums(branchIds as any);
  const wNums = toNums(warehouseIds as any);
  const wsNums = toNums(workspaceIds as any);
  if (tableName === "branches") {
    return bNums.length > 0 ? inArray(s.branches.id, bNums as any) : undefined;
  }
  if (tableName === "warehouses") {
    const conds: ReturnType<typeof sql>[] = [];
    if (wNums.length > 0) conds.push(inArray(s.warehouses.id, wNums as any));
    if (bNums.length > 0) conds.push(inArray(s.warehouses.branchId, bNums as any));
    return conds.length > 0 ? or(...conds) : undefined;
  }
  if (tableName === "locations") {
    if (wNums.length > 0) return inArray(s.locations.warehouseId, wNums as any);
    if (bNums.length > 0) {
      return inArray(s.locations.warehouseId, db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, bNums as any))) as any;
    }
    return undefined;
  }
  if (tableName === "stockBalances") {
    if (wNums.length > 0) return inArray(s.stockBalances.warehouseId, wNums as any);
    if (bNums.length > 0) return inArray(s.stockBalances.warehouseId, db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, bNums as any))) as any;
    return undefined;
  }
  if (tableName === "stockLedger" || tableName === "stockBatches") {
    const whCol = tableName === "stockLedger" ? s.stockLedger.warehouseId : s.stockBatches.warehouseId;
    if (wNums.length > 0) return inArray(whCol, wNums as any);
    if (bNums.length > 0) return inArray(whCol, db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, bNums as any))) as any;
    return undefined;
  }
  if (tableName === "stockMovements" || tableName === "stockMovementDetails") {
    if (wNums.length > 0) {
      const mvIds = db.select({ id: s.stockMovements.id }).from(s.stockMovements).innerJoin(s.stockMovementDetails, eq(s.stockMovementDetails.movementId, s.stockMovements.id)).where(or(inArray(s.stockMovementDetails.fromWarehouseId, wNums as any), inArray(s.stockMovementDetails.toWarehouseId, wNums as any)));
      return tableName === "stockMovements" ? inArray(s.stockMovements.id, mvIds) : inArray(s.stockMovementDetails.movementId, mvIds);
    }
    return undefined;
  }
  if (tableName === "opnameWarehouses") {
    if (wNums.length > 0) return inArray(s.opnameWarehouses.warehouseId, wNums as any);
    if (bNums.length > 0) return inArray(s.opnameWarehouses.warehouseId, db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, bNums as any))) as any;
    return undefined;
  }
  if (tableName === "opnameScans") {
    const whConds: ReturnType<typeof sql>[] = [];
    if (wNums.length > 0) whConds.push(inArray(s.opnameWarehouses.warehouseId, wNums as any));
    if (bNums.length > 0) whConds.push(inArray(s.opnameWarehouses.warehouseId, db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, bNums as any))) as any);
    if (whConds.length === 0) return undefined;
    return inArray(s.opnameScans.opnameId, db.select({ opnameId: s.opnameWarehouses.opnameId }).from(s.opnameWarehouses).where(or(...whConds))) as any;
  }
  if (tableName === "opnameScanDetails") {
    if (wNums.length > 0) return inArray(s.opnameScanDetails.warehouseId, wNums as any);
    if (bNums.length > 0) return inArray(s.opnameScanDetails.warehouseId, db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, bNums as any))) as any;
    return undefined;
  }
  if (tableName === "workspaces") {
    return wsNums.length > 0 ? inArray(s.workspaces.id, wsNums as any) : sql`FALSE`;
  }
  if (tableName === "dashboards") {
    if (wsNums.length > 0) return or(inArray(s.dashboards.workspaceId, wsNums as any), eq(s.dashboards.isGlobal, true)) as any;
    return undefined;
  }
  return undefined;
}
async function buildWhere(req: Request, table: AnyPgTable, tableName: string) {
  const conditions: ReturnType<typeof sql>[] = [];
  const scope = await applyEntityScope(req, tableName);
  if (scope) conditions.push(scope);
  const s = schema;
  // helper to resolve publicId uuid to internal bigint for filter fields
  async function resolveBranchId(val: string): Promise<number|null> {
    if (isUuid(val)) { const [b] = await db.select({id: s.branches.id}).from(s.branches).where(eq(s.branches.publicId, val)).limit(1); return b?.id ?? null; }
    if (/^\d+$/.test(val)) return Number(val);
    return null;
  }
  async function resolveWarehouseId(val: string): Promise<number|null> {
    if (isUuid(val)) { const [w] = await db.select({id: s.warehouses.id}).from(s.warehouses).where(eq(s.warehouses.publicId, val)).limit(1); return w?.id ?? null; }
    if (/^\d+$/.test(val)) return Number(val);
    return null;
  }
  if (tableName === "warehouses") {
    const branchId = queryStr(req, "branchId");
    if (branchId) {
      const internal = await resolveBranchId(branchId);
      if (internal !== null) conditions.push(eq(s.warehouses.branchId, internal));
    }
    const parentId = queryStr(req, "parentId");
    if (parentId !== null) {
      if (parentId === "null" || parentId === "") {
        conditions.push(sql`${s.warehouses.parentId} IS NULL`);
      } else {
        const internal = await resolveWarehouseId(parentId);
        if (internal !== null) conditions.push(eq(s.warehouses.parentId, internal));
        else conditions.push(sql`FALSE`);
      }
    }
  }
  if (tableName === "locations") {
    const warehouseId = queryStr(req, "warehouseId");
    if (warehouseId) {
      const internal = await resolveWarehouseId(warehouseId);
      if (internal !== null) conditions.push(eq(s.locations.warehouseId, internal));
    }
  }
  if (tableName === "items") {
    const itemGroupId = queryStr(req, "itemGroupId");
    if (itemGroupId) {
      let internal: number|null = null;
      if (isUuid(itemGroupId)) { const [g] = await db.select({id: s.itemGroups.id}).from(s.itemGroups).where(eq(s.itemGroups.publicId, itemGroupId)).limit(1); internal = g?.id ?? null; }
      else if (/^\d+$/.test(itemGroupId)) internal = Number(itemGroupId);
      if (internal !== null) conditions.push(eq(s.items.itemGroupId, internal));
    }
  }
  const q = queryStr(req, "query");
  if (q) {
    const sc = searchCondition(tableName, q);
    if (sc) conditions.push(sc);
  }
  if (tableName === "stockBalances") {
    const warehouseId = queryStr(req, "warehouseId");
    if (warehouseId) { const internal = await resolveWarehouseId(warehouseId); if (internal !== null) conditions.push(eq(s.stockBalances.warehouseId, internal)); }
    const itemId = queryStr(req, "itemId");
    if (itemId) {
      let internal: number|null = null;
      if (isUuid(itemId)) { const [it] = await db.select({id: s.items.id}).from(s.items).where(eq(s.items.publicId, itemId)).limit(1); internal = it?.id ?? null; }
      else if (/^\d+$/.test(itemId)) internal = Number(itemId);
      if (internal !== null) conditions.push(eq(s.stockBalances.itemId, internal));
    }
  }
  if (tableName === "rolePermissions") {
    const roleId = queryStr(req, "roleId");
    if (roleId) {
      let internal: number|null = null;
      if (isUuid(roleId)) { const [r] = await db.select({id: s.roles.id}).from(s.roles).where(eq(s.roles.publicId, roleId)).limit(1); internal = r?.id ?? null; }
      else if (/^\d+$/.test(roleId)) internal = Number(roleId);
      if (internal !== null) conditions.push(eq(s.rolePermissions.roleId, internal));
    }
  }
  if (tableName === "branchAccesses") {
    const roleId = queryStr(req, "roleId");
    if (roleId) {
      let internal: number|null = null;
      if (isUuid(roleId)) { const [r] = await db.select({id: s.roles.id}).from(s.roles).where(eq(s.roles.publicId, roleId)).limit(1); internal = r?.id ?? null; }
      else if (/^\d+$/.test(roleId)) internal = Number(roleId);
      if (internal !== null) conditions.push(eq(s.branchAccesses.roleId, internal));
    }
  }
  if (tableName === "workspaceAccesses") {
    const roleId = queryStr(req, "roleId");
    if (roleId) {
      let internal: number|null = null;
      if (isUuid(roleId)) { const [r] = await db.select({id: s.roles.id}).from(s.roles).where(eq(s.roles.publicId, roleId)).limit(1); internal = r?.id ?? null; }
      else if (/^\d+$/.test(roleId)) internal = Number(roleId);
      if (internal !== null) conditions.push(eq(s.workspaceAccesses.roleId, internal));
    }
    const workspaceId = queryStr(req, "workspaceId");
    if (workspaceId) {
      let internal: number|null = null;
      if (isUuid(workspaceId)) { const [w] = await db.select({id: s.workspaces.id}).from(s.workspaces).where(eq(s.workspaces.publicId, workspaceId)).limit(1); internal = w?.id ?? null; }
      else if (/^\d+$/.test(workspaceId)) internal = Number(workspaceId);
      if (internal !== null) conditions.push(eq(s.workspaceAccesses.workspaceId, internal));
    }
  }
  if (tableName === "opnameWarehouses") {
    const opnameId = queryStr(req, "opnameId");
    if (opnameId) {
      let internal: number|null = null;
      if (isUuid(opnameId)) { const [p] = await db.select({id: s.opnameProjects.id}).from(s.opnameProjects).where(eq(s.opnameProjects.publicId, opnameId)).limit(1); internal = p?.id ?? null; }
      else if (/^\d+$/.test(opnameId)) internal = Number(opnameId);
      if (internal !== null) conditions.push(eq(s.opnameWarehouses.opnameId, internal));
    }
  }
  if (tableName === "opnameScans") {
    const opnameId = queryStr(req, "opnameId");
    if (opnameId) {
      let internal: number|null = null;
      if (isUuid(opnameId)) { const [p] = await db.select({id: s.opnameProjects.id}).from(s.opnameProjects).where(eq(s.opnameProjects.publicId, opnameId)).limit(1); internal = p?.id ?? null; }
      else if (/^\d+$/.test(opnameId)) internal = Number(opnameId);
      if (internal !== null) conditions.push(eq(s.opnameScans.opnameId, internal));
    }
    const status = queryStr(req, "status");
    if (status) conditions.push(sql`${s.opnameScans.status} = ${status}`);
  }
  if (tableName === "opnameScanDetails") {
    const opnameId = queryStr(req, "opnameId");
    if (opnameId) {
      let internal: number|null = null;
      if (isUuid(opnameId)) { const [p] = await db.select({id: s.opnameProjects.id}).from(s.opnameProjects).where(eq(s.opnameProjects.publicId, opnameId)).limit(1); internal = p?.id ?? null; }
      else if (/^\d+$/.test(opnameId)) internal = Number(opnameId);
      if (internal !== null) conditions.push(eq(s.opnameScanDetails.opnameId, internal));
    }
    const scanId = queryStr(req, "scanId");
    if (scanId) {
      let internal: number|null = null;
      if (isUuid(scanId)) { const [sc] = await db.select({id: s.opnameScans.id}).from(s.opnameScans).where(eq(s.opnameScans.publicId, scanId)).limit(1); internal = sc?.id ?? null; }
      else if (/^\d+$/.test(scanId)) internal = Number(scanId);
      if (internal !== null) conditions.push(eq(s.opnameScanDetails.scanId, internal));
    }
    const source = queryStr(req, "source");
    if (source) conditions.push(sql`${s.opnameScanDetails.source} = ${source}`);
    const date = queryStr(req, "date");
    if (date) conditions.push(sql`DATE(${s.opnameScanDetails.scannedAt}) = ${date}`);
  }
  if (tableName === "stockBarcodes") {
    const warehouseId = queryStr(req, "warehouseId");
    if (warehouseId) { const internal = await resolveWarehouseId(warehouseId); if (internal !== null) conditions.push(eq(s.stockBarcodes.warehouseId, internal)); }
    const barcode = queryStr(req, "barcode");
    if (barcode) conditions.push(eq(s.stockBarcodes.barcode, barcode));
    const itemId = queryStr(req, "itemId");
    if (itemId) {
      let internal: number|null = null;
      if (isUuid(itemId)) { const [it] = await db.select({id: s.items.id}).from(s.items).where(eq(s.items.publicId, itemId)).limit(1); internal = it?.id ?? null; }
      else if (/^\d+$/.test(itemId)) internal = Number(itemId);
      if (internal !== null) conditions.push(eq(s.stockBarcodes.itemId, internal));
    }
    const batchId = queryStr(req, "batchId");
    if (batchId) {
      let internal: number|null = null;
      if (isUuid(batchId)) { const [b] = await db.select({id: s.batches.id}).from(s.batches).where(eq(s.batches.publicId, batchId)).limit(1); internal = b?.id ?? null; }
      else if (/^\d+$/.test(batchId)) internal = Number(batchId);
      if (internal !== null) conditions.push(eq(s.stockBarcodes.batchId, internal));
    }
  }
  if (tableName === "priceLists") {
    const type = queryStr(req, "type");
    if (type) conditions.push(eq((s as any).priceLists.type, type));
    const supplierId = queryStr(req, "supplierId");
    if (supplierId) {
      let internal: number|null = null;
      if (isUuid(supplierId)) { const [sup] = await db.select({id: s.suppliers.id}).from(s.suppliers).where(eq(s.suppliers.publicId, supplierId)).limit(1); internal = sup?.id ?? null; }
      else if (/^\d+$/.test(supplierId)) internal = Number(supplierId);
      if (internal !== null) conditions.push(eq((s as any).priceLists.supplierId, internal));
    }
    const customerId = queryStr(req, "customerId");
    if (customerId) {
      let internal: number|null = null;
      if (isUuid(customerId)) { const [cust] = await db.select({id: s.customers.id}).from(s.customers).where(eq(s.customers.publicId, customerId)).limit(1); internal = cust?.id ?? null; }
      else if (/^\d+$/.test(customerId)) internal = Number(customerId);
      if (internal !== null) conditions.push(eq((s as any).priceLists.customerId, internal));
    }
  }
  if (tableName === "priceListLines") {
    const priceListId = queryStr(req, "priceListId");
    if (priceListId) {
      let internal: number|null = null;
      if (isUuid(priceListId)) { const [pl] = await db.select({id: (s as any).priceLists.id}).from((s as any).priceLists).where(eq((s as any).priceLists.publicId, priceListId)).limit(1); internal = pl?.id ?? null; }
      else if (/^\d+$/.test(priceListId)) internal = Number(priceListId);
      if (internal !== null) conditions.push(eq((s as any).priceListLines.priceListId, internal));
    }
    const itemId = queryStr(req, "itemId");
    if (itemId) {
      let internal: number|null = null;
      if (isUuid(itemId)) { const [it] = await db.select({id: s.items.id}).from(s.items).where(eq(s.items.publicId, itemId)).limit(1); internal = it?.id ?? null; }
      else if (/^\d+$/.test(itemId)) internal = Number(itemId);
      if (internal !== null) conditions.push(eq((s as any).priceListLines.itemId, internal));
    }
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
    const wantsPagination = queryStr(req, "page") !== null || queryStr(req, "pageSize") !== null;
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
      let rows = (await q).map((r) => sanitizeRow(table, r as Record<string, unknown>));
      rows = await enrichAccessRows(tableName, rows);
      if (tableName === "items" && rows.length > 0) {
        const igIds = [...new Set(rows.map((r: any) => r.itemGroupId).filter(Boolean))] as number[];
        const uomIds2 = [...new Set(rows.map((r: any) => r.uomId).filter(Boolean))] as number[];
        if (igIds.length) {
          const igs = await db.select({ id: schema.itemGroups.id, publicId: schema.itemGroups.publicId }).from(schema.itemGroups).where(inArray(schema.itemGroups.id, igIds as any));
          const map = new Map(igs.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.itemGroupId) r.itemGroupId = map.get(r.itemGroupId) ?? r.itemGroupId; });
        }
        if (uomIds2.length) {
          const us = await db.select({ id: schema.uom.id, publicId: schema.uom.publicId }).from(schema.uom).where(inArray(schema.uom.id, uomIds2 as any));
          const map = new Map(us.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.uomId) r.uomId = map.get(r.uomId) ?? r.uomId; });
        }
      }
      if (tableName === "warehouses" && rows.length > 0) {
        const bIds = [...new Set(rows.map((r: any) => r.branchId).filter(Boolean))] as number[];
        if (bIds.length) {
          const bs = await db.select({ id: schema.branches.id, publicId: schema.branches.publicId }).from(schema.branches).where(inArray(schema.branches.id, bIds as any));
          const bMap = new Map(bs.map((b) => [b.id as unknown as number, b.publicId]));
          rows.forEach((r: any) => { if (r.branchId != null && bMap.has(r.branchId)) r.branchId = bMap.get(r.branchId); });
        }
        const pIds = [...new Set(rows.map((r: any) => r.parentId).filter(Boolean))] as number[];
        if (pIds.length) {
          const ps = await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId }).from(schema.warehouses).where(inArray(schema.warehouses.id, pIds as any));
          const pMap = new Map(ps.map((p) => [p.id as unknown as number, p.publicId]));
          rows.forEach((r: any) => { if (r.parentId != null && pMap.has(r.parentId)) r.parentId = pMap.get(r.parentId); });
        }
      }
      if (tableName === "locations" && rows.length > 0) {
        const wIds = [...new Set(rows.map((r: any) => r.warehouseId).filter(Boolean))] as number[];
        if (wIds.length) {
          const ws = await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId }).from(schema.warehouses).where(inArray(schema.warehouses.id, wIds as any));
          const wMap = new Map(ws.map((w) => [w.id as unknown as number, w.publicId]));
          rows.forEach((r: any) => { if (r.warehouseId != null && wMap.has(r.warehouseId)) r.warehouseId = wMap.get(r.warehouseId); });
        }
      }
      if (tableName === "warehouses" && rows.length > 0) {
        const bIds2 = [...new Set(rows.map((r: any) => r.branchId).filter(Boolean))] as number[];
        if (bIds2.length) {
          const bs2 = await db.select({ id: schema.branches.id, publicId: schema.branches.publicId }).from(schema.branches).where(inArray(schema.branches.id, bIds2 as any));
          const bMap2 = new Map(bs2.map((b) => [b.id as unknown as number, b.publicId]));
          rows.forEach((r: any) => { if (r.branchId != null && bMap2.has(r.branchId)) r.branchId = bMap2.get(r.branchId); });
        }
        const pIds2 = [...new Set(rows.map((r: any) => r.parentId).filter(Boolean))] as number[];
        if (pIds2.length) {
          const ps2 = await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId }).from(schema.warehouses).where(inArray(schema.warehouses.id, pIds2 as any));
          const pMap2 = new Map(ps2.map((p) => [p.id as unknown as number, p.publicId]));
          rows.forEach((r: any) => { if (r.parentId != null && pMap2.has(r.parentId)) r.parentId = pMap2.get(r.parentId); });
        }
      }
      if (tableName === "locations" && rows.length > 0) {
        const wIds2 = [...new Set(rows.map((r: any) => r.warehouseId).filter(Boolean))] as number[];
        if (wIds2.length) {
          const ws2 = await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId }).from(schema.warehouses).where(inArray(schema.warehouses.id, wIds2 as any));
          const wMap2 = new Map(ws2.map((w) => [w.id as unknown as number, w.publicId]));
          rows.forEach((r: any) => { if (r.warehouseId != null && wMap2.has(r.warehouseId)) r.warehouseId = wMap2.get(r.warehouseId); });
        }
      }
      // Enrich FKs to publicId for priceLists/priceListLines
      if (tableName === "priceListLines" && rows.length > 0) {
        const plIds = [...new Set(rows.map((r: any) => r.priceListId).filter(Boolean))] as number[];
        const itemIds = [...new Set(rows.map((r: any) => r.itemId).filter(Boolean))] as number[];
        const uomIds = [...new Set(rows.map((r: any) => r.uomId).filter(Boolean))] as number[];
        const supplierIds = [...new Set(rows.map((r: any) => r.supplierId).filter(Boolean))] as number[];
        const customerIds = [...new Set(rows.map((r: any) => r.customerId).filter(Boolean))] as number[];
        if (plIds.length) {
          const pls = await db.select({ id: (schema as any).priceLists.id, publicId: (schema as any).priceLists.publicId }).from((schema as any).priceLists).where(inArray((schema as any).priceLists.id, plIds as any));
          const map = new Map(pls.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.priceListId) r.priceListId = map.get(r.priceListId) ?? r.priceListId; });
        }
        if (itemIds.length) {
          const its = await db.select({ id: schema.items.id, publicId: schema.items.publicId }).from(schema.items).where(inArray(schema.items.id, itemIds as any));
          const map = new Map(its.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.itemId) r.itemId = map.get(r.itemId) ?? r.itemId; });
        }
        if (uomIds.length) {
          const us = await db.select({ id: schema.uom.id, publicId: schema.uom.publicId }).from(schema.uom).where(inArray(schema.uom.id, uomIds as any));
          const map = new Map(us.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.uomId) r.uomId = map.get(r.uomId) ?? r.uomId; });
        }
        if (supplierIds.length) {
          const sups = await db.select({ id: schema.suppliers.id, publicId: schema.suppliers.publicId }).from(schema.suppliers).where(inArray(schema.suppliers.id, supplierIds as any));
          const map = new Map(sups.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.supplierId) r.supplierId = map.get(r.supplierId) ?? r.supplierId; });
        }
        if (customerIds.length) {
          const custs = await db.select({ id: schema.customers.id, publicId: schema.customers.publicId }).from(schema.customers).where(inArray(schema.customers.id, customerIds as any));
          const map = new Map(custs.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.customerId) r.customerId = map.get(r.customerId) ?? r.customerId; });
        }
      }
      if (tableName === "priceLists" && rows.length > 0) {
        const supplierIds = [...new Set(rows.map((r: any) => r.supplierId).filter(Boolean))] as number[];
        const customerIds = [...new Set(rows.map((r: any) => r.customerId).filter(Boolean))] as number[];
        if (supplierIds.length) {
          const sups = await db.select({ id: schema.suppliers.id, publicId: schema.suppliers.publicId }).from(schema.suppliers).where(inArray(schema.suppliers.id, supplierIds as any));
          const map = new Map(sups.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.supplierId) r.supplierId = map.get(r.supplierId) ?? r.supplierId; });
        }
        if (customerIds.length) {
          const custs = await db.select({ id: schema.customers.id, publicId: schema.customers.publicId }).from(schema.customers).where(inArray(schema.customers.id, customerIds as any));
          const map = new Map(custs.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.customerId) r.customerId = map.get(r.customerId) ?? r.customerId; });
        }
      }
      res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } else {
      let q = db.select().from(table).$dynamic();
      if (whereCond) q = q.where(whereCond);
      if (orderBy) q = q.orderBy(orderBy);
      let rows = (await q).map((r) => sanitizeRow(table, r as Record<string, unknown>));
      rows = await enrichAccessRows(tableName, rows);
      if (tableName === "items" && rows.length > 0) {
        const igIds = [...new Set(rows.map((r: any) => r.itemGroupId).filter(Boolean))] as number[];
        const uomIds2 = [...new Set(rows.map((r: any) => r.uomId).filter(Boolean))] as number[];
        if (igIds.length) {
          const igs = await db.select({ id: schema.itemGroups.id, publicId: schema.itemGroups.publicId }).from(schema.itemGroups).where(inArray(schema.itemGroups.id, igIds as any));
          const map = new Map(igs.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.itemGroupId) r.itemGroupId = map.get(r.itemGroupId) ?? r.itemGroupId; });
        }
        if (uomIds2.length) {
          const us = await db.select({ id: schema.uom.id, publicId: schema.uom.publicId }).from(schema.uom).where(inArray(schema.uom.id, uomIds2 as any));
          const map = new Map(us.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.uomId) r.uomId = map.get(r.uomId) ?? r.uomId; });
        }
      }
      if (tableName === "priceLists" && rows.length > 0) {
        const supplierIds = [...new Set(rows.map((r: any) => r.supplierId).filter(Boolean))] as number[];
        const customerIds = [...new Set(rows.map((r: any) => r.customerId).filter(Boolean))] as number[];
        if (supplierIds.length) {
          const sups = await db.select({ id: schema.suppliers.id, publicId: schema.suppliers.publicId }).from(schema.suppliers).where(inArray(schema.suppliers.id, supplierIds as any));
          const map = new Map(sups.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.supplierId) r.supplierId = map.get(r.supplierId) ?? r.supplierId; });
        }
        if (customerIds.length) {
          const custs = await db.select({ id: schema.customers.id, publicId: schema.customers.publicId }).from(schema.customers).where(inArray(schema.customers.id, customerIds as any));
          const map = new Map(custs.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.customerId) r.customerId = map.get(r.customerId) ?? r.customerId; });
        }
      }
      if (tableName === "warehouses" && rows.length > 0) {
        const bIds = [...new Set(rows.map((r: any) => r.branchId).filter(Boolean))] as number[];
        if (bIds.length) {
          const bs = await db.select({ id: schema.branches.id, publicId: schema.branches.publicId }).from(schema.branches).where(inArray(schema.branches.id, bIds as any));
          const bMap = new Map(bs.map((b) => [b.id as unknown as number, b.publicId]));
          rows.forEach((r: any) => { if (r.branchId != null && bMap.has(r.branchId)) r.branchId = bMap.get(r.branchId); });
        }
        const pIds = [...new Set(rows.map((r: any) => r.parentId).filter(Boolean))] as number[];
        if (pIds.length) {
          const ps = await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId }).from(schema.warehouses).where(inArray(schema.warehouses.id, pIds as any));
          const pMap = new Map(ps.map((p) => [p.id as unknown as number, p.publicId]));
          rows.forEach((r: any) => { if (r.parentId != null && pMap.has(r.parentId)) r.parentId = pMap.get(r.parentId); });
        }
      }
      if (tableName === "locations" && rows.length > 0) {
        const wIds = [...new Set(rows.map((r: any) => r.warehouseId).filter(Boolean))] as number[];
        if (wIds.length) {
          const ws = await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId }).from(schema.warehouses).where(inArray(schema.warehouses.id, wIds as any));
          const wMap = new Map(ws.map((w) => [w.id as unknown as number, w.publicId]));
          rows.forEach((r: any) => { if (r.warehouseId != null && wMap.has(r.warehouseId)) r.warehouseId = wMap.get(r.warehouseId); });
        }
      }
      if (tableName === "priceListLines" && rows.length > 0) {
        const plIds = [...new Set(rows.map((r: any) => r.priceListId).filter(Boolean))] as number[];
        const itemIds = [...new Set(rows.map((r: any) => r.itemId).filter(Boolean))] as number[];
        const uomIds = [...new Set(rows.map((r: any) => r.uomId).filter(Boolean))] as number[];
        if (plIds.length) {
          const pls = await db.select({ id: (schema as any).priceLists.id, publicId: (schema as any).priceLists.publicId }).from((schema as any).priceLists).where(inArray((schema as any).priceLists.id, plIds as any));
          const map = new Map(pls.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.priceListId) r.priceListId = map.get(r.priceListId) ?? r.priceListId; });
        }
        if (itemIds.length) {
          const its = await db.select({ id: schema.items.id, publicId: schema.items.publicId }).from(schema.items).where(inArray(schema.items.id, itemIds as any));
          const map = new Map(its.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.itemId) r.itemId = map.get(r.itemId) ?? r.itemId; });
        }
        if (uomIds.length) {
          const us = await db.select({ id: schema.uom.id, publicId: schema.uom.publicId }).from(schema.uom).where(inArray(schema.uom.id, uomIds as any));
          const map = new Map(us.map((x) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.uomId) r.uomId = map.get(r.uomId) ?? r.uomId; });
        }
        const supplierIds2 = [...new Set(rows.map((r: any) => r.supplierId).filter(Boolean))] as number[];
        const customerIds2 = [...new Set(rows.map((r: any) => r.customerId).filter(Boolean))] as number[];
        if (supplierIds2.length) {
          const sups = await db.select({ id: schema.suppliers.id, publicId: schema.suppliers.publicId }).from(schema.suppliers).where(inArray(schema.suppliers.id, supplierIds2 as any));
          const map = new Map(sups.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.supplierId) r.supplierId = map.get(r.supplierId) ?? r.supplierId; });
        }
        if (customerIds2.length) {
          const custs = await db.select({ id: schema.customers.id, publicId: schema.customers.publicId }).from(schema.customers).where(inArray(schema.customers.id, customerIds2 as any));
          const map = new Map(custs.map((x: any) => [x.id, x.publicId]));
          rows.forEach((r: any) => { if (r.customerId) r.customerId = map.get(r.customerId) ?? r.customerId; });
        }
      }
      res.json(rows);
    }
  } catch (e) {
    res.status(500).json({ error: messageOf(e) });
  }
});
async function stockBalanceConds(req: Request): Promise<ReturnType<typeof sql> | undefined> {
  const conds: ReturnType<typeof sql>[] = [];
  const scope = await applyEntityScope(req, "stockBalances");
  if (scope) conds.push(scope);
  const warehouseId = queryStr(req, "warehouseId");
  if (warehouseId) {
    let internal: number|null=null;
    if (isUuid(warehouseId)) { const [w]=await db.select({id: schema.warehouses.id}).from(schema.warehouses).where(eq(schema.warehouses.publicId, warehouseId)).limit(1); internal=w?.id??null; }
    else if (/^\d+$/.test(warehouseId)) internal=Number(warehouseId);
    if (internal!==null) conds.push(eq(schema.stockBalances.warehouseId, internal));
  }
  const itemId = queryStr(req, "itemId");
  if (itemId) {
    let internal: number|null=null;
    if (isUuid(itemId)) { const [it]=await db.select({id: schema.items.id}).from(schema.items).where(eq(schema.items.publicId, itemId)).limit(1); internal=it?.id??null; }
    else if (/^\d+$/.test(itemId)) internal=Number(itemId);
    if (internal!==null) conds.push(eq(schema.stockBalances.itemId, internal));
  }
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
      OR EXISTS (SELECT 1 FROM ${s.items} WHERE ${s.items.id} = ${s.stockBalances.itemId} AND (${s.items.code}::text ILIKE ${p} OR ${s.items.name}::text ILIKE ${p}))
      OR EXISTS (SELECT 1 FROM ${s.warehouses} WHERE ${s.warehouses.id} = ${s.stockBalances.warehouseId} AND ${s.warehouses.name}::text ILIKE ${p})
      OR EXISTS (SELECT 1 FROM ${s.items} i2 JOIN ${s.itemGroups} ON ${s.itemGroups.id} = i2."item_group_id" WHERE i2.id = ${s.stockBalances.itemId} AND ${s.itemGroups.name}::text ILIKE ${p})
    )`);
  }
  return conds.length > 0 ? and(...conds) : undefined;
}
crudRouter.get("/stock-balances/ledger", async (req, res) => {
  if (!(await checkTablePermission(req, res, "stockBalances", "view"))) return;
  try {
    const page = queryNum(req, "page") ?? 1;
    const pageSize = queryNum(req, "pageSize") ?? DEFAULT_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const from = queryStr(req, "from") ?? queryStr(req, "dateFrom") ?? queryStr(req, "startDate");
    const to = queryStr(req, "to") ?? queryStr(req, "dateTo") ?? queryStr(req, "endDate");
    const hasDateFilter = !!(from && /^\d{4}-\d{2}-\d{2}$/.test(from) || to && /^\d{4}-\d{2}-\d{2}$/.test(to));
    if (hasDateFilter) {
      const whereCond = await stockBalanceConds(req);
      const aggSub = db.select({ warehouseId: schema.stockBalances.warehouseId, itemId: schema.stockBalances.itemId, minDate: sql<string>`MIN(${schema.stockBalances.balanceDate})`.as("minDate"), maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate"), sumIn: sql<number>`SUM(${schema.stockBalances.inQty})`.as("sumIn"), sumOut: sql<number>`SUM(${schema.stockBalances.outQty})`.as("sumOut") }).from(schema.stockBalances).where(whereCond ?? undefined).groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId).as("agg");
      const countQ = await db.select({ count: sql<number>`count(*)` }).from(aggSub);
      const total = Number(countQ[0]?.count ?? 0);
      const rows = await db.select({ warehouseId: aggSub.warehouseId, itemId: aggSub.itemId, code: schema.items.code, name: schema.items.name, itemGroup: schema.itemGroups.name, warehouse: schema.warehouses.name, balanceDate: aggSub.maxDate, openingQty: sql<number>`(SELECT ${schema.stockBalances.openingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${aggSub.warehouseId} AND ${schema.stockBalances.itemId} = ${aggSub.itemId} AND ${schema.stockBalances.balanceDate} = ${aggSub.minDate} LIMIT 1)`.as("openingQty"), inQty: aggSub.sumIn, outQty: aggSub.sumOut, closingQty: sql<number>`(SELECT ${schema.stockBalances.closingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${aggSub.warehouseId} AND ${schema.stockBalances.itemId} = ${aggSub.itemId} AND ${schema.stockBalances.balanceDate} = ${aggSub.maxDate} LIMIT 1)`.as("closingQty"), id: sql<string>`${aggSub.warehouseId} || '|' || ${aggSub.itemId}`.as("id") }).from(aggSub).leftJoin(schema.items, eq(schema.items.id, aggSub.itemId)).leftJoin(schema.warehouses, eq(schema.warehouses.id, aggSub.warehouseId)).leftJoin(schema.itemGroups, eq(schema.itemGroups.id, schema.items.itemGroupId)).orderBy(sql`${schema.items.code} ASC NULLS LAST`, sql`${schema.warehouses.name} ASC NULLS LAST`).offset(offset).limit(pageSize);
      res.json({ rows: rows.map((r) => ({ id: String((r as any).id), warehouseId: (r as any).warehouseId, itemId: (r as any).itemId, code: (r as any).code, name: (r as any).name, itemGroup: (r as any).itemGroup, warehouse: (r as any).warehouse, balanceDate: (r as any).balanceDate, openingQty: Number((r as any).openingQty ?? 0), inQty: Number((r as any).inQty ?? 0), outQty: Number((r as any).outQty ?? 0), closingQty: Number((r as any).closingQty ?? 0) })), total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
      return;
    }
    const baseWhere = await stockBalanceConds(req);
    const latestSub = db.select({ warehouseId: schema.stockBalances.warehouseId, itemId: schema.stockBalances.itemId, maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate") }).from(schema.stockBalances).where(baseWhere ?? undefined).groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId).as("latest");
    const countQ = await db.select({ count: sql<number>`count(*)` }).from(latestSub);
    const total = Number(countQ[0]?.count ?? 0);
    const rows = await db.select({ id: schema.stockBalances.id, warehouseId: schema.stockBalances.warehouseId, itemId: schema.stockBalances.itemId, code: schema.items.code, name: schema.items.name, itemGroup: schema.itemGroups.name, warehouse: schema.warehouses.name, balanceDate: schema.stockBalances.balanceDate, openingQty: schema.stockBalances.openingQty, inQty: schema.stockBalances.inQty, outQty: schema.stockBalances.outQty, closingQty: schema.stockBalances.closingQty }).from(schema.stockBalances).innerJoin(latestSub, and(eq(schema.stockBalances.warehouseId, latestSub.warehouseId), eq(schema.stockBalances.itemId, latestSub.itemId), eq(schema.stockBalances.balanceDate, latestSub.maxDate))).leftJoin(schema.items, eq(schema.items.id, schema.stockBalances.itemId)).leftJoin(schema.warehouses, eq(schema.warehouses.id, schema.stockBalances.warehouseId)).leftJoin(schema.itemGroups, eq(schema.itemGroups.id, schema.items.itemGroupId)).where(baseWhere ?? undefined).orderBy(sql`${schema.items.code} ASC NULLS LAST`, sql`${schema.warehouses.name} ASC NULLS LAST`).offset(offset).limit(pageSize);
    res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
crudRouter.get("/stock-balances/summary", async (req, res) => {
  if (!(await checkTablePermission(req, res, "stockBalances", "view"))) return;
  try {
    const from = queryStr(req, "from") ?? queryStr(req, "dateFrom") ?? queryStr(req, "startDate");
    const to = queryStr(req, "to") ?? queryStr(req, "dateTo") ?? queryStr(req, "endDate");
    const hasDateFilter = !!(from && /^\d{4}-\d{2}-\d{2}$/.test(from) || to && /^\d{4}-\d{2}-\d{2}$/.test(to));
    const whereCond = await stockBalanceConds(req);
    if (hasDateFilter) {
      const aggSub = db.select({ warehouseId: schema.stockBalances.warehouseId, itemId: schema.stockBalances.itemId, maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate") }).from(schema.stockBalances).where(whereCond ?? undefined).groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId).as("agg");
      const [row] = await db.select({ totalItems: sql<number>`count(distinct ${aggSub.itemId})`, totalQty: sql<number>`coalesce(sum((SELECT ${schema.stockBalances.closingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${aggSub.warehouseId} AND ${schema.stockBalances.itemId} = ${aggSub.itemId} AND ${schema.stockBalances.balanceDate} = ${aggSub.maxDate} LIMIT 1)),0)`, totalRows: sql<number>`count(*)` }).from(aggSub);
      res.json({ totalItems: Number(row.totalItems ?? 0), totalQty: Number(row.totalQty ?? 0), totalRows: Number(row.totalRows ?? 0) }); return;
    }
    const latestSub = db.select({ warehouseId: schema.stockBalances.warehouseId, itemId: schema.stockBalances.itemId, maxDate: sql<string>`MAX(${schema.stockBalances.balanceDate})`.as("maxDate") }).from(schema.stockBalances).where(whereCond ?? undefined).groupBy(schema.stockBalances.warehouseId, schema.stockBalances.itemId).as("latest");
    const [row] = await db.select({ totalItems: sql<number>`count(distinct ${latestSub.itemId})`, totalQty: sql<number>`coalesce(sum((SELECT ${schema.stockBalances.closingQty} FROM ${schema.stockBalances} WHERE ${schema.stockBalances.warehouseId} = ${latestSub.warehouseId} AND ${schema.stockBalances.itemId} = ${latestSub.itemId} AND ${schema.stockBalances.balanceDate} = ${latestSub.maxDate} LIMIT 1)),0)`, totalRows: sql<number>`count(*)` }).from(latestSub);
    res.json({ totalItems: Number(row.totalItems ?? 0), totalQty: Number(row.totalQty ?? 0), totalRows: Number(row.totalRows ?? 0) });
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
crudRouter.get("/item-groups/counts", async (req, res) => {
  if (!(await checkTablePermission(req, res, "itemGroups", "view"))) return;
  try {
    const rows = await db.select({ itemGroupId: schema.items.itemGroupId, count: sql<number>`count(*)::int` }).from(schema.items).where(sql`${schema.items.itemGroupId} is not null`).groupBy(schema.items.itemGroupId);
    res.json({ counts: Object.fromEntries(rows.map((r) => [String(r.itemGroupId), Number(r.count)])) });
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
crudRouter.get("/items/lookup", async (req, res) => {
  if (!req.user) { res.status(401).json({ error: "Tidak terautentikasi." }); return; }
  if (!(await canViewOpnameContext(req.user.role))) { if (!(await checkPermission(req, res, "master", "view"))) return; }
  try {
    const barcodeRaw = queryStr(req, "barcode");
    const formatId = queryStr(req, "formatId");
    if (!barcodeRaw) { res.json({ found: false, detail: "no barcode" }); return; }
    const barcode = barcodeRaw.trim();
    let formats: any[] = [];
    if (formatId) {
      const fid = isUuid(formatId) ? (await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.publicId, formatId)).limit(1).then(r=>r[0]?.id ? db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.id, r[0].id)).limit(1).then(x=>x) : [])) : await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.id, Number(formatId) as any)).limit(1);
      // simpler: try both
      if (isUuid(formatId)) { formats = await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.publicId, formatId)); if (!formats.length) formats = await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.id, Number(formatId) as any)); }
      else { formats = await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.id, Number(formatId) as any)); }
    } else {
      formats = await db.select().from(schema.barcodeFormats).where(eq(schema.barcodeFormats.isActive, true));
    }
    const itemGroupsAll = await db.select().from(schema.itemGroups);
    const itemsAll = await db.select().from(schema.items);
    for (const fmt of formats) {
      const segments = (fmt.segments ?? []) as { id: string; field: string; start: number; end: number; label?: string; batchFormatId?: string }[];
      if (barcode.length < segments.reduce((m, s) => Math.max(m, s.end), 0)) continue;
      const values: Record<string, string> = {};
      let itemCode: string | null = null;
      let itemGroupCode: string | null = null;
      for (const seg of segments) { const val = barcode.slice(seg.start - 1, seg.end); values[seg.field] = val; if (seg.field === "ITEM_CODE") itemCode = val; if (seg.field === "ITEM_GROUP") itemGroupCode = val; }
      const batchSeg = segments.find((s) => s.field === "BATCH");
      let batch: ReturnType<typeof parseBatchNumber> | null = null;
      if (batchSeg) {
        if (!batchSeg.batchFormatId) continue;
        // batchFormatId may be publicId or internal
        let bfId: number | null = null;
        if (isUuid(batchSeg.batchFormatId)) { const [bf] = await db.select({id: schema.batchFormats.id}).from(schema.batchFormats).where(eq(schema.batchFormats.publicId, batchSeg.batchFormatId)).limit(1); bfId = bf?.id ?? null; } else bfId = Number(batchSeg.batchFormatId);
        const bf = (await activeBatchFormats()).find((f) => String((f as any).id) === String(bfId));
        if (bf) batch = parseBatchNumber(values.BATCH, [bf]);
      }
      if (itemCode) {
        const item = itemsAll.find((it) => it.code.toLowerCase() === itemCode!.toLowerCase());
        if (item) {
          const ig = itemGroupsAll.find((c) => itemGroupCode ? c.code.toLowerCase() === itemGroupCode.toLowerCase() : String(c.id) === String(item.itemGroupId)) ?? null;
          res.json({ found: true, item: sanitizeRow(schema.items, item as any), itemGroup: ig ? { id: (ig as any).publicId ?? ig.id, code: ig.code, name: ig.name } : null, matched: true, formatId: (fmt as any).publicId ?? fmt.id, formatName: fmt.name, values, batchNumber: values.BATCH ?? undefined, batch });
          return;
        }
      }
      if (batch?.alternativeCode) {
        const alt = batch.alternativeCode.trim().toLowerCase();
        const item = itemsAll.find((it) => it.alternativeCode && it.alternativeCode.trim().toLowerCase() === alt);
        if (item) {
          const ig = itemGroupsAll.find((c) => String(c.id) === String(item.itemGroupId)) ?? null;
          res.json({ found: true, item: sanitizeRow(schema.items, item as any), itemGroup: ig ? { id: (ig as any).publicId ?? ig.id, code: ig.code, name: ig.name } : null, matched: true, formatId: (fmt as any).publicId ?? fmt.id, formatName: fmt.name, values, batchNumber: values.BATCH ?? undefined, batch });
          return;
        }
      }
    }
    res.json({ found: false, detail: "no match" });
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
crudRouter.get("/opname-scan-details/check", async (req, res) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;
  try {
    const opnameId = queryStr(req, "opnameId");
    const barcode = queryStr(req, "barcode");
    const excludeScanId = queryStr(req, "excludeScanId");
    if (!opnameId || !barcode) { res.json({ exists: false }); return; }
    let internalOpnameId: number | null = null;
    if (isUuid(opnameId)) { const [p]=await db.select({id: schema.opnameProjects.id}).from(schema.opnameProjects).where(eq(schema.opnameProjects.publicId, opnameId)).limit(1); internalOpnameId=p?.id??null; } else internalOpnameId=Number(opnameId);
    if (internalOpnameId===null) { res.json({exists:false}); return; }
    const conds: ReturnType<typeof sql>[] = [eq(schema.opnameScanDetails.opnameId, internalOpnameId), eq(schema.opnameScanDetails.barcode, barcode)];
    if (excludeScanId) {
      let internalScanId: number|null=null;
      if (isUuid(excludeScanId)) { const [sc]=await db.select({id: schema.opnameScans.id}).from(schema.opnameScans).where(eq(schema.opnameScans.publicId, excludeScanId)).limit(1); internalScanId=sc?.id??null; } else internalScanId=Number(excludeScanId);
      if (internalScanId!==null) conds.push(sql`${schema.opnameScanDetails.scanId} != ${internalScanId}`);
    }
    const [detail] = await db.select({ scanId: schema.opnameScanDetails.scanId, locationId: schema.opnameScanDetails.locationId, scannedAt: schema.opnameScanDetails.scannedAt, scannedBy: schema.opnameScans.scannedBy }).from(schema.opnameScanDetails).leftJoin(schema.opnameScans, eq(schema.opnameScanDetails.scanId, schema.opnameScans.id)).where(and(...conds)).orderBy(sql`${schema.opnameScanDetails.scannedAt} DESC`).limit(1);
    if (!detail) { res.json({ exists: false }); return; }
    const [user] = detail.scannedBy ? await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, detail.scannedBy)).limit(1) : [null];
    const [loc] = detail.locationId ? await db.select({ code: schema.locations.code }).from(schema.locations).where(eq(schema.locations.id, detail.locationId)).limit(1) : [null];
    res.json({ exists: true, record: { scanId: detail.scanId, scannedBy: user?.name ?? "—", locationCode: loc?.code ?? "—", scannedAt: detail.scannedAt } });
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
crudRouter.get("/batch-formats/parse", async (req, res) => {
  if (!(await checkAnyPermission(req, res, ["master", "inventory", "opname"], "view"))) return;
  try {
    const number = queryStr(req, "number");
    if (!number) { res.json({ parsed: null }); return; }
    res.json({ parsed: parseBatchNumber(number, await activeBatchFormats()) });
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
crudRouter.get("/:table/:id", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;
  if (!(await checkTablePermission(req, res, tableName, "view"))) return;
  try {
    const publicIdCol = publicIdColumn(table);
    const idCol = idColumn(table);
    const paramId = paramString(req, "id");
    let whereCond: any = undefined;
    if (publicIdCol && isUuid(paramId)) whereCond = eq(publicIdCol, paramId);
    else if (/^\d+$/.test(paramId)) whereCond = eq(idCol, Number(paramId) as any);
    else if (publicIdCol) whereCond = eq(publicIdCol, paramId);
    else whereCond = eq(idCol, paramId as any);
    const [row] = await db.select().from(table).where(whereCond).limit(1);
    if (!row) { res.status(404).json({ error: "Data tidak ditemukan." }); return; }
    const sanitized: any = sanitizeRow(table, row as Record<string, unknown>);
    // Enrich access tables FKs → publicId
    if (sanitized) {
      if (tableName === "workspaceAccesses") {
        if (sanitized.workspaceId) {
          const [w] = await db.select({ publicId: schema.workspaces.publicId }).from(schema.workspaces).where(eq(schema.workspaces.id, sanitized.workspaceId)).limit(1);
          if (w) sanitized.workspaceId = w.publicId;
        }
        if (sanitized.roleId) {
          const [r] = await db.select({ publicId: schema.roles.publicId }).from(schema.roles).where(eq(schema.roles.id, sanitized.roleId)).limit(1);
          if (r) sanitized.roleId = r.publicId;
        }
      } else if (tableName === "branchAccesses") {
        if (sanitized.roleId) {
          const [r] = await db.select({ publicId: schema.roles.publicId }).from(schema.roles).where(eq(schema.roles.id, sanitized.roleId)).limit(1);
          if (r) sanitized.roleId = r.publicId;
        }
        if (sanitized.entityId) {
          if (sanitized.entityType === "BRANCH") {
            const [b] = await db.select({ publicId: schema.branches.publicId }).from(schema.branches).where(eq(schema.branches.id, sanitized.entityId)).limit(1);
            if (b) sanitized.entityId = b.publicId;
          } else if (sanitized.entityType === "WAREHOUSE") {
            const [w] = await db.select({ publicId: schema.warehouses.publicId }).from(schema.warehouses).where(eq(schema.warehouses.id, sanitized.entityId)).limit(1);
            if (w) sanitized.entityId = w.publicId;
          }
        }
      } else if (tableName === "rolePermissions") {
        if (sanitized.roleId) {
          const [r] = await db.select({ publicId: schema.roles.publicId }).from(schema.roles).where(eq(schema.roles.id, sanitized.roleId)).limit(1);
          if (r) sanitized.roleId = r.publicId;
        }
      }
    }
    if (tableName === "warehouses" && sanitized) {
      if (sanitized.branchId) {
        const [b] = await db.select({ publicId: schema.branches.publicId }).from(schema.branches).where(eq(schema.branches.id, sanitized.branchId)).limit(1);
        if (b) sanitized.branchId = b.publicId;
      }
      if (sanitized.parentId) {
        const [p] = await db.select({ publicId: schema.warehouses.publicId }).from(schema.warehouses).where(eq(schema.warehouses.id, sanitized.parentId)).limit(1);
        if (p) sanitized.parentId = p.publicId;
      }
    }
    if (tableName === "locations" && sanitized) {
      if (sanitized.warehouseId) {
        const [w] = await db.select({ publicId: schema.warehouses.publicId }).from(schema.warehouses).where(eq(schema.warehouses.id, sanitized.warehouseId)).limit(1);
        if (w) sanitized.warehouseId = w.publicId;
      }
    }
    if (tableName === "users" && sanitized) {
      if ((sanitized as any).roleId) {
        const [r] = await db.select({ publicId: schema.roles.publicId }).from(schema.roles).where(eq(schema.roles.id, (sanitized as any).roleId)).limit(1);
        if (r) { (sanitized as any).role = r.publicId; (sanitized as any).roleId = r.publicId; }
      }
    }
    if (tableName === "priceLists" && sanitized) {
      if (sanitized.supplierId) {
        const [sup] = await db.select({ publicId: schema.suppliers.publicId }).from(schema.suppliers).where(eq(schema.suppliers.id, sanitized.supplierId)).limit(1);
        if (sup) sanitized.supplierId = sup.publicId;
      }
      if (sanitized.customerId) {
        const [cust] = await db.select({ publicId: schema.customers.publicId }).from(schema.customers).where(eq(schema.customers.id, sanitized.customerId)).limit(1);
        if (cust) sanitized.customerId = cust.publicId;
      }
    }
    if (tableName === "priceListLines" && sanitized) {
      if (sanitized.priceListId) {
        const [pl] = await db.select({ publicId: (schema as any).priceLists.publicId }).from((schema as any).priceLists).where(eq((schema as any).priceLists.id, sanitized.priceListId)).limit(1);
        if (pl) sanitized.priceListId = pl.publicId;
      }
      if (sanitized.itemId) {
        const [it] = await db.select({ publicId: schema.items.publicId }).from(schema.items).where(eq(schema.items.id, sanitized.itemId)).limit(1);
        if (it) sanitized.itemId = it.publicId;
      }
      if (sanitized.uomId) {
        const [u] = await db.select({ publicId: schema.uom.publicId }).from(schema.uom).where(eq(schema.uom.id, sanitized.uomId)).limit(1);
        if (u) sanitized.uomId = u.publicId;
      }
    }
    if (tableName === "items" && sanitized) {
      if (sanitized.itemGroupId) {
        const [ig] = await db.select({ publicId: schema.itemGroups.publicId }).from(schema.itemGroups).where(eq(schema.itemGroups.id, sanitized.itemGroupId)).limit(1);
        if (ig) sanitized.itemGroupId = ig.publicId;
      }
      if (sanitized.uomId) {
        const [u] = await db.select({ publicId: schema.uom.publicId }).from(schema.uom).where(eq(schema.uom.id, sanitized.uomId)).limit(1);
        if (u) sanitized.uomId = u.publicId;
      }
    }
    res.json(sanitized);
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
async function resolveBatchFromScan(itemId: number, batchNumber: string): Promise<number | null> {
  const [item] = await db.select({ alternativeCode: schema.items.alternativeCode }).from(schema.items).where(eq(schema.items.id, itemId)).limit(1);
  const parsed = parseBatchNumber(batchNumber, await activeBatchFormats());
  const alt = parsed?.alternativeCode;
  if (alt && item?.alternativeCode) {
    if (alt.trim().toLowerCase() !== item.alternativeCode.trim().toLowerCase()) {
      const err = new Error(`Batch "${batchNumber}" meng-encode kode alternatif "${alt}" tetapi item ini punya kode alternatif "${item.alternativeCode}" — batch tidak cocok dengan item.`) as Error & { code?: string };
      err.code = "BATCH_MISMATCH"; throw err;
    }
  }
  const [existing] = await db.select({ id: schema.batches.id }).from(schema.batches).where(and(eq(schema.batches.itemId, itemId), eq(schema.batches.batchNumber, batchNumber))).limit(1);
  if (existing) return existing.id;
  const [ins] = await db.insert(schema.batches).values({ itemId, batchNumber, status: "ACTIVE", ...(parsed?.productionDate ? {productionDate: parsed.productionDate} : {}), ...(parsed?.shift ? {shift: parsed.shift} : {}), ...(parsed && Object.keys(parsed.meta).length>0 ? {meta: parsed.meta} : {}) } as any).returning();
  return ins?.id ?? null;
}
// POST /:table
crudRouter.post("/:table", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;
  if (!(await checkTablePermission(req, res, tableName, "create"))) return;
  try {
    let values = coerceDates(req.body);
    values = await resolveIncomingIds(values);
    if (!(await enforceEntity(req, values))) return res.status(403).json({ error: "Tidak memiliki akses entitas." });
    if (tableName === "warehouses" && values.parentId != null) {
      const parentIdNum = Number(values.parentId);
      if (values.branchId != null) {
        const [parent] = await db.select({ branchId: schema.warehouses.branchId }).from(schema.warehouses).where(eq(schema.warehouses.id, parentIdNum as any)).limit(1);
        if (!parent) return res.status(400).json({ error: "Induk warehouse tidak ditemukan." });
        if (Number(parent.branchId) !== Number(values.branchId)) return res.status(400).json({ error: "Branch sub-gudang harus sama dengan gudang induk." });
      }
      // cegah self-reference (walaupun insert belum punya id, tetap validasi numeric)
      // cycle depth >1 akan dicek pada PATCH
    }
    if (tableName === "userSettings" && req.user) {
      const userInternal = req.user.internalId ?? (isUuid(req.user.id) ? (await db.select({id: schema.users.id}).from(schema.users).where(eq(schema.users.publicId, req.user.id)).limit(1).then(r=>r[0]?.id) ) : Number(req.user.id));
      values.userId = userInternal;
    }
    if (tableName === "items" && typeof values.code === "string") {
      values.code = values.code.trim();
      const [dup] = await db.select({ id: schema.items.id }).from(schema.items).where(sql`lower(${schema.items.code}) = lower(${values.code})`).limit(1);
      if (dup) return res.status(409).json({ error: "Kode item sudah digunakan." });
    }
    if (tableName === "movementTypes") {
      if (!values.code || !String(values.code).trim()) values.code = await autoMovementTypeCode(String(values.series ?? ""), String(values.kind ?? "OTHER"));
      else values.code = String(values.code).trim();
    }
    if (tableName === "taxCategories") {
      if (typeof values.code === "string") values.code = String(values.code).trim().toUpperCase();
      if (typeof values.name === "string") values.name = String(values.name).trim();
      if (values.percentage != null) values.percentage = String(values.percentage).trim();
      if (!values.code || !values.name || values.percentage == null || String(values.percentage).trim() === "") {
        return res.status(400).json({ error: "code, name, percentage wajib diisi." });
      }
      const pct = Number(values.percentage);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return res.status(400).json({ error: "percentage harus angka 0-100." });
      }
      values.percentage = String(pct);
      values.updatedAt = new Date();
      const [dup] = await db.select({ id: (schema as any).taxCategories.id }).from((schema as any).taxCategories).where(sql`lower(${(schema as any).taxCategories.code}) = lower(${values.code})`).limit(1);
      if (dup) return res.status(409).json({ error: "Kode kategori pajak sudah digunakan." });
    }
    if (tableName === "priceLists") {
      if (typeof values.code === "string" && values.code.trim()) values.code = String(values.code).trim().toUpperCase();
      else {
        // auto-generate code if not provided (for UI without code input)
        const base = "PL";
        let gen = `${base}-${Date.now().toString().slice(-6)}`;
        const [exists] = await db.select({ id: (schema as any).priceLists.id }).from((schema as any).priceLists).where(sql`lower(${(schema as any).priceLists.code}) = lower(${gen})`).limit(1);
        if (exists) gen = `${base}-${Math.floor(100000 + Math.random() * 900000)}`;
        values.code = gen;
      }
      if (typeof values.name === "string") values.name = String(values.name).trim();
      if (!values.name) return res.status(400).json({ error: "name wajib diisi." });
      if (!values.type) values.type = "PURCHASE";
      if (typeof values.type === "string") values.type = String(values.type).trim().toUpperCase();
      if (!["PURCHASE", "SALES"].includes(String(values.type))) {
        return res.status(400).json({ error: "type harus PURCHASE atau SALES." });
      }
      if (String(values.type) === "PURCHASE") {
        // supplier optional now (removed from UI)
        values.customerId = null;
      } else {
        if (!values.customerId) return res.status(400).json({ error: "Customer wajib untuk type SALES." });
        values.supplierId = null;
      }
      values.updatedAt = new Date();
      if (!values.createdBy && req.user) { const _ai = await getActorInfo(req); values.createdBy = _ai.internalId ?? null; }
      const [dup] = await db.select({ id: (schema as any).priceLists.id }).from((schema as any).priceLists).where(sql`lower(${(schema as any).priceLists.code}) = lower(${values.code})`).limit(1);
      if (dup) return res.status(409).json({ error: "Kode price list sudah digunakan." });
    }
    if (tableName === "priceListLines") {
      if (values.unitPrice != null) values.unitPrice = String(values.unitPrice);
      const price = Number(values.unitPrice);
      if (!isFinite(price) || price < 0) return res.status(400).json({ error: "unitPrice harus angka >=0." });
      if (!values.type) {
        // default to parent priceList type if available
        if (values.priceListId) {
          const [pl] = await db.select({ type: (schema as any).priceLists.type }).from((schema as any).priceLists).where(eq((schema as any).priceLists.id, values.priceListId as any)).limit(1);
          values.type = (pl as any)?.type ?? "PURCHASE";
        } else {
          values.type = "PURCHASE";
        }
      }
      if (typeof values.type === "string") values.type = String(values.type).trim().toUpperCase();
      if (!["PURCHASE", "SALES"].includes(String(values.type))) {
        return res.status(400).json({ error: "type harus PURCHASE atau SALES." });
      }
      if (String(values.type) === "PURCHASE") {
        if (!values.supplierId) {
          // try to default from parent priceList if type matches
          if (values.priceListId) {
            const [pl] = await db.select({ supplierId: (schema as any).priceLists.supplierId }).from((schema as any).priceLists).where(eq((schema as any).priceLists.id, values.priceListId as any)).limit(1);
            if ((pl as any)?.supplierId) values.supplierId = (pl as any).supplierId;
            else return res.status(400).json({ error: "Supplier wajib untuk type PURCHASE." });
          } else {
            return res.status(400).json({ error: "Supplier wajib untuk type PURCHASE." });
          }
        }
        values.customerId = null;
      } else {
        if (!values.customerId) {
          if (values.priceListId) {
            const [pl] = await db.select({ customerId: (schema as any).priceLists.customerId }).from((schema as any).priceLists).where(eq((schema as any).priceLists.id, values.priceListId as any)).limit(1);
            if ((pl as any)?.customerId) values.customerId = (pl as any).customerId;
            else return res.status(400).json({ error: "Customer wajib untuk type SALES." });
          } else {
            return res.status(400).json({ error: "Customer wajib untuk type SALES." });
          }
        }
        values.supplierId = null;
      }
      // auto fill uom from item if not provided
      if (!values.uomId && values.itemId) {
        const [it] = await db.select({ uomId: schema.items.uomId }).from(schema.items).where(eq(schema.items.id, values.itemId as any)).limit(1);
        if (it?.uomId) values.uomId = it.uomId;
      }
      // auto fill currency from priceList if not provided
      if (!values.currency && values.priceListId) {
        const [pl] = await db.select({ currency: (schema as any).priceLists.currency }).from((schema as any).priceLists).where(eq((schema as any).priceLists.id, values.priceListId as any)).limit(1);
        if ((pl as any)?.currency) values.currency = (pl as any).currency;
        else values.currency = "IDR";
      }
      if (!values.currency) values.currency = "IDR";
      values.updatedAt = new Date();
      if (values.priceListId && values.itemId) {
        const conds: any[] = [eq((schema as any).priceListLines.priceListId, values.priceListId as any), eq((schema as any).priceListLines.itemId, values.itemId as any)];
        if (values.supplierId) conds.push(eq((schema as any).priceListLines.supplierId, values.supplierId as any));
        if (values.customerId) conds.push(eq((schema as any).priceListLines.customerId, values.customerId as any));
        const [dup] = await db.select({ id: (schema as any).priceListLines.id }).from((schema as any).priceListLines).where(and(...conds)).limit(1);
        if (dup) return res.status(409).json({ error: "Item dengan supplier/customer tersebut sudah ada di price list ini." });
      }
    }
    if (tableName === "opnameScanDetails") {
      const parsed = (values.parsed ?? {}) as Record<string, unknown>;
      const batchNumber = typeof parsed.BATCH === "string" && parsed.BATCH.trim() ? parsed.BATCH.trim() : null;
      if (batchNumber && typeof values.itemId === "number") {
        const batchId = await resolveBatchFromScan(values.itemId, batchNumber);
        if (batchId) values.batchId = batchId;
      }
    }
    let rows: Record<string, unknown>[];
    try {
      rows = INSERT_OR_IGNORE.has(tableName) ? await db.insert(table).values(values).onConflictDoNothing().returning() : await db.insert(table).values(values).returning();
    } catch (e) {
      if (isUniqueViolation(e)) throw e;
      throw e;
    }
    const row = rows[0] ?? values;
    // Activity log: create (master setup + dokumen generic)
    try {
      const docType = CRUD_DOC_TYPE[tableName] ?? tableName.toUpperCase();
      const docId = (row as any).id != null ? Number((row as any).id) : null;
      if (docId != null && Number.isFinite(docId)) {
        const { internalId, role } = await getActorInfo(req);
        const meta: Record<string, unknown> = { keys: Object.keys(values) };
        // include code/name if present for easier timeline
        if ((row as any).code) meta.code = (row as any).code;
        if ((row as any).name) meta.name = (row as any).name;
        if ((row as any).documentNo) meta.documentNo = (row as any).documentNo;
        await logActivity({ documentType: docType, documentId: docId, action: "create", fromStatus: null, toStatus: null, actorUserId: internalId, actorRole: role, metadata: meta });
      }
    } catch {}
    if (tableName === "opnameScans") {
      const opnameId = (values as any).opnameId;
      if (opnameId) await db.update(schema.opnameProjects).set({ status: "IN_PROGRESS", updatedAt: new Date() }).where(eq(schema.opnameProjects.id, opnameId));
    }
    if (tableName === "opnameScanDetails") {
      const opnameId = (values as any).opnameId;
      const warehouseId = (values as any).warehouseId;
      if (opnameId && warehouseId) {
        await db.update(schema.opnameWarehouses).set({ status: "IN_PROGRESS", startedAt: sql`coalesce(${schema.opnameWarehouses.startedAt}, now())` }).where(and(eq(schema.opnameWarehouses.opnameId, opnameId), eq(schema.opnameWarehouses.warehouseId, warehouseId), eq(schema.opnameWarehouses.status, "PENDING")));
        const [locTotal] = await db.select({ total: sql<number>`count(*)` }).from(schema.locations).where(eq(schema.locations.warehouseId, warehouseId));
        const [countedRow] = await db.select({ counted: sql<number>`count(distinct ${schema.opnameScanDetails.locationId})` }).from(schema.opnameScanDetails).where(and(eq(schema.opnameScanDetails.opnameId, opnameId), eq(schema.opnameScanDetails.warehouseId, warehouseId), sql`${schema.opnameScanDetails.locationId} IS NOT NULL`));
        if (Number(locTotal.total) > 0 && Number(countedRow.counted) >= Number(locTotal.total)) {
          await db.update(schema.opnameWarehouses).set({ status: "COMPLETED", completedAt: new Date() }).where(and(eq(schema.opnameWarehouses.opnameId, opnameId), eq(schema.opnameWarehouses.warehouseId, warehouseId)));
        }
      }
    }
    res.status(201).json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "BATCH_MISMATCH") { res.status(409).json({ error: (e as Error).message }); return; }
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
    let values = coerceDates(req.body);
    values = await resolveIncomingIds(values);
    if (tableName === "userSettings") delete (values as any).userId;
    const paramId = paramString(req, "id");
    const publicIdCol = publicIdColumn(table);
    const idCol = idColumn(table);
    let whereCond: any = undefined;
    if (publicIdCol && isUuid(paramId)) whereCond = eq(publicIdCol, paramId);
    else if (/^\d+$/.test(paramId)) whereCond = eq(idCol, Number(paramId) as any);
    else if (publicIdCol) whereCond = eq(publicIdCol, paramId);
    else whereCond = eq(idCol, paramId as any);
    // Fetch old row for diff (before update) — used for activity log
    let oldRow: Record<string, unknown> | null = null;
    try {
      const [r] = await db.select().from(table).where(whereCond).limit(1);
      if (r) oldRow = r as unknown as Record<string, unknown>;
    } catch {}
    if (tableName === "items" && typeof values.code === "string") {
      values.code = values.code.trim();
      const whereDup = isUuid(paramId) ? sql`${schema.items.publicId} != ${paramId}` : sql`${schema.items.id} != ${Number(paramId)}`;
      const [dup] = await db.select({ id: schema.items.id }).from(schema.items).where(sql`lower(${schema.items.code}) = lower(${values.code}) AND ${whereDup}`).limit(1);
      if (dup) return res.status(409).json({ error: "Kode item sudah digunakan." });
    }
    if (tableName === "taxCategories") {
      if (typeof values.code === "string") values.code = String(values.code).trim().toUpperCase();
      if (typeof values.name === "string") values.name = String(values.name).trim();
      if (values.percentage != null) {
        const pct = Number(values.percentage);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) return res.status(400).json({ error: "percentage harus angka 0-100." });
        values.percentage = String(pct);
      }
      if (values.code) {
        const whereDup = isUuid(paramId) ? sql`${(schema as any).taxCategories.publicId} != ${paramId}` : sql`${(schema as any).taxCategories.id} != ${Number(paramId)}`;
        const [dup] = await db.select({ id: (schema as any).taxCategories.id }).from((schema as any).taxCategories).where(sql`lower(${(schema as any).taxCategories.code}) = lower(${String(values.code)}) AND ${whereDup}`).limit(1);
        if (dup) return res.status(409).json({ error: "Kode kategori pajak sudah digunakan." });
      }
      values.updatedAt = new Date();
    }
    if (tableName === "priceLists") {
      if (typeof values.code === "string") values.code = String(values.code).trim().toUpperCase();
      if (typeof values.name === "string") values.name = String(values.name).trim();
      if (values.type != null) {
        values.type = String(values.type).trim().toUpperCase();
        if (!["PURCHASE", "SALES"].includes(String(values.type))) {
          return res.status(400).json({ error: "type harus PURCHASE atau SALES." });
        }
        if (String(values.type) === "PURCHASE") {
          values.customerId = null;
        } else {
          if (values.customerId === undefined) {
            const whereExisting = isUuid(paramId) ? eq((schema as any).priceLists.publicId, paramId) : eq((schema as any).priceLists.id, Number(paramId) as any);
            const [existing] = await db.select({ customerId: (schema as any).priceLists.customerId }).from((schema as any).priceLists).where(whereExisting).limit(1);
            if (!existing?.customerId && !values.customerId) return res.status(400).json({ error: "Customer wajib untuk type SALES." });
          } else if (!values.customerId) {
            return res.status(400).json({ error: "Customer wajib untuk type SALES." });
          }
          values.supplierId = null;
        }
      } else {
        if (values.supplierId && values.customerId) {
          return res.status(400).json({ error: "Price list tidak boleh punya supplier dan customer bersamaan." });
        }
        if (values.supplierId) values.customerId = null;
        if (values.customerId) values.supplierId = null;
      }
      if (values.code) {
        const whereDup = isUuid(paramId) ? sql`${(schema as any).priceLists.publicId} != ${paramId}` : sql`${(schema as any).priceLists.id} != ${Number(paramId)}`;
        const [dup] = await db.select({ id: (schema as any).priceLists.id }).from((schema as any).priceLists).where(sql`lower(${(schema as any).priceLists.code}) = lower(${String(values.code)}) AND ${whereDup}`).limit(1);
        if (dup) return res.status(409).json({ error: "Kode price list sudah digunakan." });
      }
      values.updatedAt = new Date();
    }
    if (tableName === "priceListLines") {
      if (values.unitPrice != null) {
        const price = Number(values.unitPrice);
        if (!isFinite(price) || price < 0) return res.status(400).json({ error: "unitPrice harus angka >=0." });
        values.unitPrice = String(price);
      }
      if (values.type != null) {
        values.type = String(values.type).trim().toUpperCase();
        if (!["PURCHASE", "SALES"].includes(String(values.type))) {
          return res.status(400).json({ error: "type harus PURCHASE atau SALES." });
        }
        if (String(values.type) === "PURCHASE") {
          values.customerId = null;
        } else {
          if (values.customerId === undefined) {
            const whereExisting = isUuid(paramId) ? eq((schema as any).priceListLines.publicId, paramId) : eq((schema as any).priceListLines.id, Number(paramId) as any);
            const [existing] = await db.select({ customerId: (schema as any).priceListLines.customerId }).from((schema as any).priceListLines).where(whereExisting).limit(1);
            if (!existing?.customerId && !values.customerId) return res.status(400).json({ error: "Customer wajib untuk type SALES." });
          } else if (!values.customerId) {
            return res.status(400).json({ error: "Customer wajib untuk type SALES." });
          }
          values.supplierId = null;
        }
      } else {
        if (values.supplierId && values.customerId) {
          return res.status(400).json({ error: "Baris price list tidak boleh punya supplier dan customer bersamaan." });
        }
        if (values.supplierId) values.customerId = null;
        if (values.customerId) values.supplierId = null;
      }
      if (!values.uomId && values.itemId) {
        const [it] = await db.select({ uomId: schema.items.uomId }).from(schema.items).where(eq(schema.items.id, values.itemId as any)).limit(1);
        if (it?.uomId) values.uomId = it.uomId;
      }
      if (!values.currency && values.priceListId) {
        const [pl] = await db.select({ currency: (schema as any).priceLists.currency }).from((schema as any).priceLists).where(eq((schema as any).priceLists.id, values.priceListId as any)).limit(1);
        if ((pl as any)?.currency) values.currency = (pl as any).currency;
      }
      if (values.priceListId && values.itemId) {
        const whereDup = isUuid(paramId) ? sql`${(schema as any).priceListLines.publicId} != ${paramId}` : sql`${(schema as any).priceListLines.id} != ${Number(paramId)}`;
        const conds: any[] = [eq((schema as any).priceListLines.priceListId, values.priceListId as any), eq((schema as any).priceListLines.itemId, values.itemId as any)];
        if (values.supplierId) conds.push(eq((schema as any).priceListLines.supplierId, values.supplierId as any));
        if (values.customerId) conds.push(eq((schema as any).priceListLines.customerId, values.customerId as any));
        const [dup] = await db.select({ id: (schema as any).priceListLines.id }).from((schema as any).priceListLines).where(sql`${sql.join(conds, sql` AND `)} AND ${whereDup}`).limit(1);
        if (dup) return res.status(409).json({ error: "Item dengan supplier/customer tersebut sudah ada di price list ini." });
      }
      values.updatedAt = new Date();
    }
    if (tableName === "warehouses" && values.parentId !== undefined) {
      // resolve current warehouse id
      let curId: number | null = null;
      if (publicIdCol && isUuid(paramId)) {
        const [cur] = await db.select({ id: schema.warehouses.id, branchId: schema.warehouses.branchId }).from(schema.warehouses).where(eq(schema.warehouses.publicId, paramId)).limit(1);
        curId = cur?.id ?? null;
        if (values.branchId == null && cur) (values as any)._branchIdForCheck = cur.branchId;
      } else if (/^\d+$/.test(paramId)) curId = Number(paramId);
      if (values.parentId != null) {
        const parentIdNum = Number(values.parentId);
        if (curId != null && parentIdNum === curId) return res.status(400).json({ error: "Gudang tidak bisa menjadi induk dirinya sendiri." });
        const [parent] = await db.select({ branchId: schema.warehouses.branchId, parentId: schema.warehouses.parentId }).from(schema.warehouses).where(eq(schema.warehouses.id, parentIdNum as any)).limit(1);
        if (!parent) return res.status(400).json({ error: "Induk warehouse tidak ditemukan." });
        // cegah cycle sederhana: induk tidak boleh punya parent yang sama dengan cur (A<-B, B<-A)
        if (parent.parentId != null && curId != null && Number(parent.parentId) === curId) return res.status(400).json({ error: "Cycle terdeteksi: induk sudah merupakan anak dari gudang ini." });
        const branchToCheck = values.branchId != null ? Number(values.branchId) : ((values as any)._branchIdForCheck != null ? Number((values as any)._branchIdForCheck) : null);
        if (branchToCheck != null && Number(parent.branchId) !== branchToCheck) return res.status(400).json({ error: "Branch sub-gudang harus sama dengan gudang induk." });
        delete (values as any)._branchIdForCheck;
      }
    }
    const [row] = await db.update(table).set(values).where(whereCond).returning();
    if (!row) { res.status(404).json({ error: "Data tidak ditemukan." }); return; }
    // Activity log: update with from->to diff
    try {
      const docType = CRUD_DOC_TYPE[tableName] ?? tableName.toUpperCase();
      const docId = (row as any).id != null ? Number((row as any).id) : oldRow ? Number((oldRow as any).id) : null;
      if (docId != null && Number.isFinite(docId) && oldRow) {
        const changes = computeDiff(oldRow as any, values as any, { denylist: DIFF_DENYLIST });
        const hasChanges = Object.keys(changes).length > 0;
        if (hasChanges || Object.keys(values).length > 0) {
          const { internalId, role } = await getActorInfo(req);
          await logActivity({
            documentType: docType,
            documentId: docId,
            action: "update",
            fromStatus: null,
            toStatus: null,
            actorUserId: internalId,
            actorRole: role,
            metadata: hasChanges ? { changes, patchKeys: Object.keys(values) } : { patchKeys: Object.keys(values) },
          });
        }
      } else if (docId != null && Number.isFinite(docId) ) {
        const { internalId, role } = await getActorInfo(req);
        await logActivity({ documentType: docType, documentId: docId, action: "update", fromStatus: null, toStatus: null, actorUserId: internalId, actorRole: role, metadata: { patchKeys: Object.keys(values) } });
      }
    } catch {}
    res.json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) { res.status(500).json({ error: messageOf(e) }); }
});
// DELETE /:table/:id
crudRouter.delete("/:table/:id", async (req, res) => {
  const tableName = paramString(req, "table");
  const table = resolveTable(req, res);
  if (!table) return;
  if (!(await checkTablePermission(req, res, tableName, "delete"))) return;
  try {
    if (!(await enforceSettingsOwner(req, res))) return;
    const paramId = paramString(req, "id");
    const publicIdCol = publicIdColumn(table);
    const idCol = idColumn(table);
    // guards
    if (tableName === "movementTypes") {
      let whereCond: any = undefined;
      if (publicIdCol && isUuid(paramId)) whereCond = eq(publicIdCol, paramId);
      else whereCond = eq(idCol, Number(paramId) as any);
      const [mt] = await db.select({ builtin: schema.movementTypes.builtin }).from(schema.movementTypes).where(whereCond).limit(1);
      if (mt?.builtin) { res.status(409).json({ error: "Tipe transaksi bawaan (Receipt/Issue/Transfer) tidak dapat dihapus." }); return; }
    }
    if (tableName === "batchFormats") {
      let whereCond: any = undefined;
      if (publicIdCol && isUuid(paramId)) whereCond = eq(publicIdCol, paramId);
      else whereCond = eq(idCol, Number(paramId) as any);
      const [bf] = await db.select({ id: schema.batchFormats.id }).from(schema.batchFormats).where(whereCond).limit(1);
      const rowId = bf?.id;
      if (rowId) {
        const refs = await db.select({ id: schema.barcodeFormats.id, name: schema.barcodeFormats.name, segments: schema.barcodeFormats.segments }).from(schema.barcodeFormats);
        const usedBy = refs.find((f) => ((f.segments ?? []) as { batchFormatId?: string }[]).some((s) => String(s.batchFormatId) === String(rowId) || String(s.batchFormatId) === String(paramId)));
        if (usedBy) { res.status(409).json({ error: `Format batch ini masih dipakai oleh format barcode "${usedBy.name}" — ubah atau hapus segmen BATCH-nya terlebih dahulu.` }); return; }
      }
    }
    if (tableName === "taxCategories") {
      let whereCond: any = undefined;
      if (publicIdCol && isUuid(paramId)) whereCond = eq(publicIdCol, paramId);
      else whereCond = eq(idCol, Number(paramId) as any);
      const [cat] = await db.select({ id: (schema as any).taxCategories.id }).from((schema as any).taxCategories).where(whereCond).limit(1);
      const rowId = cat?.id;
      if (rowId) {
        const [used] = await db.select({ id: (schema as any).purchaseOrders.id }).from((schema as any).purchaseOrders).where(eq((schema as any).purchaseOrders.taxCategoryId, rowId)).limit(1);
        if (used) { res.status(409).json({ error: "Kategori pajak ini masih dipakai oleh Purchase Order — hapus relasi PO terlebih dahulu." }); return; }
      }
    }
    if (tableName === "priceLists") {
      let whereCond: any = undefined;
      if (publicIdCol && isUuid(paramId)) whereCond = eq(publicIdCol, paramId);
      else whereCond = eq(idCol, Number(paramId) as any);
      const [pl] = await db.select({ id: (schema as any).priceLists.id }).from((schema as any).priceLists).where(whereCond).limit(1);
      const rowId = pl?.id;
      if (rowId) {
        const [used] = await db.select({ id: (schema as any).priceListLines.id }).from((schema as any).priceListLines).where(eq((schema as any).priceListLines.priceListId, rowId)).limit(1);
        if (used) { res.status(409).json({ error: "Price list ini masih dipakai oleh baris harga — hapus baris terlebih dahulu." }); return; }
      }
    }
    let whereCond: any = undefined;
    if (publicIdCol && isUuid(paramId)) whereCond = eq(publicIdCol, paramId);
    else if (/^\d+$/.test(paramId)) whereCond = eq(idCol, Number(paramId) as any);
    else if (publicIdCol) whereCond = eq(publicIdCol, paramId);
    else whereCond = eq(idCol, paramId as any);
    const [row] = await db.delete(table).where(whereCond).returning();
    if (!row) { res.status(404).json({ error: "Data tidak ditemukan." }); return; }
    try {
      const docType = CRUD_DOC_TYPE[tableName] ?? tableName.toUpperCase();
      const docId = (row as any).id != null ? Number((row as any).id) : null;
      if (docId != null && Number.isFinite(docId)) {
        const { internalId, role } = await getActorInfo(req);
        const meta: Record<string, unknown> = {};
        if ((row as any).code) meta.code = (row as any).code;
        if ((row as any).name) meta.name = (row as any).name;
        if ((row as any).documentNo) meta.documentNo = (row as any).documentNo;
        await logActivity({ documentType: docType, documentId: docId, action: "delete", fromStatus: null, toStatus: null, actorUserId: internalId, actorRole: role, metadata: meta });
      }
    } catch {}
    res.json(sanitizeRow(table, row as Record<string, unknown>));
  } catch (e) {
    if (isForeignKeyViolation(e)) { res.status(409).json({ error: DELETE_BLOCK_MESSAGES[tableName] ?? "Data masih dipakai oleh data lain — tidak dapat dihapus." }); return; }
    res.status(500).json({ error: messageOf(e) });
  }
});
