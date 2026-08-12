import { Router, type Request } from "express";
import { eq, inArray, or, sql } from "drizzle-orm";
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
    const isAdmin = !req.user || req.user.role === "role_sys_admin";

    function projScopeWhere() {
      if (isAdmin) return undefined;
      const conds: ReturnType<typeof sql>[] = [];
      if (branchIds.length > 0) conds.push(inArray(s.projects.branchId, branchIds));
      if (warehouseIds.length > 0) conds.push(inArray(s.projects.warehouseId, warehouseIds));
      if (conds.length === 0) return sql`FALSE`;
      return conds.length === 1 ? conds[0] : or(...conds);
    }

    // projects with scope
    let projQ = db.select().from(s.projects).$dynamic();
    const pw = projScopeWhere();
    if (pw) projQ = projQ.where(pw);
    const projectsAll = await projQ;

    const active = projectsAll.filter((p) => p.status === "IN_PROGRESS").length;
    const finalCount = projectsAll.filter((p) => p.status === "APPROVED").length;

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

    // top 4 & overall progress
    const progressRows: { id: string; name: string; pct: number; warehouse: string }[] = [];
    let totalLocAll = 0, totalCountedAll = 0;

    for (const p of projectsAll) {
      const [{ count: tl }] = await db.select({ count: sql<number>`count(*)` }).from(s.locations).where(eq(s.locations.warehouseId, p.warehouseId));
      const locTL = Number(tl);
      const scanned = await db.selectDistinct({ locationId: s.scanRecords.locationId }).from(s.scanRecords).where(sql`${s.scanRecords.projectId} = ${p.id} AND ${s.scanRecords.locationId} IS NOT NULL`);
      const whIds = new Set((await db.select({ id: s.locations.id }).from(s.locations).where(eq(s.locations.warehouseId, p.warehouseId))).map((l) => l.id));
      const counted = scanned.filter((r) => r.locationId && whIds.has(r.locationId)).length;
      const pct = locTL > 0 ? Math.round((counted / locTL) * 100) : 0;
      const [wh] = await db.select({ name: s.warehouses.name }).from(s.warehouses).where(eq(s.warehouses.id, p.warehouseId)).limit(1);
      progressRows.push({ id: p.id, name: p.name, pct, warehouse: wh?.name ?? "—" });
      totalLocAll += locTL;
      totalCountedAll += counted;
    }
    progressRows.sort((a, b) => b.pct - a.pct);
    const progressPct = totalLocAll > 0 ? Math.round((totalCountedAll / totalLocAll) * 100) : 0;

    res.json({
      active, final: finalCount, totalScan: Number(totalScan), totalItems: Number(totalItems),
      progressPct, progressCounted: totalCountedAll, progressTotal: totalLocAll,
      recentSessions: recent, projectProgressRows: progressRows.slice(0, 4),
    });
  } catch (e) {
    next(e);
  }
});
