import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray, or, sql, sum, count, avg, min, max } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission, hasWorkspaceAccess } from "../middleware/rbac";
import { nextRowId } from "../lib/id";

export const dashboardBuilderRouter = Router();

// ---------------------------------------------------------------------------
// WHITELIST fact table — tidak ada SQL bebas. Hanya kombinasi
// (factTable, measure, dim, filter) di bawah yang diproses.
// ---------------------------------------------------------------------------

const ALLOWED_AGGS = ["sum", "count", "avg", "min", "max"] as const;
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
    measures: ["openingQty", "inQty", "outQty", "closingQty"],
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
] as const;

const PERIOD_KEYS = ["day", "week", "month"] as const;

class InvalidConfig extends Error {}

function aggSql(agg: string, col: any) {
  switch (agg) {
    case "sum":
      return sql`sum(${col})`;
    case "count":
      return sql`count(${col})`;
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

async function buildWidgetQuery(
  config: any,
  req: Request
): Promise<{ rows: any[] }> {
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
    const col = (fact.table as any)[m.field];
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
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

// Query (static) — harus didaftarkan SEBELUM rute /:id.
dashboardBuilderRouter.post("/dashboards/widgets/query", async (req, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const { rows } = await buildWidgetQuery(req.body ?? {}, req);
    res.json({ rows });
  } catch (e) {
    if (e instanceof InvalidConfig)
      return res.status(400).json({ error: e.message });
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
    const type = String(req.body?.type ?? "");
    if (!WIDGET_TYPES.includes(type))
      return res.status(400).json({ error: "Tipe widget tidak valid." });
    const id = await nextRowId(db, s.dashboardWidgets, "wgt");
    await db.insert(s.dashboardWidgets).values({
      id,
      dashboardId: req.params.id,
      type,
      config: req.body?.config ?? {},
      layout: req.body?.layout ?? {},
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
    if (req.body?.type !== undefined) {
      if (!WIDGET_TYPES.includes(String(req.body.type)))
        return res.status(400).json({ error: "Tipe widget tidak valid." });
      patch.type = String(req.body.type);
    }
    if (req.body?.config !== undefined) patch.config = req.body.config;
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
