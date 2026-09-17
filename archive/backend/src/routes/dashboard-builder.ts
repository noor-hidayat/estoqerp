// @ts-nocheck
import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, or, sql, sum, count, avg, min, max } from "drizzle-orm";
import { db, pool } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission, hasWorkspaceAccess } from "../middleware/rbac";
import { TEMPLATE_BY_ID, templatesForWorkspace, WIDGET_TEMPLATES } from "../lib/dashboard-templates";

export const dashboardBuilderRouter = Router();

// ---------------------------------------------------------------------------
// new-schema helpers: frontend bicara publicId (uuid), DB pakai bigint internal.
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuidVal = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
const isIntVal = (v: unknown) => typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v));

async function resolveDashboardInternalId(val: unknown): Promise<number | null> {
  if (val === null || val === undefined || val === "") return null;
  if (isIntVal(val)) return Number(val);
  if (isUuidVal(val)) {
    const [r] = await db.select({ id: s.dashboards.id }).from(s.dashboards).where(eq(s.dashboards.publicId, val)).limit(1);
    return r?.id ?? null;
  }
  return null;
}

async function resolveWidgetInternalId(val: unknown): Promise<number | null> {
  if (val === null || val === undefined || val === "") return null;
  if (isIntVal(val)) return Number(val);
  if (isUuidVal(val)) {
    const [r] = await db.select({ id: s.dashboardWidgets.id }).from(s.dashboardWidgets).where(eq(s.dashboardWidgets.publicId, val)).limit(1);
    return r?.id ?? null;
  }
  return null;
}

async function resolveWorkspace(val: unknown): Promise<{ id: number; code: string; publicId: string } | null> {
  if (val === null || val === undefined || val === "") return null;
  if (isIntVal(val)) {
    const [r] = await db.select({ id: s.workspaces.id, code: s.workspaces.code, publicId: s.workspaces.publicId }).from(s.workspaces).where(eq(s.workspaces.id, Number(val))).limit(1);
    return r ?? null;
  }
  if (isUuidVal(val)) {
    const [r] = await db.select({ id: s.workspaces.id, code: s.workspaces.code, publicId: s.workspaces.publicId }).from(s.workspaces).where(eq(s.workspaces.publicId, val)).limit(1);
    return r ?? null;
  }
  const [r] = await db.select({ id: s.workspaces.id, code: s.workspaces.code, publicId: s.workspaces.publicId }).from(s.workspaces).where(eq(s.workspaces.code, String(val))).limit(1);
  return r ?? null;
}

async function resolveBranchInternalId(val: unknown): Promise<number | null> {
  if (val === null || val === undefined || val === "") return null;
  if (isIntVal(val)) return Number(val);
  if (isUuidVal(val)) {
    const [r] = await db.select({ id: s.branches.id }).from(s.branches).where(eq(s.branches.publicId, val)).limit(1);
    return r?.id ?? null;
  }
  return null;
}

async function resolveUserInternalId(val: unknown): Promise<number | null> {
  if (val === null || val === undefined || val === "") return null;
  if (isIntVal(val)) return Number(val);
  if (isUuidVal(val)) {
    const [r] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.publicId, val)).limit(1);
    return r?.id ?? null;
  }
  return null;
}

/** workspace publicIds by internal id (untuk response API). */
async function workspacePublicIdMap(ids: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (ids.length === 0) return map;
  const rows = await db.select({ id: s.workspaces.id, publicId: s.workspaces.publicId }).from(s.workspaces).where(inArray(s.workspaces.id, ids));
  for (const r of rows) map.set(r.id, r.publicId);
  return map;
}

function toPublicDashboard(row: typeof s.dashboards.$inferSelect, wsPublicId: string | null) {
  return {
    id: row.publicId,
    name: row.name,
    ownerId: null as string | null,
    branchId: null as string | null,
    workspaceId: wsPublicId,
    isGlobal: row.isGlobal,
    createdAt: row.createdAt,
  };
}

function toPublicWidget(w: typeof s.dashboardWidgets.$inferSelect) {
  return { ...w, id: w.publicId };
}

// ---------------------------------------------------------------------------
// WHITELIST fact table — tidak ada SQL bebas. Hanya kombinasi
// (factTable, measure, dim, filter) di bawah yang diproses.
// ---------------------------------------------------------------------------

const ALLOWED_AGGS = ["sum", "count", "countDistinct", "avg", "min", "max"] as const;
type Agg = (typeof ALLOWED_AGGS)[number];

interface FactDef {
  label: string;
  table: any;
  warehouseCol: any;
  itemCol: any;
  locationCol: any | null;
  batchCol: any | null;
  dateColumn: any | null;
  dateJoin: { key: string; table: any; on: any } | null;
  measures: string[];
  dims: string[];
}

const FACT_TABLES: Record<string, FactDef> = {
  stock_balances: {
    label: "Stock Balances",
    table: s.stockBalances,
    warehouseCol: s.stockBalances.warehouseId,
    itemCol: s.stockBalances.itemId,
    locationCol: null,
    batchCol: null,
    dateColumn: s.stockBalances.balanceDate,
    dateJoin: null,
    measures: ["openingQty", "inQty", "outQty", "closingQty", "stockValue", "warehouseId", "itemId"],
    dims: ["warehouse", "warehouseId", "itemGroup", "itemId"],
  },
  stock_batches: {
    label: "Stock Batches",
    table: s.stockBatches,
    warehouseCol: s.stockBatches.warehouseId,
    itemCol: null,
    locationCol: null,
    batchCol: s.stockBatches.batchId,
    dateColumn: null,
    dateJoin: null,
    measures: ["qty"],
    dims: ["warehouse", "warehouseId", "batch", "batchId", "itemGroup", "itemId"],
  },
  stock_ledger: {
    label: "Stock Ledger",
    table: s.stockLedger,
    warehouseCol: s.stockLedger.warehouseId,
    itemCol: s.stockLedger.itemId,
    locationCol: s.stockLedger.locationId,
    batchCol: s.stockLedger.batchId,
    dateColumn: s.stockLedger.transactionDate,
    dateJoin: null,
    measures: ["qtyIn", "qtyOut", "qtyBalance"],
    dims: [
      "warehouse",
      "warehouseId",
      "itemGroup",
      "itemId",
      "location",
      "locationId",
      "branch",
    ],
  },
  stock_movement_details: {
    label: "Stock Movement Details",
    table: s.stockMovementDetails,
    warehouseCol: s.stockMovementDetails.toWarehouseId,
    itemCol: s.stockMovementDetails.itemId,
    locationCol: null,
    batchCol: s.stockMovementDetails.batchId,
    dateColumn: s.stockMovements.movementDate,
    dateJoin: {
      key: "mv",
      table: s.stockMovements,
      on: eq(s.stockMovementDetails.movementId, s.stockMovements.id),
    },
    measures: ["qty"],
    dims: ["warehouse", "warehouseId", "itemGroup", "itemId"],
  },
  opname_scan_details: {
    label: "Opname Scan Details",
    table: s.opnameScanDetails,
    warehouseCol: s.opnameScanDetails.warehouseId,
    itemCol: s.opnameScanDetails.itemId,
    locationCol: s.opnameScanDetails.locationId,
    batchCol: s.opnameScanDetails.batchId,
    dateColumn: s.opnameScanDetails.scannedAt,
    dateJoin: null,
    measures: ["quantity"],
    dims: [
      "warehouse",
      "warehouseId",
      "itemGroup",
      "itemId",
      "location",
      "locationId",
      "branch",
    ],
  },
  purchase_order_lines: {
    label: "Purchase Order Lines",
    table: s.purchaseOrderLines,
    warehouseCol: s.purchaseOrders.warehouseId,
    itemCol: s.purchaseOrderLines.itemId,
    locationCol: null,
    batchCol: null,
    dateColumn: s.purchaseOrders.orderDate,
    dateJoin: {
      key: "po",
      table: s.purchaseOrders,
      on: eq(s.purchaseOrderLines.purchaseOrderId, s.purchaseOrders.id),
    },
    measures: ["qty", "lineValue"],
    dims: ["warehouse", "warehouseId", "itemGroup", "itemId"],
  },
  delivery_lines: {
    label: "Delivery Lines",
    table: s.deliveryLines,
    warehouseCol: s.deliveries.warehouseId,
    itemCol: s.deliveryLines.itemId,
    locationCol: null,
    batchCol: null,
    dateColumn: s.deliveries.deliveryDate,
    dateJoin: {
      key: "dlv",
      table: s.deliveries,
      on: eq(s.deliveryLines.deliveryId, s.deliveries.id),
    },
    measures: ["qty", "lineValue"],
    dims: ["warehouse", "warehouseId", "itemGroup", "itemId"],
  },
  goods_receipt_lines: {
    label: "Goods Receipt Lines",
    table: s.goodsReceiptLines,
    warehouseCol: s.goodsReceipts.warehouseId,
    itemCol: s.goodsReceiptLines.itemId,
    locationCol: null,
    batchCol: null,
    dateColumn: s.goodsReceipts.receiptDate,
    dateJoin: {
      key: "gr",
      table: s.goodsReceipts,
      on: eq(s.goodsReceiptLines.goodsReceiptId, s.goodsReceipts.id),
    },
    measures: ["qty", "lineValue"],
    dims: ["warehouse", "warehouseId", "itemGroup", "itemId"],
  },
};

