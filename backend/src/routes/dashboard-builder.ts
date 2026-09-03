import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, or, sql, sum, count, avg, min, max } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission, hasWorkspaceAccess } from "../middleware/rbac";
import { nextRowId } from "../lib/id";
import { TEMPLATE_BY_ID, templatesForWorkspace, WIDGET_TEMPLATES } from "../lib/dashboard-templates";

export const dashboardBuilderRouter = Router();

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
] as const;

const PERIOD_KEYS = ["day", "week", "month"] as const;

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
  const fmt = gran === "day" ? "YYYY-MM-DD" : gran === "week" ? "IYYY-WW" : "YYYY-MM";
  const granLit = sql.raw(`'${gran}'`);
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

  const selectObj: Record<string, any> = {};
  const groupExprs: any[] = [];

  for (const m of measures) {
    let col: any;
    // stockValue = closingQty * valuationRate (join items)
    if (factKey === "stock_balances" && m.field === "stockValue") {
      addJoin("it_stockValue", s.items, eq(fact.itemCol, s.items.id));
      col = sql`(${s.stockBalances.closingQty}::numeric * COALESCE(${s.items.valuationRate}::numeric, 0))`;
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
  const isAdmin = !req.user || req.user.role === "role_sys_admin";
  const whIds: string[] = (req as any).accessibleWarehouseIds ?? [];
  const conditions: any[] = [];
  if (!isAdmin && whIds.length) conditions.push(inArray(fact.warehouseCol, whIds));

  applyFilters(config?.filters ?? {}, fact, conditions, addJoin);

  if (conditions.length) q = q.where(and(...conditions));
  if (groupExprs.length) q = q.groupBy(...groupExprs);
  if (groupExprs.length) q = q.orderBy(groupExprs[0]);
  q = q.limit(200);

  const rows = await q;
  return { rows: rows as any[] };
}

async function buildWidgetQuery(
  config: any,
  req: Request
): Promise<{ rows: any[]; previousValue?: number | null; percentChange?: number | null; periodLabel?: string | null }> {
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
    const list = templatesForWorkspace(workspaceId);
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
      rows = await db.select().from(s.dashboards).where(or(eq(s.dashboards.workspaceId, workspaceId), eq(s.dashboards.isGlobal, true))).orderBy(s.dashboards.name);
    } else {
      rows = await db.select().from(s.dashboards).orderBy(s.dashboards.name);
    }
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.post("/dashboards", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "Nama dashboard wajib." });
    const workspaceId = typeof req.body?.workspaceId === "string" && req.body.workspaceId ? req.body.workspaceId : null;
    if (workspaceId && !(await hasWorkspaceAccess(req as any, workspaceId))) {
      res.status(403).json({ error: "Tidak punya akses workspace." });
      return;
    }
    const id = await nextRowId(db, s.dashboards, "dsb");
    await db.insert(s.dashboards).values({
      id,
      name,
      ownerId: (req as any).user?.id ?? null,
      branchId: req.body?.branchId ?? null,
      workspaceId,
      isGlobal: req.body?.isGlobal === false ? false : true,
    });
    res.status(201).json({ id });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.get("/dashboards/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const [row] = await db
      .select()
      .from(s.dashboards)
      .where(eq(s.dashboards.id, req.params.id))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Dashboard tidak ditemukan." });
    const widgets = await db
      .select()
      .from(s.dashboardWidgets)
      .where(eq(s.dashboardWidgets.dashboardId, req.params.id));
    res.json({ ...row, widgets });
  } catch (e) {
    next(e);
  }
});

