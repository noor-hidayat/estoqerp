// @ts-nocheck
import { Router, type Request } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { checkPermission } from "../middleware/rbac";

export const dashboardRouter = Router();

dashboardRouter.get("/dashboard", async (req: Request, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const s = schema;
    const branchIds = req.accessibleBranchIds ?? [];
    const warehouseIds = req.accessibleWarehouseIds ?? [];
    const isAdmin = !req.user || req.user.role === "role_sys_admin" || req.user.role === "SYS_ADMIN";

    function whScopeConds() {
      if (isAdmin) return undefined;
      const conds: ReturnType<typeof sql>[] = [];
      if (warehouseIds.length > 0) conds.push(inArray(s.opnameWarehouses.warehouseId, warehouseIds));
      if (branchIds.length > 0) {
        conds.push(
          inArray(
            s.opnameWarehouses.warehouseId,
            db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))
          ) as ReturnType<typeof sql>
        );
      }
      if (conds.length === 0) return sql`FALSE`;
      return conds.length === 1 ? conds[0] : or(...conds);
    }
    function opnameScopeWhere(scope: ReturnType<typeof sql> | undefined) {
      if (!scope) return undefined;
      return inArray(
        s.opnameProjects.id,
        db.select({ opnameId: s.opnameWarehouses.opnameId }).from(s.opnameWarehouses).where(scope)
      ) as ReturnType<typeof sql>;
    }

    const whScope = whScopeConds();
    const opScope = opnameScopeWhere(whScope);

    let parentQ = db.select().from(s.opnameProjects).$dynamic();
    if (opScope) parentQ = parentQ.where(opScope);
    const parentsAll = await parentQ.orderBy(sql`${s.opnameProjects.createdAt} DESC`);

    const parentIds = parentsAll.map((p) => p.id);
    const whsAll =
      parentIds.length > 0
        ? await db.select().from(s.opnameWarehouses).where(inArray(s.opnameWarehouses.opnameId, parentIds))
        : [];
    const whsByParent = new Map<string, (typeof whsAll)[number][]>();
    for (const w of whsAll) {
      const arr = whsByParent.get(w.opnameId) ?? [];
      arr.push(w);
      whsByParent.set(w.opnameId, arr);
    }

    // KPI: project aktif / final (dari status project, bukan turunan).
    const active = parentsAll.filter((p) => p.status === "IN_PROGRESS" || p.status === "DRAFT").length;
    const finalCount = parentsAll.filter((p) => p.status === "APPROVED").length;

    // total scan dengan scope (via detail opname)
    let scanCQ = db.select({ count: sql<number>`count(*)` }).from(s.opnameScanDetails).$dynamic();
    if (whScope) scanCQ = scanCQ.where(whScope);
    const [{ count: totalScan }] = await scanCQ;

    const [{ count: totalItems }] = await db.select({ count: sql<number>`count(*)` }).from(s.items);

    // 10 scan terbaru + nama user & produk terakhir
    let scanQ = db
      .select({
        id: s.opnameScans.id,
        opnameId: s.opnameScans.opnameId,
        scannedBy: s.opnameScans.scannedBy,
        startedAt: s.opnameScans.startedAt,
        userName: s.users.name,
      })
      .from(s.opnameScans)
      .leftJoin(s.users, eq(s.opnameScans.scannedBy, s.users.id))
      .$dynamic();
    if (opScope) scanQ = scanQ.where(opScope);

    const scans = await scanQ.orderBy(sql`${s.opnameScans.startedAt} DESC`).limit(10);

    const recent = await Promise.all(scans.map(async (ses) => {
      const [lastRec] = await db
        .select({ itemId: s.opnameScanDetails.itemId })
        .from(s.opnameScanDetails)
        .where(eq(s.opnameScanDetails.scanId, ses.id))
        .orderBy(sql`${s.opnameScanDetails.scannedAt} DESC`)
        .limit(1);
      const [{ totalQty }] = await db
        .select({ totalQty: sql<number>`COALESCE(SUM(${s.opnameScanDetails.quantity}), 0)` })
        .from(s.opnameScanDetails)
        .where(eq(s.opnameScanDetails.scanId, ses.id));
      let product = "";
      if (lastRec?.itemId) {
        const [it] = await db.select({ name: s.items.name }).from(s.items).where(eq(s.items.id, lastRec.itemId)).limit(1);
        product = it?.name ?? "";
      }
      return {
        id: ses.id, code: ses.id, product, qty: Number(totalQty),
        scannedBy: ses.userName ?? "", at: ses.startedAt,
      };
    }));

    // Progress per project (per gudang: lokasi total vs tercount)
    const progressRows: { id: string; name: string; pct: number; warehouse: string; counted: number; total: number; status: string }[] = [];
    let totalLocAll = 0, totalCountedAll = 0;

    const whIdToName = new Map<string, string>();
    if (whsAll.length > 0) {
      const whIds = [...new Set(whsAll.map((w) => w.warehouseId))];
      const whRows = await db.select({ id: s.warehouses.id, name: s.warehouses.name }).from(s.warehouses).where(inArray(s.warehouses.id, whIds));
      for (const w of whRows) whIdToName.set(w.id, w.name);
    }

    for (const parent of parentsAll) {
      const whs = whsByParent.get(parent.id) ?? [];
      if (whs.length === 0) continue;
      if (parent.status === "CANCELLED") continue;

      let parentCounted = 0, parentTotal = 0;
      for (const w of whs) {
        const [{ count: tl }] = await db.select({ count: sql<number>`count(*)` }).from(s.locations).where(eq(s.locations.warehouseId, w.warehouseId));
        const locTL = Number(tl);
        const scanned = await db
          .selectDistinct({ locationId: s.opnameScanDetails.locationId })
          .from(s.opnameScanDetails)
          .where(and(
            eq(s.opnameScanDetails.opnameId, parent.id),
            eq(s.opnameScanDetails.warehouseId, w.warehouseId),
            sql`${s.opnameScanDetails.locationId} IS NOT NULL`
          ));
        const whIdsSet = new Set((await db.select({ id: s.locations.id }).from(s.locations).where(eq(s.locations.warehouseId, w.warehouseId))).map((l) => l.id));
        const counted = scanned.filter((r) => r.locationId && whIdsSet.has(r.locationId)).length;
        parentCounted += counted;
        parentTotal += locTL;
      }
      const pct = parentTotal > 0 ? Math.round((parentCounted / parentTotal) * 100) : 0;

      const whNames = [...new Set(whs.map((w) => w.warehouseId).filter(Boolean))];
      const warehouseLabel = whNames.length > 1 ? `${whNames.length} gudang` : (whIdToName.get(whNames[0]) ?? "");

      progressRows.push({ id: parent.id, name: parent.name, pct, warehouse: warehouseLabel, counted: parentCounted, total: parentTotal, status: parent.status });
      if (parent.status === "IN_PROGRESS") {
        totalLocAll += parentTotal;
        totalCountedAll += parentCounted;
      }
    }
    progressRows.sort((a, b) => b.pct - a.pct);
    const progressPct = totalLocAll > 0 ? Math.round((totalCountedAll / totalLocAll) * 100) : 0;

    // stock hasil opname per gudang (project opname terakhir per gudang)
    let whQ = db.select().from(s.warehouses).$dynamic();
    if (!isAdmin) whQ = whQ.where(inArray(s.warehouses.id, warehouseIds));
    const warehouses = await whQ;

    const warehouseOpname: {
      warehouseId: string; warehouseName: string; projectName: string;
      systemQty: number; countedQty: number;
    }[] = [];

    for (const wh of warehouses) {
      const [opwh] = await db
        .select({
          opnameId: s.opnameWarehouses.opnameId,
          status: s.opnameWarehouses.status,
        })
        .from(s.opnameWarehouses)
        .where(and(eq(s.opnameWarehouses.warehouseId, wh.id), sql`${s.opnameWarehouses.status} != 'CANCELLED'`))
        .orderBy(sql`${s.opnameWarehouses.createdAt} DESC`)
        .limit(1);

      let countedQty = 0;
      let systemQty = 0;
      let projectName = "";

      if (opwh) {
        const [parent] = await db
          .select({ name: s.opnameProjects.name })
          .from(s.opnameProjects)
          .where(eq(s.opnameProjects.id, opwh.opnameId))
          .limit(1);
        projectName = parent?.name ?? "";
        const [{ cq }] = await db
          .select({ cq: sql<number>`COALESCE(SUM(${s.opnameScanDetails.quantity}), 0)` })
          .from(s.opnameScanDetails)
          .where(eq(s.opnameScanDetails.opnameId, opwh.opnameId));
        countedQty = Number(cq);
      }
      const [{ sq }] = await db
        .select({ sq: sql<number>`COALESCE(SUM(${s.stockBalances.closingQty}), 0)` })
        .from(s.stockBalances)
        .where(eq(s.stockBalances.warehouseId, wh.id));
      systemQty = Number(sq);

      warehouseOpname.push({
        warehouseId: wh.id, warehouseName: wh.name, projectName,
        systemQty, countedQty,
      });
    }
    warehouseOpname.sort((a, b) => b.countedQty - a.countedQty);

    res.json({
      active, final: finalCount, totalScan: Number(totalScan), totalItems: Number(totalItems),
      progressPct, progressCounted: totalCountedAll, progressTotal: totalLocAll,
      recentSessions: recent, projectProgressRows: progressRows.slice(0, 4),
      warehouseOpname,
    });
  } catch (e) {
    next(e);
  }
});