const ALLOWED_FILTERS = [
  "dateRange",
  "warehouseId",
  "branchId",
  "itemGroupId",
  "itemId",
  "locationId",
  "batchId",
  "isActive",
  "closingQtyGt",
  "closingQtyGte",
  "closingQtyLt",
  "closingQtyLte",
  "closingQtyEq",
  "movementTypeCode",
  "isFinishGood",
] as const;

const PERIOD_KEYS = ["day", "week", "month", "quarter", "year"] as const;

class InvalidConfig extends Error {}

function aggSql(agg: string, col: any) {
  switch (agg) {
    case "sum":
      return sql`sum(${col})`;
    case "count":
      return sql`count(${col})`;
    case "countDistinct":
      return sql`count(distinct ${col})`;
    case "avg":
      return sql`avg(${col})`;
    case "min":
      return sql`min(${col})`;
    case "max":
      return sql`max(${col})`;
    default:
      throw new InvalidConfig("aggregation tidak valid");
  }
}

// Resolve satu group-by key menjadi ekspresi SQL + join yang diperlukan.
function resolveDim(
  fact: FactDef,
  dimKey: string,
  addJoin: (key: string, table: any, on: any) => void
): { alias: string; selectExpr: any; groupExpr: any } {
  const wh = s.warehouses;
  const br = s.branches;
  const it = s.items;
  const ig = s.itemGroups;
  const loc = s.locations;
  const bat = s.batches;

  switch (dimKey) {
    case "warehouse":
      addJoin("wh", wh, eq(fact.warehouseCol, wh.id));
      return { alias: "warehouse", selectExpr: wh.name, groupExpr: wh.name };
    case "warehouseId":
      return {
        alias: "warehouseId",
        selectExpr: fact.warehouseCol,
        groupExpr: fact.warehouseCol,
      };
    case "branch":
      addJoin("wh", wh, eq(fact.warehouseCol, wh.id));
      addJoin("br", br, eq(wh.branchId, br.id));
      return { alias: "branch", selectExpr: br.name, groupExpr: br.name };
    case "itemId":
      if (fact.itemCol) {
        return {
          alias: "itemId",
          selectExpr: fact.itemCol,
          groupExpr: fact.itemCol,
        };
      }
      addJoin("bat", bat, eq(s.stockBatches.batchId, bat.id));
      addJoin("it", it, eq(bat.itemId, it.id));
      return { alias: "itemId", selectExpr: it.id, groupExpr: it.id };
    case "itemGroup":
      if (fact.itemCol) addJoin("it", it, eq(fact.itemCol, it.id));
      else {
        addJoin("bat", bat, eq(s.stockBatches.batchId, bat.id));
        addJoin("it", it, eq(bat.itemId, it.id));
      }
      addJoin("ig", ig, eq(it.itemGroupId, ig.id));
      return { alias: "itemGroup", selectExpr: ig.name, groupExpr: ig.name };
    case "location":
      if (!fact.locationCol) throw new InvalidConfig("dimensi location tidak tersedia");
      addJoin("loc", loc, eq(fact.locationCol, loc.id));
      return { alias: "location", selectExpr: loc.name, groupExpr: loc.name };
    case "locationId":
      if (!fact.locationCol) throw new InvalidConfig("dimensi location tidak tersedia");
      return {
        alias: "locationId",
        selectExpr: fact.locationCol,
        groupExpr: fact.locationCol,
      };
    case "batch":
      if (!fact.batchCol) throw new InvalidConfig("dimensi batch tidak tersedia");
      addJoin("bat", bat, eq(fact.batchCol, bat.id));
      return { alias: "batch", selectExpr: bat.batchNumber, groupExpr: bat.batchNumber };
    case "batchId":
      if (!fact.batchCol) throw new InvalidConfig("dimensi batch tidak tersedia");
      return {
        alias: "batchId",
        selectExpr: fact.batchCol,
        groupExpr: fact.batchCol,
      };
    default:
      throw new InvalidConfig(`dimensi tidak valid: ${dimKey}`);
  }
}

function resolvePeriod(fact: FactDef, gran: string) {
  if (!fact.dateColumn) throw new InvalidConfig("fact table ini tidak punya dimensi tanggal");
  let granSql = gran;
  let fmt = "YYYY-MM-DD";
  if (gran === "day") { granSql = "day"; fmt = "YYYY-MM-DD"; }
  else if (gran === "week") { granSql = "week"; fmt = "IYYY-WW"; }
  else if (gran === "month") { granSql = "month"; fmt = "YYYY-MM"; }
  else if (gran === "quarter") { granSql = "quarter"; fmt = "YYYY-\"Q\"Q"; }
  else if (gran === "year") { granSql = "year"; fmt = "YYYY"; }
  else throw new InvalidConfig(`granularitas tidak valid: ${gran}`);
  const granLit = sql.raw(`'${granSql}'`);
  const fmtLit = sql.raw(`'${fmt}'`);
  const selectExpr = sql`to_char(date_trunc(${granLit}::text, ${fact.dateColumn}), ${fmtLit})`;
  return { alias: "date", selectExpr, groupExpr: selectExpr };
}