// GET /dashboards/:id/widgets/data — 1 GET untuk semua widget jadi (efisien, cacheable).
// Tidak perlu POST config bebas: server resolve templateId -> buildWidgetQuery hardcode.
dashboardBuilderRouter.get("/dashboards/:id/widgets/data", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const dashboardId = req.params.id;
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
          if (!tpl) return { id: w.id, type: w.type, layout: w.layout, title: w.type, rows: [] as unknown[], error: `Template ${templateId} tidak ditemukan` };
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
          return { id: w.id, type: effectiveType, layout: w.layout, title: effectiveTitle ?? w.type, templateId, rows: result.rows, percentChange: (result as any).percentChange ?? null, periodLabel: (result as any).periodLabel ?? null, previousValue: (result as any).previousValue ?? null, error: null as string | null, config: effectiveConfig };
        } catch (e) {
          if (e instanceof InvalidConfig) return { id: w.id, type: effectiveType, layout: w.layout, title: effectiveTitle ?? w.type, templateId, rows: [] as unknown[], percentChange: null, periodLabel: null, previousValue: null, error: e.message, config: effectiveConfig };
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
    if (req.body?.branchId !== undefined) patch.branchId = req.body.branchId ?? null;
    if (req.body?.isGlobal !== undefined) patch.isGlobal = Boolean(req.body.isGlobal);
    await db.update(s.dashboards).set(patch).where(eq(s.dashboards.id, req.params.id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

dashboardBuilderRouter.delete("/dashboards/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "manage"))) return;
  try {
    await db.delete(s.dashboards).where(eq(s.dashboards.id, req.params.id));
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

    if (templateId) {
      const tpl = TEMPLATE_BY_ID.get(templateId);
      if (!tpl) return res.status(400).json({ error: `Template ${templateId} tidak dikenal.` });
      type = tpl.type;
      // Simpan minimal { templateId, title } — title boleh override
      const titleOverride = typeof req.body?.title === "string" ? String(req.body.title).trim() : undefined;
      config = { templateId, ...(titleOverride ? { title: titleOverride } : {}) };
      // Validasi workspace cocok dengan dashboard
      const [dash] = await db.select({ workspaceId: s.dashboards.workspaceId }).from(s.dashboards).where(eq(s.dashboards.id, req.params.id)).limit(1);
      if (dash?.workspaceId && tpl.workspaceId !== dash.workspaceId) {
        return res.status(400).json({ error: `Template ${templateId} untuk workspace ${tpl.workspaceId}, dashboard ini ${dash.workspaceId}.` });
      }
    } else {
      if (!WIDGET_TYPES.includes(type)) return res.status(400).json({ error: "Tipe widget tidak valid." });
      if (!config) config = {};
    }

    const id = await nextRowId(db, s.dashboardWidgets, "wgt");
    await db.insert(s.dashboardWidgets).values({
      id,
      dashboardId: req.params.id,
      type,
      config: (config ?? {}) as object,
      layout: layout as object,
    });
    const [w] = await db
      .select()
      .from(s.dashboardWidgets)
      .where(eq(s.dashboardWidgets.id, id))
      .limit(1);
    res.status(201).json(w);
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
        const [cur] = await db.select({ config: s.dashboardWidgets.config }).from(s.dashboardWidgets).where(and(eq(s.dashboardWidgets.id, req.params.widgetId), eq(s.dashboardWidgets.dashboardId, req.params.id))).limit(1);
        const curCfg = (cur?.config ?? {}) as Record<string, unknown>;
        patch.config = { ...curCfg, title: String(req.body.title) };
      }
    }
    if (Object.keys(patch).length === 0) return res.json({ ok: true });
    await db
      .update(s.dashboardWidgets)
      .set(patch)
      .where(
        and(
          eq(s.dashboardWidgets.id, req.params.widgetId),
          eq(s.dashboardWidgets.dashboardId, req.params.id)
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
    await db
      .delete(s.dashboardWidgets)
      .where(
        and(
          eq(s.dashboardWidgets.id, req.params.widgetId),
          eq(s.dashboardWidgets.dashboardId, req.params.id)
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
      await db
        .update(s.dashboardWidgets)
        .set({ layout: w.layout ?? {} })
        .where(
          and(
            eq(s.dashboardWidgets.id, w.id),
            eq(s.dashboardWidgets.dashboardId, req.params.id)
          )
        );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
