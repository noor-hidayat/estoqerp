import { Router, type Request } from "express";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { checkPermission } from "../middleware/rbac";

export const dashboardRouter = Router();

function deriveStatus(children: { status: string }[]): string {
  const all = children.map((c) => c.status);
  if (all.length === 0) return "DRAFT";
  if (all.every((s) => s === "APPROVED")) return "APPROVED";
  if (all.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (all.some((s) => s === "IN_PROGRESS")) return "IN_PROGRESS";
  return all[0];
}

dashboardRouter.get("/dashboard", async (req: Request, res, next) => {
  if (!(await checkPermission(req, res, "dashboard", "view"))) return;
  try {
    const s = schema;
    const branchIds = req.accessibleBranchIds ?? [];
    const warehouseIds = req.accessibleWarehouseIds ?? [];
    const isAdmin = !req.user || req.user.role === "role_sys_admin";

    function projScopeWhere() {
      if (isAdmin) return undefined;
      const conds: ReturnType<typeof sql>[] = [];
      if (branchIds.length > 0) conds.push(inArray(s.projects.branchId, branchIds));
      if (warehouseIds.length > 0) conds.push(inArray(s.projects.warehouseId, warehouseIds));
      if (conds.length === 0) return sql`FALSE`;
      return conds.length === 1 ? conds[0] : or(...conds);
    }

    // projects (SOPs) with scope
    let projQ = db.select().from(s.projects).$dynamic();
    const pw = projScopeWhere();
    if (pw) projQ = projQ.where(pw);
    const projectsAll = await projQ;

    // parents scoped via children
    let parentQ = db.select().from(s.opnameProjects).$dynamic();
    if (!isAdmin) {
      const accessibleParentIds = await db
        .selectDistinct({ projectId: s.projects.projectId })
        .from(s.projects)
        .where(inArray(s.projects.warehouseId, warehouseIds));
      const ids = accessibleParentIds.map((r) => r.projectId).filter((id): id is string => !!id);
      if (ids.length === 0) parentQ = parentQ.where(sql`FALSE`);
      else parentQ = parentQ.where(inArray(s.opnameProjects.id, ids));
    }
    const parentsAll = await parentQ.orderBy(sql`${s.opnameProjects.createdAt} DESC`);

    const parentIds = parentsAll.map((p) => p.id);
    const childrenAll =
      parentIds.length > 0
        ? await db.select().from(s.projects).where(inArray(s.projects.projectId, parentIds))
        : [];
    const childrenByParent = new Map<string, typeof projectsAll>();
    for (const c of childrenAll) {
      if (!c.projectId) continue;
      const arr = childrenByParent.get(c.projectId) ?? [];
      arr.push(c);
      childrenByParent.set(c.projectId, arr);
    }

    // KPI: parent-level active / final
    const active = parentsAll.filter((p) => {
      const ch = childrenByParent.get(p.id) ?? [];
      if (ch.length === 0) return false;
      const st = deriveStatus(ch);
      return st === "IN_PROGRESS" || st === "DRAFT";
    }).length;
    const finalCount = parentsAll.filter((p) => {
      const ch = childrenByParent.get(p.id) ?? [];
      return ch.length > 0 && deriveStatus(ch) === "APPROVED";
    }).length;

    // total scan with scope
    let scanCQ = db.select({ count: sql<number>`count(*)` }).from(s.scanRecords).$dynamic();
    if (!isAdmin) {
      scanCQ = scanCQ.where(sql`${s.scanRecords.projectId} IN (SELECT id FROM projects WHERE ${pw})`);
    }
    const [{ count: totalScan }] = await scanCQ;

    const [{ count: totalItems }] = await db.select({ count: sql<number>`count(*)` }).from(s.items);

    // recent 10 sessions with embedded names
    let sesQ = db
      .select({
        id: s.scanSessions.id, projectId: s.scanSessions.projectId,
        scannedBy: s.scanSessions.scannedBy, startedAt: s.scanSessions.startedAt,
        userName: s.users.name, locationCode: s.locations.code,
      })
      .from(s.scanSessions)
      .leftJoin(s.users, eq(s.scanSessions.scannedBy, s.users.id))
      .leftJoin(s.locations, eq(s.scanSessions.locationId, s.locations.id))
      .$dynamic();

    if (!isAdmin) {
      sesQ = sesQ.where(sql`${s.scanSessions.projectId} IN (SELECT id FROM projects WHERE ${pw})`);
    }

    const sessions = await sesQ.orderBy(sql`${s.scanSessions.startedAt} DESC`).limit(10);

    const recent = await Promise.all(sessions.map(async (ses) => {
      const [lastRec] = await db
        .select({ itemId: s.scanRecords.itemId })
        .from(s.scanRecords)
        .where(eq(s.scanRecords.sessionId, ses.id))
        .orderBy(sql`${s.scanRecords.scannedAt} DESC`)
        .limit(1);
      const [{ totalQty }] = await db
        .select({ totalQty: sql<number>`COALESCE(SUM(${s.scanRecords.quantity}), 0)` })
        .from(s.scanRecords)
        .where(eq(s.scanRecords.sessionId, ses.id));
      let product = "—";
      if (lastRec?.itemId) {
        const [it] = await db.select({ name: s.items.name }).from(s.items).where(eq(s.items.id, lastRec.itemId)).limit(1);
        product = it?.name ?? "—";
      }
      return {
        id: ses.id, code: ses.id, product, qty: Number(totalQty),
        scannedBy: ses.userName ?? "—", at: ses.startedAt,
      };
    }));

    // Project Progress (aggregate per parent)
    const progressRows: { id: string; name: string; pct: number; warehouse: string; counted: number; total: number; status: string }[] = [];
    let totalLocAll = 0, totalCountedAll = 0;

    for (const parent of parentsAll) {
      const children = childrenByParent.get(parent.id) ?? [];
      if (children.length === 0) continue;
      const st = deriveStatus(children);
      if (st === "CANCELLED") continue;

      let parentCounted = 0, parentTotal = 0;
      for (const child of children) {
        if (!child.warehouseId) continue;
        const [{ count: tl }] = await db.select({ count: sql<number>`count(*)` }).from(s.locations).where(eq(s.locations.warehouseId, child.warehouseId));
        const locTL = Number(tl);
        const scanned = await db.selectDistinct({ locationId: s.scanRecords.locationId }).from(s.scanRecords).where(sql`${s.scanRecords.projectId} = ${child.id} AND ${s.scanRecords.locationId} IS NOT NULL`);
        const whIds = new Set((await db.select({ id: s.locations.id }).from(s.locations).where(eq(s.locations.warehouseId, child.warehouseId))).map((l) => l.id));
        const counted = scanned.filter((r) => r.locationId && whIds.has(r.locationId)).length;
        parentCounted += counted;
        parentTotal += locTL;
      }
      const pct = parentTotal > 0 ? Math.round((parentCounted / parentTotal) * 100) : 0;

      // warehouse summary for display: "3 gudang" or list names
      const whNames = [...new Set(children.map((c) => c.warehouseId).filter(Boolean))];
      const whList = whNames.length > 0
        ? await db.select({ name: s.warehouses.name }).from(s.warehouses).where(inArray(s.warehouses.id, whNames))
        : [];
      const warehouseLabel = whList.length > 1 ? `${whList.length} gudang` : (whList[0]?.name ?? "—");

      progressRows.push({ id: parent.id, name: parent.name, pct, warehouse: warehouseLabel, counted: parentCounted, total: parentTotal, status: st });
      if (st === "IN_PROGRESS") {
        totalLocAll += parentTotal;
        totalCountedAll += parentCounted;
      }
    }
    progressRows.sort((a, b) => b.pct - a.pct);
    const progressPct = totalLocAll > 0 ? Math.round((totalCountedAll / totalLocAll) * 100) : 0;

    // stock hasil opname per gudang (project terakhir per gudang)
    let whQ = db.select().from(s.warehouses).$dynamic();
    if (!isAdmin) whQ = whQ.where(inArray(s.warehouses.id, warehouseIds));
    const warehouses = await whQ;

    const warehouseOpname: {
      warehouseId: string; warehouseName: string; projectName: string;
      systemQty: number; countedQty: number;
    }[] = [];

    for (const wh of warehouses) {
      const [proj] = await db
        .select({ id: s.projects.id, name: s.projects.name, projectId: s.projects.projectId })
        .from(s.projects)
        .where(sql`${s.projects.warehouseId} = ${wh.id} AND ${s.projects.status} != 'CANCELLED'`)
        .orderBy(sql`${s.projects.createdAt} DESC, ${s.projects.id} DESC`)
        .limit(1);

      let countedQty = 0;
      let systemQty = 0;
      let projectName = "—";

      if (proj) {
        const [parent] = proj.projectId
          ? await db.select({ name: s.opnameProjects.name }).from(s.opnameProjects).where(eq(s.opnameProjects.id, proj.projectId)).limit(1)
          : [null];
        projectName = parent?.name ?? proj.name;
        const [{ cq }] = await db
          .select({ cq: sql<number>`COALESCE(SUM(${s.scanRecords.quantity}), 0)` })
          .from(s.scanRecords)
          .where(eq(s.scanRecords.projectId, proj.id));
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