function previousDateRange(dateRange: [string, string]): { range: [string, string]; label: string } | null {
  if (!Array.isArray(dateRange) || dateRange.length !== 2) return null;
  const [s, e] = dateRange as [string, string];
  const start = new Date(s);
  const end = new Date(e);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const prevEnd = new Date(start.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  let label = "vs previous period";
  if (days >= 28 && days <= 31) label = "vs last month";
  else if (days === 7) label = "vs last week";
  else if (days === 1) label = "vs yesterday";
  else if (days > 1 && days < 7) label = `vs previous ${days}d`;
  return { range: [fmt(prevStart), fmt(prevEnd)], label };
}

async function runQuery(config: any, req: Request): Promise<{ rows: any[] }> {
  const factKey: string = config?.factTable;
  const fact = FACT_TABLES[factKey];
  if (!fact) throw new InvalidConfig("factTable tidak valid");

  const measures: any[] = config?.measures;
  if (!Array.isArray(measures) || measures.length === 0)
    throw new InvalidConfig("minimal satu measure wajib");
  for (const m of measures) {
    if (!m || typeof m.field !== "string" || !fact.measures.includes(m.field))
      throw new InvalidConfig("measure tidak valid");
    if (!ALLOWED_AGGS.includes(m.aggregation))
      throw new InvalidConfig("aggregation tidak valid");
  }

  const groupBy: string[] = config?.groupBy ?? [];
  if (!Array.isArray(groupBy)) throw new InvalidConfig("groupBy harus array");

  const joinKeys = new Set<string>();
  const joinClauses: [string, any, any][] = [];
  const addJoin = (key: string, table: any, on: any) => {
    if (!joinKeys.has(key)) {
      joinKeys.add(key);
      joinClauses.push([key, table, on]);
    }
  };

  // Untuk purchase_order_lines / delivery_lines / goods_receipt_lines yang warehouseCol berasal dari join table, pastikan join sudah ada sebelum scoping
  if (factKey === "purchase_order_lines" && fact.dateJoin) addJoin(fact.dateJoin.key, fact.dateJoin.table, fact.dateJoin.on);
  if (factKey === "delivery_lines" && fact.dateJoin) addJoin(fact.dateJoin.key, fact.dateJoin.table, fact.dateJoin.on);
  if (factKey === "goods_receipt_lines" && fact.dateJoin) addJoin(fact.dateJoin.key, fact.dateJoin.table, fact.dateJoin.on);

  const selectObj: Record<string, any> = {};
  const groupExprs: any[] = [];

  for (const m of measures) {
    let col: any;
    // stockValue = closingQty * valuationRate (join items)
    if (factKey === "stock_balances" && m.field === "stockValue") {
      addJoin("it_stockValue", s.items, eq(fact.itemCol, s.items.id));
      col = sql`(${s.stockBalances.closingQty}::numeric * COALESCE(${s.items.valuationRate}::numeric, 0))`;
    } else if ((factKey === "purchase_order_lines" || factKey === "delivery_lines" || factKey === "goods_receipt_lines") && m.field === "lineValue") {
      // value = qty * unitPrice
      const qtyCol = (fact.table as any).qty;
      const priceCol = (fact.table as any).unitPrice;
      col = sql`(${qtyCol}::numeric * COALESCE(${priceCol}::numeric, 0))`;
    } else {
      col = (fact.table as any)[m.field];
    }
    if (!col) throw new InvalidConfig(`measure tidak valid: ${m.field}`);
    const alias = m.alias || `${m.field}_${m.aggregation}`;
    selectObj[alias] = aggSql(m.aggregation, col);
  }

  for (const g of groupBy) {
    if ((PERIOD_KEYS as readonly string[]).includes(g)) {
      if (fact.dateJoin) addJoin(fact.dateJoin.key, fact.dateJoin.table, fact.dateJoin.on);
      const p = resolvePeriod(fact, g);
      selectObj[p.alias] = p.selectExpr;
      groupExprs.push(p.groupExpr);
    } else {
      if (!fact.dims.includes(g)) throw new InvalidConfig(`dimensi tidak valid: ${g}`);
      const d = resolveDim(fact, g, addJoin);
      selectObj[d.alias] = d.selectExpr;
      groupExprs.push(d.groupExpr);
    }
  }

  let q: any = db.select(selectObj).from(fact.table);
  for (const [, table, on] of joinClauses) q = q.leftJoin(table, on);

  // Scoping otomatis dari branch access user (tidak mengandalkan frontend).
  const isAdmin = !req.user || req.user.role === "role_sys_admin" || req.user.role === "SYS_ADMIN";
  const whIds: string[] = (req as any).accessibleWarehouseIds ?? [];
  const conditions: any[] = [];
  if (!isAdmin && whIds.length) conditions.push(inArray(fact.warehouseCol, whIds));

  applyFilters(config?.filters ?? {}, fact, conditions, addJoin);

  // Untuk stock_balances KPI tanpa dateRange (snapshot), hanya hitung balance terbaru per warehouse+item
  // agar historis harian tidak double-count. Stock Level Trend punya groupBy period + dateRange jadi tidak kena.
  const _filtersForLatest = config?.filters ?? {};
  if (factKey === "stock_balances" && groupBy.length === 0 && !Array.isArray((_filtersForLatest as any).dateRange)) {
    // filter ke MAX(balance_date) per (warehouse_id, item_id) — closing stock terkini per lokasi
    conditions.push(sql`(warehouse_id, item_id, balance_date) IN (SELECT warehouse_id, item_id, MAX(balance_date) FROM stock_balances GROUP BY warehouse_id, item_id)`);
  }

  if (conditions.length) q = q.where(and(...conditions));
  if (groupExprs.length) q = q.groupBy(...groupExprs);

  // Sorting & limit: dukung template yang minta top-N diurut besar->kecil (misal Stock per Warehouse top 10)
  const explicitLimit: number | undefined =
    typeof config?.limit === "number" && Number.isFinite(config.limit) ? Math.min(Math.max(Math.trunc(config.limit), 1), 200) : undefined;
  const explicitOrderBy: string | undefined = typeof config?.orderBy === "string" ? config.orderBy.trim() : undefined;
  const explicitDir: "asc" | "desc" = config?.orderDirection === "asc" ? "asc" : "desc";
  if (explicitOrderBy && selectObj[explicitOrderBy] !== undefined) {
    const col = selectObj[explicitOrderBy];
    q = explicitDir === "desc" ? q.orderBy(sql`${col} DESC`) : q.orderBy(sql`${col} ASC`);
  } else if (explicitLimit !== undefined && groupExprs.length) {
    // fallback: kalau ada limit tanpa orderBy, urutkan berdasarkan measure pertama DESC (paling relevan untuk Top N)
    const firstMeasureAlias = (measures as any[]).map((m: any) => m.alias || `${m.field}_${m.aggregation}`)[0];
    if (firstMeasureAlias && selectObj[firstMeasureAlias] !== undefined) {
      const col = selectObj[firstMeasureAlias];
      q = q.orderBy(sql`${col} DESC`);
    } else {
      q = q.orderBy(groupExprs[0]);
    }
  } else if (groupExprs.length) {
    q = q.orderBy(groupExprs[0]);
  }
  q = q.limit(explicitLimit ?? 200);

  const rows = await q;
  return { rows: rows as any[] };
}

async function buildWidgetQuery(
  config: any,
  req: Request
): Promise<{ rows: any[]; previousValue?: number | null; percentChange?: number | null; periodLabel?: string | null }> {
  // Special combined fact: receiving_vs_delivery / purchase_vs_delivery -> merge 2 queries by period
  if (config?.factTable === "receiving_vs_delivery" || config?.factTable === "purchase_vs_delivery") {
    const gran = Array.isArray(config?.groupBy) && config.groupBy.length > 0 ? String(config.groupBy[0]) : "month";
    const allowedGran = ["day", "week", "month", "quarter", "year"];
    const groupBy = allowedGran.includes(gran) ? [gran] : ["month"];
    const isReceiving = config?.factTable === "receiving_vs_delivery";
    const receivingFact = isReceiving ? "goods_receipt_lines" : "purchase_order_lines";
    const receivingAlias = isReceiving ? "receivingValue" : "purchaseValue";
    const purchaseConfig = {
      factTable: receivingFact,
      measures: [{ field: "lineValue", aggregation: "sum", alias: receivingAlias }],
      groupBy,
      filters: config?.filters ?? {},
    };
    const deliveryConfig = {
      factTable: "delivery_lines",
      measures: [{ field: "lineValue", aggregation: "sum", alias: "deliveryValue" }],
      groupBy,
      filters: config?.filters ?? {},
    };
    const [pRes, dRes] = await Promise.all([runQuery(purchaseConfig as any, req), runQuery(deliveryConfig as any, req)]);
    // Merge by date
    const map = new Map<string, any>();
    for (const r of pRes.rows) {
      const date = (r as any).date ?? "";
      if (!date) continue;
      const val = Number((r as any)[receivingAlias] ?? (r as any).lineValue_sum ?? 0);
      if (isReceiving) map.set(date, { date, receivingValue: val, deliveryValue: 0 });
      else map.set(date, { date, purchaseValue: val, deliveryValue: 0 });
    }
    for (const r of dRes.rows) {
      const date = (r as any).date ?? "";
      if (!date) continue;
      const dVal = Number((r as any).deliveryValue ?? (r as any).lineValue_sum ?? 0);
      const existing = map.get(date) ?? (isReceiving ? { date, receivingValue: 0, deliveryValue: 0 } : { date, purchaseValue: 0, deliveryValue: 0 });
      existing.deliveryValue = dVal;
      map.set(date, existing);
    }
    const merged = Array.from(map.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { rows: merged as any[], previousValue: null, percentChange: null, periodLabel: null };
  }
  // Special Top10 Most Returned Items — single-color bar, sorted DESC, finish good only, all warehouses
  if (
    config?.factTable === "stock_movement_details" &&
    (config as any)?.filters?.movementTypeCode === "RETURN_CUSTOMER" &&
    Array.isArray(config?.groupBy) &&
    (config as any).groupBy[0] === "itemId"
  ) {
    const isAdmin = !req.user || (req as any).user?.role === "role_sys_admin" || (req as any).user?.role === "SYS_ADMIN";
    const whIds: string[] = (req as any).accessibleWarehouseIds ?? [];
    // Build Top10 query manually for proper sorting & item name
    const whereConds: string[] = [];
    const params: any[] = [];
    let pIdx = 1;
    // Movement type filter
    whereConds.push(`mt.code = $${pIdx++}`);
    params.push("RETURN_CUSTOMER");
    // Status POSTED only (if filter says POSTED, respect)
    const statusFilter = (config as any)?.filters?.status ?? "POSTED";
    if (statusFilter) {
      whereConds.push(`sm.status = $${pIdx++}`);
      params.push(statusFilter);
    }
    // isFinishGood
    if ((config as any)?.filters?.isFinishGood) {
      whereConds.push(`it.is_finish_good = true`);
    }
    // Warehouse scope
    if (!isAdmin && whIds.length) {
      const placeholders = whIds.map((_, i) => `$${pIdx + i}`).join(", ");
      whereConds.push(`smd.to_warehouse_id IN (${placeholders})`);
      params.push(...whIds);
      pIdx += whIds.length;
    }
    // Date range if any
    const dr = (config as any)?.filters?.dateRange;
    if (Array.isArray(dr) && dr.length === 2) {
      whereConds.push(`sm.movement_date >= $${pIdx++}::date`);
      params.push(String(dr[0]));
      whereConds.push(`sm.movement_date <= $${pIdx++}::date`);
      params.push(String(dr[1]));
    }
    const whereSql = whereConds.length ? `WHERE ${whereConds.join(" AND ")}` : "";
    // Use item name + code for display, but alias as itemId to match frontend labelKey
    const sqlText = `
      SELECT it.name AS "itemId",
             it.code AS "itemCode",
             SUM(smd.qty::numeric) AS "returnQty"
      FROM stock_movement_details smd
      JOIN stock_movements sm ON sm.id = smd.movement_id
      JOIN movement_types mt ON mt.id = sm.type_id
      JOIN items it ON it.id = smd.item_id
      ${whereSql}
      GROUP BY it.id, it.name, it.code
      ORDER BY "returnQty" DESC
      LIMIT 10
    `;
    const result = (await pool.query(sqlText, params)) as any;
    const rows = result.rows ?? result;
    // Ensure returnQty is number and itemId is name for display
    const mapped = (rows as any[]).map((r: any) => ({
      itemId: r.itemId ?? r.item_id ?? r.name,
      itemCode: r.itemCode ?? r.item_code,
      returnQty: Number(r.returnQty ?? r.return_qty ?? 0),
    }));
    return { rows: mapped as any[], previousValue: null, percentChange: null, periodLabel: null };
  }
  // Special KPI: Persentase Return = Total Return / Total Delivery * 100 (qty)
  // factTable = "return_pct", measure alias = returnPct
  if (config?.factTable === "return_pct") {
    const filters: Record<string, unknown> = (config?.filters ?? {}) as any;
    const isAdmin = !req.user || (req as any).user?.role === "role_sys_admin" || (req as any).user?.role === "SYS_ADMIN";
    const whIds: string[] = (req as any).accessibleWarehouseIds ?? [];
    const measures: any[] = config?.measures ?? [];
    const valueKey = measures?.[0]?.alias || (measures?.[0] ? `${measures[0].field}_${measures[0].aggregation}` : "returnPct");

    async function sumReturn(dateRange?: [string, string] | null): Promise<number> {
      const whereConds: string[] = [];
      const params: any[] = [];
      let idx = 1;
      whereConds.push(`mt.code = $${idx++}`);
      params.push("RETURN_CUSTOMER");
      whereConds.push(`sm.status = $${idx++}`);
      params.push("POSTED");
      if (!isAdmin && whIds.length) {
        const ph = whIds.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`smd.to_warehouse_id IN (${ph})`);
        params.push(...whIds);
        idx += whIds.length;
      }
      if (Array.isArray(filters.warehouseId) && (filters.warehouseId as string[]).length) {
        const ids = filters.warehouseId as string[];
        const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`smd.to_warehouse_id IN (${ph})`);
        params.push(...ids);
        idx += ids.length;
      }
      if (Array.isArray(filters.branchId) && (filters.branchId as string[]).length) {
        const ids = filters.branchId as string[];
        const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`smd.to_warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${ph}))`);
        params.push(...ids);
        idx += ids.length;
      }
      if (Array.isArray(filters.itemId) && (filters.itemId as string[]).length) {
        const ids = filters.itemId as string[];
        const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`smd.item_id IN (${ph})`);
        params.push(...ids);
        idx += ids.length;
      }
      let needItemJoin = false;
      if (Array.isArray(filters.itemGroupId) && (filters.itemGroupId as string[]).length) needItemJoin = true;
      if (filters.isFinishGood !== undefined) needItemJoin = true;
      let joinItem = "";
      if (needItemJoin) {
        joinItem = ` JOIN items it ON it.id = smd.item_id`;
        if (Array.isArray(filters.itemGroupId) && (filters.itemGroupId as string[]).length) {
          const ids = filters.itemGroupId as string[];
          const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
          whereConds.push(`it.item_group_id IN (${ph})`);
          params.push(...ids);
          idx += ids.length;
        }
        if (filters.isFinishGood !== undefined) {
          whereConds.push(`it.is_finish_good = $${idx++}`);
          params.push(Boolean(filters.isFinishGood));
        }
      }
      const dr: [string, string] | null = dateRange !== undefined ? (dateRange as [string, string] | null) : (Array.isArray(filters.dateRange) ? (filters.dateRange as [string, string]) : null);
      if (dr && dr.length === 2) {
        whereConds.push(`sm.movement_date >= $${idx++}::date`);
        params.push(String(dr[0]));
        whereConds.push(`sm.movement_date <= $${idx++}::date`);
        params.push(String(dr[1]));
      }
      const whereSql = whereConds.length ? `WHERE ${whereConds.join(" AND ")}` : "";
      const sqlText = `SELECT COALESCE(SUM(smd.qty::numeric),0) as val FROM stock_movement_details smd JOIN stock_movements sm ON sm.id = smd.movement_id JOIN movement_types mt ON mt.id = sm.type_id${joinItem} ${whereSql}`;
      const result = (await pool.query(sqlText, params)) as any;
      const rws = result.rows ?? result;
      return Number(rws[0]?.val ?? 0);
    }

    async function sumDelivery(dateRange?: [string, string] | null): Promise<number> {
      const whereConds: string[] = [];
      const params: any[] = [];
      let idx = 1;
      whereConds.push(`dlv.status = $${idx++}`);
      params.push("POSTED");
      if (!isAdmin && whIds.length) {
        const ph = whIds.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`dlv.warehouse_id IN (${ph})`);
        params.push(...whIds);
        idx += whIds.length;
      }
      if (Array.isArray(filters.warehouseId) && (filters.warehouseId as string[]).length) {
        const ids = filters.warehouseId as string[];
        const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`dlv.warehouse_id IN (${ph})`);
        params.push(...ids);
        idx += ids.length;
      }
      if (Array.isArray(filters.branchId) && (filters.branchId as string[]).length) {
        const ids = filters.branchId as string[];
        const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`dlv.warehouse_id IN (SELECT id FROM warehouses WHERE branch_id IN (${ph}))`);
        params.push(...ids);
        idx += ids.length;
      }
      if (Array.isArray(filters.itemId) && (filters.itemId as string[]).length) {
        const ids = filters.itemId as string[];
        const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
        whereConds.push(`dl.item_id IN (${ph})`);
        params.push(...ids);
        idx += ids.length;
      }
      let needItemJoin = false;
      if (Array.isArray(filters.itemGroupId) && (filters.itemGroupId as string[]).length) needItemJoin = true;
      if (filters.isFinishGood !== undefined) needItemJoin = true;
      let joinItem = "";
      if (needItemJoin) {
        joinItem = ` JOIN items it ON it.id = dl.item_id`;
        if (Array.isArray(filters.itemGroupId) && (filters.itemGroupId as string[]).length) {
          const ids = filters.itemGroupId as string[];
          const ph = ids.map((_, i) => `$${idx + i}`).join(", ");
          whereConds.push(`it.item_group_id IN (${ph})`);
          params.push(...ids);
          idx += ids.length;
        }
        if (filters.isFinishGood !== undefined) {
          whereConds.push(`it.is_finish_good = $${idx++}`);
          params.push(Boolean(filters.isFinishGood));
        }
      }
      const dr: [string, string] | null = dateRange !== undefined ? (dateRange as [string, string] | null) : (Array.isArray(filters.dateRange) ? (filters.dateRange as [string, string]) : null);
      if (dr && dr.length === 2) {
        whereConds.push(`dlv.delivery_date >= $${idx++}::date`);
        params.push(String(dr[0]));
        whereConds.push(`dlv.delivery_date <= $${idx++}::date`);
        params.push(String(dr[1]));
      }
      const whereSql = whereConds.length ? `WHERE ${whereConds.join(" AND ")}` : "";
      const sqlText = `SELECT COALESCE(SUM(dl.qty::numeric),0) as val FROM delivery_lines dl JOIN deliveries dlv ON dl.delivery_id = dlv.id${joinItem} ${whereSql}`;
      const result = (await pool.query(sqlText, params)) as any;
      const rws = result.rows ?? result;
      return Number(rws[0]?.val ?? 0);
    }

    const returnQty = await sumReturn();
    const deliveryQty = await sumDelivery();
    const pct = deliveryQty > 0 ? (returnQty / deliveryQty) * 100 : 0;

    // Siapkan row dengan berbagai alias agar KpiWidget menemukan key yang benar
    const row: Record<string, any> = {};
    row[valueKey] = pct;
    row["returnPct"] = pct;
    row["returnPct_avg"] = pct;
    row["returnPct_sum"] = pct;
    row["value"] = pct;
    // tambahan info untuk debugging/tooltip (tidak dipakai KPI tapi bisa dicek)
    (row as any)["returnQty"] = returnQty;
    (row as any)["deliveryQty"] = deliveryQty;

    let previousValue: number | null = null;
    let percentChange: number | null = null;
    let periodLabel: string | null = null;
    if (Array.isArray((filters as any).dateRange) && (filters as any).dateRange.length === 2) {
      const dr = (filters as any).dateRange as [string, string];
      const prev = previousDateRange(dr);
      if (prev) {
        periodLabel = prev.label;
        const prevReturn = await sumReturn(prev.range);
        const prevDelivery = await sumDelivery(prev.range);
        const prevPct = prevDelivery > 0 ? (prevReturn / prevDelivery) * 100 : 0;
        previousValue = prevPct;
        if (prevPct !== 0) percentChange = ((pct - prevPct) / Math.abs(prevPct)) * 100;
        else if (pct !== 0) percentChange = null;
        else percentChange = 0;
      }
    }
    return { rows: [row], previousValue, percentChange, periodLabel };
  }
  const { rows } = await runQuery(config, req);
  // KPI only: groupBy empty + single measure + ada dateColumn → hitung vs previous period
  const filters = (config?.filters ?? {}) as Record<string, unknown>;
  const factKey: string = config?.factTable;
  const fact = FACT_TABLES[factKey];
  const groupBy: string[] = config?.groupBy ?? [];
  const measures: any[] = config?.measures ?? [];
  const isKpi = groupBy.length === 0 && measures.length === 1 && !!fact?.dateColumn;
  if (!isKpi || !Array.isArray((filters as any)?.dateRange)) {
    return { rows, previousValue: null, percentChange: null, periodLabel: null };
  }
  const dr = (filters as any).dateRange as [string, string];
  const prev = previousDateRange(dr);
  if (!prev) return { rows, previousValue: null, percentChange: null, periodLabel: null };
  const prevConfig = {
    ...config,
    filters: { ...filters, dateRange: prev.range },
  };
  try {
    const { rows: prevRows } = await runQuery(prevConfig, req);
    const valueKey = measures[0].alias || `${measures[0].field}_${measures[0].aggregation}`;
    const curVal = Number(rows?.[0]?.[valueKey] ?? 0);
    const prevVal = Number(prevRows?.[0]?.[valueKey] ?? 0);
    let pct: number | null = null;
    if (prevVal !== 0) pct = ((curVal - prevVal) / Math.abs(prevVal)) * 100;
    else if (curVal !== 0) pct = null; // infinite, hide
    else pct = 0;
    return { rows, previousValue: prevVal, percentChange: pct, periodLabel: prev.label };
  } catch {
    return { rows, previousValue: null, percentChange: null, periodLabel: null };
  }
}

function applyFilters(
  filters: any,
  fact: FactDef,
  conditions: any[],
  addJoin: (key: string, table: any, on: any) => void
) {
  if (!filters || typeof filters !== "object") return;
  for (const key of Object.keys(filters)) {
    if (!(ALLOWED_FILTERS as readonly string[]).includes(key))
      throw new InvalidConfig(`filter tidak valid: ${key}`);
  }
  const wh = s.warehouses;
  const br = s.branches;
  const it = s.items;
  const ig = s.itemGroups;
  const bat = s.batches;

  if (Array.isArray(filters.dateRange) && filters.dateRange.length === 2 && fact.dateColumn) {
    if (fact.dateJoin) addJoin(fact.dateJoin.key, fact.dateJoin.table, fact.dateJoin.on);
    const [start, end] = filters.dateRange;
    conditions.push(sql`${fact.dateColumn} >= ${String(start)}::date`);
    conditions.push(sql`${fact.dateColumn} <= ${String(end)}::date`);
  }
  if (Array.isArray(filters.warehouseId) && filters.warehouseId.length)
    conditions.push(inArray(fact.warehouseCol, filters.warehouseId));
  if (Array.isArray(filters.branchId) && filters.branchId.length) {
    addJoin("wh", wh, eq(fact.warehouseCol, wh.id));
    conditions.push(inArray(wh.branchId, filters.branchId));
  }
  if (Array.isArray(filters.itemGroupId) && filters.itemGroupId.length) {
    if (fact.itemCol) addJoin("it", it, eq(fact.itemCol, it.id));
    else {
      addJoin("bat", bat, eq(s.stockBatches.batchId, bat.id));
      addJoin("it", it, eq(bat.itemId, it.id));
    }
    addJoin("ig", ig, eq(it.itemGroupId, ig.id));
    conditions.push(inArray(ig.id, filters.itemGroupId));
  }
  if (Array.isArray(filters.itemId) && filters.itemId.length) {
    if (fact.itemCol) conditions.push(inArray(fact.itemCol, filters.itemId));
    else {
      addJoin("bat", bat, eq(s.stockBatches.batchId, bat.id));
      addJoin("it", it, eq(bat.itemId, it.id));
      conditions.push(inArray(it.id, filters.itemId));
    }
  }
  if (Array.isArray(filters.locationId) && filters.locationId.length && fact.locationCol)
    conditions.push(inArray(fact.locationCol, filters.locationId));
  if (Array.isArray(filters.batchId) && filters.batchId.length && fact.batchCol)
    conditions.push(inArray(fact.batchCol, filters.batchId));
  // Filters khusus stock_balances - pakai EXISTS biar tidak butuh join tambahan setelah q dibuat
  if (filters.isActive !== undefined && fact.table === s.stockBalances) {
    const val = Boolean(filters.isActive);
    conditions.push(sql`EXISTS (SELECT 1 FROM ${it} WHERE ${it.id} = ${fact.itemCol} AND ${it.isActive} = ${val})`);
  }
  if (filters.closingQtyGt !== undefined && fact.table === s.stockBalances)
    conditions.push(sql`${s.stockBalances.closingQty} > ${Number(filters.closingQtyGt)}`);
  if (filters.closingQtyGte !== undefined && fact.table === s.stockBalances)
    conditions.push(sql`${s.stockBalances.closingQty} >= ${Number(filters.closingQtyGte)}`);
  if (filters.closingQtyLt !== undefined && fact.table === s.stockBalances)
    conditions.push(sql`${s.stockBalances.closingQty} < ${Number(filters.closingQtyLt)}`);
  if (filters.closingQtyLte !== undefined && fact.table === s.stockBalances)
    conditions.push(sql`${s.stockBalances.closingQty} <= ${Number(filters.closingQtyLte)}`);
  if (filters.closingQtyEq !== undefined && fact.table === s.stockBalances)
    conditions.push(sql`${s.stockBalances.closingQty} = ${Number(filters.closingQtyEq)}`);
  if (filters.movementTypeCode !== undefined && fact.table === s.stockMovementDetails) {
    // join stockMovements + movementTypes untuk filter type
    if (fact.dateJoin) addJoin(fact.dateJoin.key, fact.dateJoin.table, fact.dateJoin.on);
    addJoin("mt_filter", s.movementTypes, eq(s.stockMovements.typeId, s.movementTypes.id));
    conditions.push(eq(s.movementTypes.code, String(filters.movementTypeCode)));
  }
  if (filters.isFinishGood !== undefined) {
    const val = Boolean(filters.isFinishGood);
    // filter finish good via items table
    if (fact.itemCol) {
      conditions.push(sql`EXISTS (SELECT 1 FROM ${it} WHERE ${it.id} = ${fact.itemCol} AND ${it.isFinishGood} = ${val})`);
    } else {
      // untuk stock_batches yang item via batch
      addJoin("it_fg", it, eq(s.batches.itemId, it.id));
      addJoin("bat_fg", bat, eq(s.stockBatches.batchId, bat.id));
      conditions.push(sql`EXISTS (SELECT 1 FROM ${it} WHERE ${it.id} = ${s.batches.itemId} AND ${it.isFinishGood} = ${val})`);
    }
  }
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// Query single — tetap untuk preview builder & backward compat.
dashboardBuilderRouter.post("/dashboards/widgets/query", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const result = await buildWidgetQuery(req.body ?? {}, req);
    res.json(result);
  } catch (e) {
    if (e instanceof InvalidConfig)
      return res.status(400).json({ error: e.message });
    next(e);
  }
});

// Template registry — frontend builder ambil daftar widget jadi per workspace (GET, cacheable).
dashboardBuilderRouter.get("/dashboard-templates", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : null;
    // templates diregister per legacy key wsp-<code>; query datang sebagai publicId/uuid atau code
    const ws = await resolveWorkspace(workspaceId);
    const list = templatesForWorkspace(ws ? `wsp-${ws.code}` : workspaceId);
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// Batch query — efisien untuk dashboard dengan N widget (1 round-trip vs N).
// Body: { queries: WidgetConfig[] } atau { configs: WidgetConfig[] } atau WidgetConfig[]
dashboardBuilderRouter.post("/dashboards/widgets/query-batch", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const body: unknown = req.body ?? {};
    let configs: unknown[] = [];
    if (Array.isArray(body)) {
      configs = body as unknown[];
    } else if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      if (Array.isArray(b.queries)) configs = b.queries as unknown[];
      else if (Array.isArray(b.configs)) configs = b.configs as unknown[];
      else if (Array.isArray(b.widgets)) {
        configs = (b.widgets as unknown[]).map((w) =>
          w && typeof w === "object" && "config" in (w as Record<string, unknown>)
            ? (w as Record<string, unknown>).config
            : w
        );
      } else {
        return res.status(400).json({ error: "Body harus { queries: WidgetConfig[] } atau WidgetConfig[]" });
      }
    }
    if (configs.length === 0) return res.json({ results: [] });
    if (configs.length > 20) return res.status(400).json({ error: "Maksimal 20 widget per batch." });

    // Eksekusi paralel — tiap buildWidgetQuery sudah ter-scope per warehouseIds user.
    const results = await Promise.all(
      configs.map(async (cfg) => {
        try {
          const result = await buildWidgetQuery(cfg, req);
          return { ...result, error: null as string | null };
        } catch (e) {
          if (e instanceof InvalidConfig) return { rows: [] as unknown[], error: e.message, percentChange: null, periodLabel: null, previousValue: null };
          throw e;
        }
      })
    );
    res.json({ results });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.get("/dashboards/meta", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const factTables = Object.entries(FACT_TABLES).map(([key, f]) => ({
      key,
      label: f.label,
      measures: f.measures,
      dims: f.dims,
    }));
    res.json({
      factTables,
      aggregations: ALLOWED_AGGS,
      periodGrains: PERIOD_KEYS,
      filters: ALLOWED_FILTERS,
    });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.get("/dashboards", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : null;
    let rows: (typeof s.dashboards.$inferSelect)[];
    if (workspaceId) {
      const ws = await resolveWorkspace(workspaceId);
      if (!ws) return res.json([]);
      rows = await db.select().from(s.dashboards).where(or(eq(s.dashboards.workspaceId, ws.id), eq(s.dashboards.isGlobal, true))).orderBy(s.dashboards.name);
    } else {
      rows = await db.select().from(s.dashboards).orderBy(s.dashboards.name);
    }
    const wsMap = await workspacePublicIdMap([...new Set(rows.map((r) => r.workspaceId).filter((v): v is number => v !== null))]);
    res.json(rows.map((r) => toPublicDashboard(r, r.workspaceId === null ? null : (wsMap.get(r.workspaceId) ?? null))));
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.post("/dashboards", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Nama dashboard wajib." });
    const wsRaw = typeof req.body?.workspaceId === "string" && req.body.workspaceId ? req.body.workspaceId : null;
    const ws = await resolveWorkspace(wsRaw);
    if (wsRaw && !ws) return res.status(400).json({ error: "Workspace tidak ditemukan." });
    if (ws && !(await hasWorkspaceAccess(req as any, String(ws.id)))) {
      res.status(403).json({ error: "Tidak punya akses workspace." });
      return;
    }
    const ownerId = await resolveUserInternalId((req as any).user?.id ?? null);
    const branchId = await resolveBranchInternalId(req.body?.branchId ?? null);
    const [created] = await db.insert(s.dashboards).values({
      name,
      ownerId,
      branchId,
      workspaceId: ws?.id ?? null,
      isGlobal: req.body?.isGlobal === false ? false : true,
    }).returning();
    res.status(201).json({ id: created.publicId });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.get("/dashboards/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const internalId = await resolveDashboardInternalId(req.params.id);
    if (internalId === null) return res.status(404).json({ error: "Dashboard tidak ditemukan." });
    const [row] = await db
      .select()
      .from(s.dashboards)
      .where(eq(s.dashboards.id, internalId))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Dashboard tidak ditemukan." });
    const widgets = await db
      .select()
      .from(s.dashboardWidgets)
      .where(eq(s.dashboardWidgets.dashboardId, internalId));
    const wsMap = await workspacePublicIdMap(row.workspaceId === null ? [] : [row.workspaceId]);
    res.json({ ...toPublicDashboard(row, row.workspaceId === null ? null : (wsMap.get(row.workspaceId) ?? null)), createdAt: row.createdAt, widgets: widgets.map(toPublicWidget) });
  } catch (e) {
    next(e);
  }
});

// GET /dashboards/:id/widgets/data — 1 GET untuk semua widget jadi (efisien, cacheable).
// Tidak perlu POST config bebas: server resolve templateId -> buildWidgetQuery hardcode.
dashboardBuilderRouter.get("/dashboards/:id/widgets/data", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const dashboardId = await resolveDashboardInternalId(req.params.id);
    if (dashboardId === null) return res.json({ widgets: [] });
    const widgets = await db
      .select()
      .from(s.dashboardWidgets)
      .where(eq(s.dashboardWidgets.dashboardId, dashboardId));
    if (widgets.length === 0) return res.json({ widgets: [] });

    const results = await Promise.all(
      widgets.map(async (w) => {
        const rawConfig: unknown = (w.config as Record<string, unknown>) ?? {};
        // Support baru: { templateId: "tpl-..." }, dan legacy: full WidgetConfig
        const templateId =
          typeof rawConfig === "object" && rawConfig !== null && "templateId" in (rawConfig as Record<string, unknown>)
            ? String((rawConfig as Record<string, unknown>).templateId)
            : null;
        let effectiveConfig: unknown = rawConfig;
        let effectiveType = w.type;
        let effectiveTitle: string | undefined;
        if (templateId) {
          const tpl = TEMPLATE_BY_ID.get(templateId);
          if (!tpl) return { id: w.publicId, type: w.type, layout: w.layout, title: w.type, rows: [] as unknown[], error: `Template ${templateId} tidak ditemukan` };
          effectiveConfig = tpl.config;
          effectiveType = tpl.type;
          effectiveTitle = tpl.title;
        } else if (
          rawConfig &&
          typeof rawConfig === "object" &&
          "title" in (rawConfig as Record<string, unknown>)
        ) {
          effectiveTitle = String((rawConfig as Record<string, unknown>).title ?? "");
        }
        // Allow title override dari config.title
        if (rawConfig && typeof rawConfig === "object" && "title" in (rawConfig as Record<string, unknown>) && (rawConfig as Record<string, unknown>).title) {
          effectiveTitle = String((rawConfig as Record<string, unknown>).title);
        }
        try {
          // Merge title ke config untuk label, tapi buildWidgetQuery tidak butuh title
          const result = await buildWidgetQuery(effectiveConfig, req);
          return { id: w.publicId, type: effectiveType, layout: w.layout, title: effectiveTitle ?? w.type, templateId, rows: result.rows, percentChange: (result as any).percentChange ?? null, periodLabel: (result as any).periodLabel ?? null, previousValue: (result as any).previousValue ?? null, error: null as string | null, config: effectiveConfig };
        } catch (e) {
          if (e instanceof InvalidConfig) return { id: w.publicId, type: effectiveType, layout: w.layout, title: effectiveTitle ?? w.type, templateId, rows: [] as unknown[], percentChange: null, periodLabel: null, previousValue: null, error: e.message, config: effectiveConfig };
          throw e;
        }
      })
    );
    res.json({ widgets: results });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.put("/dashboards/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const patch: Record<string, any> = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name);
    if (req.body?.branchId !== undefined) patch.branchId = await resolveBranchInternalId(req.body.branchId);
    if (req.body?.isGlobal !== undefined) patch.isGlobal = Boolean(req.body.isGlobal);
    const internalId = await resolveDashboardInternalId(req.params.id);
    if (internalId === null) return res.status(404).json({ error: "Dashboard tidak ditemukan." });
    await db.update(s.dashboards).set(patch).where(eq(s.dashboards.id, internalId));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.delete("/dashboards/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const internalId = await resolveDashboardInternalId(req.params.id);
    if (internalId === null) return res.status(404).json({ error: "Dashboard tidak ditemukan." });
    await db.delete(s.dashboards).where(eq(s.dashboards.id, internalId));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

const WIDGET_TYPES = ["bar", "line", "pie", "table", "kpi"];

dashboardBuilderRouter.post("/dashboards/:id/widgets", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const templateId = typeof req.body?.templateId === "string" ? String(req.body.templateId) : null;
    let type = String(req.body?.type ?? "");
    let config: unknown = req.body?.config;
    const layout = req.body?.layout ?? {};

    const dashboardId = await resolveDashboardInternalId(req.params.id);
    if (dashboardId === null) return res.status(404).json({ error: "Dashboard tidak ditemukan." });
    if (templateId) {
      const tpl = TEMPLATE_BY_ID.get(templateId);
      if (!tpl) return res.status(400).json({ error: `Template ${templateId} tidak dikenal.` });
      type = tpl.type;
      // Simpan minimal { templateId, title } — title boleh override
      const titleOverride = typeof req.body?.title === "string" ? String(req.body.title).trim() : undefined;
      config = { templateId, ...(titleOverride ? { title: titleOverride } : {}) };
      // Validasi workspace cocok dengan dashboard (bandingkan via code)
      const [dash] = await db.select({ workspaceId: s.dashboards.workspaceId }).from(s.dashboards).where(eq(s.dashboards.id, dashboardId)).limit(1);
      if (dash?.workspaceId) {
        const [dashWs] = await db.select({ code: s.workspaces.code }).from(s.workspaces).where(eq(s.workspaces.id, dash.workspaceId)).limit(1);
        if (dashWs && tpl.workspaceId !== `wsp-${dashWs.code}`) {
          return res.status(400).json({ error: `Template ${templateId} untuk workspace ${tpl.workspaceId}, dashboard ini ${dashWs.code}.` });
        }
      }
    } else {
      if (!WIDGET_TYPES.includes(type)) return res.status(400).json({ error: "Tipe widget tidak valid." });
      if (!config) config = {};
    }

    const [w] = await db.insert(s.dashboardWidgets).values({
      dashboardId,
      type,
      config: (config ?? {}) as object,
      layout: layout as object,
    }).returning();
    res.status(201).json(toPublicWidget(w));
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.put("/dashboards/:id/widgets/:widgetId", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const patch: Record<string, any> = {};
    if (typeof req.body?.templateId === "string") {
      const tpl = TEMPLATE_BY_ID.get(String(req.body.templateId));
      if (!tpl) return res.status(400).json({ error: `Template ${req.body.templateId} tidak dikenal.` });
      patch.type = tpl.type;
      const titleOverride = typeof req.body?.title === "string" ? String(req.body.title).trim() : undefined;
      patch.config = { templateId: tpl.id, ...(titleOverride ? { title: titleOverride } : {}) };
    } else {
      if (req.body?.type !== undefined) {
        if (!WIDGET_TYPES.includes(String(req.body.type)))
          return res.status(400).json({ error: "Tipe widget tidak valid." });
        patch.type = String(req.body.type);
      }
      if (req.body?.config !== undefined) patch.config = req.body.config;
      if (req.body?.title !== undefined && !patch.config) {
        // Title override tanpa ganti template — patch config.title
        const widgetIdLookup = await resolveWidgetInternalId(req.params.widgetId);
        const dashboardIdLookup = await resolveDashboardInternalId(req.params.id);
        const [cur] = widgetIdLookup !== null && dashboardIdLookup !== null
          ? await db.select({ config: s.dashboardWidgets.config }).from(s.dashboardWidgets).where(and(eq(s.dashboardWidgets.id, widgetIdLookup), eq(s.dashboardWidgets.dashboardId, dashboardIdLookup))).limit(1)
          : [];
        const curCfg = (cur?.config ?? {}) as Record<string, unknown>;
        patch.config = { ...curCfg, title: String(req.body.title) };
      }
    }
    if (Object.keys(patch).length === 0) return res.json({ ok: true });
    const dashboardId = await resolveDashboardInternalId(req.params.id);
    const widgetId = await resolveWidgetInternalId(req.params.widgetId);
    if (dashboardId === null || widgetId === null) return res.status(404).json({ error: "Widget tidak ditemukan." });
    await db
      .update(s.dashboardWidgets)
      .set(patch)
      .where(
        and(
          eq(s.dashboardWidgets.id, widgetId),
          eq(s.dashboardWidgets.dashboardId, dashboardId)
        )
      );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.delete("/dashboards/:id/widgets/:widgetId", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const dashboardId = await resolveDashboardInternalId(req.params.id);
    const widgetId = await resolveWidgetInternalId(req.params.widgetId);
    if (dashboardId === null || widgetId === null) return res.status(404).json({ error: "Widget tidak ditemukan." });
    await db
      .delete(s.dashboardWidgets)
      .where(
        and(
          eq(s.dashboardWidgets.id, widgetId),
          eq(s.dashboardWidgets.dashboardId, dashboardId)
        )
      );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.patch("/dashboards/:id/layout", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const widgets = req.body?.widgets;
    if (!Array.isArray(widgets))
      return res.status(400).json({ error: "widgets wajib berupa array." });
    for (const w of widgets) {
      if (!w || !w.id) continue;
      const widgetId = await resolveWidgetInternalId(w.id);
      const dashboardId = await resolveDashboardInternalId(req.params.id);
      if (widgetId === null || dashboardId === null) continue;
      await db
        .update(s.dashboardWidgets)
        .set({ layout: w.layout ?? {} })
        .where(
          and(
            eq(s.dashboardWidgets.id, widgetId),
            eq(s.dashboardWidgets.dashboardId, dashboardId)
          )
        );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
