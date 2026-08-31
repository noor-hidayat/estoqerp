import { Router } from "express";
import { and, asc, eq, inArray, sql, count, desc } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import type { NodePgTransaction } from "drizzle-orm/node-postgres/session";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { nextRowId } from "../lib/id";
import { checkPermission, canAccessEntity, isAdminUser } from "../middleware/rbac";
import type { Request, Response } from "express";

const router = Router();

type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

/** Progress per (project, gudang): total & lokasi yang sudah tercount. */
async function whProgress(
  opnameId: string,
  warehouseId: string
): Promise<{ total: number; counted: number; pct: number }> {
  const [locTotal] = await db
    .select({ total: count() })
    .from(schema.locations)
    .where(eq(schema.locations.warehouseId, warehouseId));
  const total = Number(locTotal.total);

  const countedRows = await db
    .selectDistinct({ locationId: schema.opnameScanDetails.locationId })
    .from(schema.opnameScanDetails)
    .where(
      and(
        eq(schema.opnameScanDetails.opnameId, opnameId),
        eq(schema.opnameScanDetails.warehouseId, warehouseId),
        sql`${schema.opnameScanDetails.locationId} IS NOT NULL`
      )
    );
  const counted = countedRows.length;
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
  return { total, counted, pct };
}

/** Scope: id project yang punya minimal 1 warehouse terjangkau. */
async function accessibleProjectIds(req: Request): Promise<string[] | null> {
  if (!req.user) return null;
  if (await isAdminUser(req.user.role)) return null; // null = all
  const whIds = req.accessibleWarehouseIds ?? [];
  if (whIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ opnameId: schema.opnameWarehouses.opnameId })
    .from(schema.opnameWarehouses)
    .where(inArray(schema.opnameWarehouses.warehouseId, whIds));
  return rows.map((r) => r.opnameId).filter((id): id is string => !!id);
}

/* ------------------------------------------------------------------ */
/* POST  /api/opname-projects                                         */
/* ------------------------------------------------------------------ */
router.post("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "create"))) return;

  const body = req.body as {
    name: string;
    deadline?: string | null;
    cutOffDate?: string | null;
    cutOffTime?: string | null;
    description?: string | null;
    mode: "COMPARE" | "SCRATCH";
    warehouses: { warehouseId: string; branchId: string }[];
  };

  if (!body.name || !body.mode || !Array.isArray(body.warehouses) || body.warehouses.length === 0) {
    res.status(400).json({ error: "Nama, mode, dan minimal 1 gudang diperlukan." });
    return;
  }
  if (!body.cutOffDate || !body.cutOffTime) {
    res.status(400).json({ error: "Cut off date dan time wajib diisi." });
    return;
  }

  const isAdmin = await isAdminUser(req.user!.role);
  if (!isAdmin) {
    for (const wh of body.warehouses) {
      const okBranch = await canAccessEntity(req.user!.role, "BRANCH", wh.branchId);
      const okWh = await canAccessEntity(req.user!.role, "WAREHOUSE", wh.warehouseId);
      if (!okBranch || !okWh) {
        res.status(403).json({ error: `Tidak punya akses ke gudang ${wh.warehouseId}.` });
        return;
      }
    }
  }

  const now = new Date();
  const deadline = body.deadline ? new Date(body.deadline) : null;

  try {
    const projectId = await db.transaction(async (tx) => {
      const id = await nextRowId(tx, schema.opnameProjects, "opj", now, { lock: true });
      await tx.insert(schema.opnameProjects).values({
        id,
        name: body.name,
        mode: body.mode,
        status: "DRAFT",
        createdAt: now,
        deadline,
        cutOffDate: body.cutOffDate as string,
        cutOffTime: body.cutOffTime as string,
        createdBy: req.user!.id,
        description: body.description ?? null,
      });

      for (const wh of body.warehouses) {
        await tx.insert(schema.opnameWarehouses).values({
          id: await nextRowId(tx, schema.opnameWarehouses, "opw", now, { lock: true }),
          opnameId: id,
          warehouseId: wh.warehouseId,
          status: "PENDING",
          createdAt: now,
        });
      }
      return id;
    });

    res.status(201).json({ id: projectId });
  } catch (e) {
    console.error("POST opname-projects", e);
    res.status(500).json({ error: "Gagal membuat project." });
  }
});

/* ------------------------------------------------------------------ */
/* GET   /api/opname-projects                                         */
/* ------------------------------------------------------------------ */
router.get("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;

  const accessibleIds = await accessibleProjectIds(req);
  const where = accessibleIds === null ? undefined : inArray(schema.opnameProjects.id, accessibleIds);

  const rows = await db
    .select({
      id: schema.opnameProjects.id,
      name: schema.opnameProjects.name,
      mode: schema.opnameProjects.mode,
      status: schema.opnameProjects.status,
      deadline: schema.opnameProjects.deadline,
      cutOffDate: schema.opnameProjects.cutOffDate,
      cutOffTime: schema.opnameProjects.cutOffTime,
      createdAt: schema.opnameProjects.createdAt,
      createdBy: schema.opnameProjects.createdBy,
      description: schema.opnameProjects.description,
    })
    .from(schema.opnameProjects)
    .where(where)
    .orderBy(desc(schema.opnameProjects.createdAt));

  const result = await Promise.all(
    rows.map(async (proj) => {
      const whs = await db
        .select({
          id: schema.opnameWarehouses.id,
          warehouseId: schema.opnameWarehouses.warehouseId,
          status: schema.opnameWarehouses.status,
          startedAt: schema.opnameWarehouses.startedAt,
          completedAt: schema.opnameWarehouses.completedAt,
        })
        .from(schema.opnameWarehouses)
        .where(eq(schema.opnameWarehouses.opnameId, proj.id))
        .orderBy(desc(schema.opnameWarehouses.createdAt));

      const whIds = whs.map((w) => w.warehouseId);
      const whNames =
        whIds.length > 0
          ? await db
              .select({ id: schema.warehouses.id, name: schema.warehouses.name })
              .from(schema.warehouses)
              .where(inArray(schema.warehouses.id, whIds))
          : [];
      const whNameMap = new Map(whNames.map((w) => [w.id, w.name]));

      let totalLokasi = 0;
      let countedLokasi = 0;
      const warehouses = await Promise.all(
        whs.map(async (w) => {
          const prog = await whProgress(proj.id, w.warehouseId);
          totalLokasi += prog.total;
          countedLokasi += prog.counted;
          return {
            id: w.id,
            warehouseId: w.warehouseId,
            warehouseName: whNameMap.get(w.warehouseId) ?? "—",
            status: w.status,
            pct: prog.pct,
            countedLokasi: prog.counted,
            totalLokasi: prog.total,
          };
        })
      );

      const pct = totalLokasi > 0 ? Math.round((countedLokasi / totalLokasi) * 100) : 0;

      return {
        ...proj,
        jumlahGudang: warehouses.length,
        progress: { counted: countedLokasi, total: totalLokasi, pct },
        warehouses,
      };
    })
  );

  res.json(result);
});

/* ------------------------------------------------------------------ */
/* GET   /api/opname-projects/:id                                     */
/* ------------------------------------------------------------------ */
router.get("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;

  const id = String(req.params.id);
  const [row] = await db
    .select()
    .from(schema.opnameProjects)
    .where(eq(schema.opnameProjects.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Project tidak ditemukan." });
    return;
  }

  const accessibleIds = await accessibleProjectIds(req);
  if (accessibleIds !== null && !accessibleIds.includes(id)) {
    res.status(403).json({ error: "Tidak memiliki akses." });
    return;
  }

  res.json(row);
});

/* ------------------------------------------------------------------ */
/* GET   /api/opname-projects/:id/detail                             */
/* ------------------------------------------------------------------ */
router.get("/:id/detail", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;

  const projectId = String(req.params.id);

  const [parent] = await db
    .select()
    .from(schema.opnameProjects)
    .where(eq(schema.opnameProjects.id, projectId))
    .limit(1);

  if (!parent) {
    res.status(404).json({ error: "Project tidak ditemukan." });
    return;
  }

  const accessibleIds = await accessibleProjectIds(req);
  if (accessibleIds !== null && !accessibleIds.includes(projectId)) {
    res.status(403).json({ error: "Tidak memiliki akses." });
    return;
  }

  const whs = await db
    .select({
      id: schema.opnameWarehouses.id,
      warehouseId: schema.opnameWarehouses.warehouseId,
      status: schema.opnameWarehouses.status,
      startedAt: schema.opnameWarehouses.startedAt,
      completedAt: schema.opnameWarehouses.completedAt,
      createdAt: schema.opnameWarehouses.createdAt,
    })
    .from(schema.opnameWarehouses)
    .where(eq(schema.opnameWarehouses.opnameId, projectId))
    .orderBy(desc(schema.opnameWarehouses.createdAt));

  const whIds = whs.map((w) => w.warehouseId);
  const whNames =
    whIds.length > 0
      ? await db
          .select({ id: schema.warehouses.id, name: schema.warehouses.name, branchId: schema.warehouses.branchId })
          .from(schema.warehouses)
          .where(inArray(schema.warehouses.id, whIds))
      : [];
  const whMap = new Map(whNames.map((w) => [w.id, w]));
  const branchIds = [...new Set(whNames.map((w) => w.branchId))];
  const branchNames =
    branchIds.length > 0
      ? await db
          .select({ id: schema.branches.id, name: schema.branches.name })
          .from(schema.branches)
          .where(inArray(schema.branches.id, branchIds))
      : [];
  const branchMap = new Map(branchNames.map((b) => [b.id, b.name]));

  const warehouses = await Promise.all(
    whs.map(async (w) => {
      const prog = await whProgress(projectId, w.warehouseId);
      const wh = whMap.get(w.warehouseId);
      return {
        ...w,
        warehouseName: wh?.name ?? "—",
        branchName: (wh && branchMap.get(wh.branchId)) ?? "—",
        totalLokasi: prog.total,
        countedLokasi: prog.counted,
        pct: prog.pct,
      };
    })
  );

  const totalLokasi = warehouses.reduce((s, w) => s + w.totalLokasi, 0);
  const countedLokasi = warehouses.reduce((s, w) => s + w.countedLokasi, 0);
  const pct = totalLokasi > 0 ? Math.round((countedLokasi / totalLokasi) * 100) : 0;

  res.json({
    parent,
    warehouses,
    summary: {
      jumlahGudang: warehouses.length,
      totalLokasi,
      countedLokasi,
      pct,
      status: parent.status,
    },
  });
});

/* ------------------------------------------------------------------ */
/* GET   /api/opname-projects/:id/scans                              */
/* ------------------------------------------------------------------ */
// Riwayat scan project: header scan + agregat detail (barcode/qty/item
// terakhir, gudang & lokasi yang tersentuh) + nama user/lokasi.
router.get("/:id/scans", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;

  const projectId = String(req.params.id);
  const [project] = await db
    .select({ id: schema.opnameProjects.id })
    .from(schema.opnameProjects)
    .where(eq(schema.opnameProjects.id, projectId))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project tidak ditemukan." }); return; }

  const scans = await db
    .select({
      id: schema.opnameScans.id,
      opnameId: schema.opnameScans.opnameId,
      scannedBy: schema.opnameScans.scannedBy,
      status: schema.opnameScans.status,
      startedAt: schema.opnameScans.startedAt,
      completedAt: schema.opnameScans.completedAt,
      userName: schema.users.name,
    })
    .from(schema.opnameScans)
    .leftJoin(schema.users, eq(schema.opnameScans.scannedBy, schema.users.id))
    .where(eq(schema.opnameScans.opnameId, projectId))
    .orderBy(desc(schema.opnameScans.startedAt), desc(schema.opnameScans.id));

  const [projAgg] = await db
    .select({
      barcodes: sql<number>`count(*)`,
      qty: sql<number>`coalesce(sum(${schema.opnameScanDetails.quantity}), 0)`,
      itemCount: sql<number>`count(distinct ${schema.opnameScanDetails.itemId})`,
    })
    .from(schema.opnameScanDetails)
    .where(eq(schema.opnameScanDetails.opnameId, projectId));

  const aggMap = new Map<string, { barcodes: number; qty: number; itemCount: number }>();
  const scansAll = scans.length > 0 ? scans : [];
  if (scansAll.length > 0) {
    const scanIds = scansAll.map((x) => x.id);
    const aggRows = await db
      .select({
        scanId: schema.opnameScanDetails.scanId,
        barcodes: sql<number>`count(*)`,
        qty: sql<number>`coalesce(sum(${schema.opnameScanDetails.quantity}), 0)`,
        itemCount: sql<number>`count(distinct ${schema.opnameScanDetails.itemId})`,
      })
      .from(schema.opnameScanDetails)
      .where(inArray(schema.opnameScanDetails.scanId, scanIds))
      .groupBy(schema.opnameScanDetails.scanId);
    for (const r of aggRows) aggMap.set(r.scanId, r);

    const whRows = await db
      .selectDistinct({
        scanId: schema.opnameScanDetails.scanId,
        warehouseId: schema.opnameScanDetails.warehouseId,
        warehouseName: schema.warehouses.name,
      })
      .from(schema.opnameScanDetails)
      .leftJoin(schema.warehouses, eq(schema.warehouses.id, schema.opnameScanDetails.warehouseId))
      .where(inArray(schema.opnameScanDetails.scanId, scanIds));
    const whByScan = new Map<string, string[]>();
    for (const r of whRows) {
      const list = whByScan.get(r.scanId) ?? [];
      if (r.warehouseName && !list.includes(r.warehouseName)) list.push(r.warehouseName);
      whByScan.set(r.scanId, list);
    }

    const locRows = await db
      .selectDistinct({
        scanId: schema.opnameScanDetails.scanId,
        locationId: schema.opnameScanDetails.locationId,
        locationCode: schema.locations.code,
      })
      .from(schema.opnameScanDetails)
      .leftJoin(schema.locations, eq(schema.locations.id, schema.opnameScanDetails.locationId))
      .where(inArray(schema.opnameScanDetails.scanId, scanIds));
    const locByScan = new Map<string, string[]>();
    for (const r of locRows) {
      if (!r.locationId) continue;
      const list = locByScan.get(r.scanId) ?? [];
      if (r.locationCode && !list.includes(r.locationCode)) list.push(r.locationCode);
      locByScan.set(r.scanId, list);
    }

    const lastRows = await db
      .selectDistinctOn([schema.opnameScanDetails.scanId], {
        scanId: schema.opnameScanDetails.scanId,
        itemId: schema.opnameScanDetails.itemId,
        itemName: schema.items.name,
        itemUnit: schema.uom.name,
      })
      .from(schema.opnameScanDetails)
      .leftJoin(schema.items, eq(schema.opnameScanDetails.itemId, schema.items.id))
      .leftJoin(schema.uom, eq(schema.uom.id, schema.items.uomId))
      .where(inArray(schema.opnameScanDetails.scanId, scanIds))
      .orderBy(
        asc(schema.opnameScanDetails.scanId),
        desc(schema.opnameScanDetails.scannedAt),
        desc(schema.opnameScanDetails.id)
      );
    const lastMap = new Map(lastRows.filter((r) => !!r.scanId).map((r) => [r.scanId as string, r]));

    const enriched = scans.map((sess) => {
      const agg = aggMap.get(sess.id);
      const last = lastMap.get(sess.id);
      return {
        ...sess,
        userName: sess.userName ?? "—",
        barcodes: Number(agg?.barcodes ?? 0),
        qty: Number(agg?.qty ?? 0),
        itemCount: Number(agg?.itemCount ?? 0),
        warehouses: whByScan.get(sess.id) ?? [],
        locations: locByScan.get(sess.id) ?? [],
        lastItemId: last?.itemId ?? null,
        lastItemName: last?.itemName ?? "—",
        lastItemUnit: last?.itemUnit ?? "—",
      };
    });
    res.json({
      scans: enriched,
      totalBarcodes: Number(projAgg?.barcodes ?? 0),
      totalQty: Number(projAgg?.qty ?? 0),
      itemCount: Number(projAgg?.itemCount ?? 0),
    });
    return;
  }

  res.json({ scans: [], totalBarcodes: 0, totalQty: 0, itemCount: 0 });
});

/* ------------------------------------------------------------------ */
/* GET   /api/opname-projects/:id/stats                              */
/* ------------------------------------------------------------------ */
// Progress per gudang + variance per (item, gudang):
// systemQty dari stock_balances, countedQty dari scan detail
// (scan berstatus bukan CANCELED).
router.get("/:id/stats", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;

  const projectId = String(req.params.id);
  const [project] = await db
    .select({ id: schema.opnameProjects.id })
    .from(schema.opnameProjects)
    .where(eq(schema.opnameProjects.id, projectId))
    .limit(1);
  if (!project) { res.status(404).json({ error: "Project tidak ditemukan." }); return; }

  const whs = await db
    .select({ id: schema.opnameWarehouses.id, warehouseId: schema.opnameWarehouses.warehouseId })
    .from(schema.opnameWarehouses)
    .where(eq(schema.opnameWarehouses.opnameId, projectId));

  const warehouseIds = whs.map((w) => w.warehouseId);
  const whNames =
    warehouseIds.length > 0
      ? await db
          .select({ id: schema.warehouses.id, name: schema.warehouses.name })
          .from(schema.warehouses)
          .where(inArray(schema.warehouses.id, warehouseIds))
      : [];
  const whNameMap = new Map(whNames.map((w) => [w.id, w.name]));

  // Progress lokasi per gudang.
  let totalLoc = 0;
  let countedLoc = 0;
  const progressByWh: Record<string, { total: number; counted: number; pct: number }> = {};
  for (const wh of whs) {
    const prog = await whProgress(projectId, wh.warehouseId);
    progressByWh[wh.warehouseId] = prog;
    totalLoc += prog.total;
    countedLoc += prog.counted;
  }
  const pct = totalLoc > 0 ? Math.round((countedLoc / totalLoc) * 100) : 0;

  // countedQty per item per gudang — hanya scan bukan CANCELED.
  const countedRows = warehouseIds.length > 0
    ? await db
        .select({
          itemId: schema.opnameScanDetails.itemId,
          warehouseId: schema.opnameScanDetails.warehouseId,
          qty: sql<number>`coalesce(sum(${schema.opnameScanDetails.quantity}), 0)`,
        })
        .from(schema.opnameScanDetails)
        .leftJoin(schema.opnameScans, eq(schema.opnameScans.id, schema.opnameScanDetails.scanId))
        .where(
          and(
            eq(schema.opnameScanDetails.opnameId, projectId),
            sql`${schema.opnameScans.status} != 'CANCELED'`
          )
        )
        .groupBy(schema.opnameScanDetails.itemId, schema.opnameScanDetails.warehouseId)
    : [];

  // systemQty per item per gudang dari stock_balances.
  const balances = warehouseIds.length > 0
    ? await db
        .select({ itemId: schema.stockBalances.itemId, warehouseId: schema.stockBalances.warehouseId, closingQty: schema.stockBalances.closingQty })
        .from(schema.stockBalances)
        .where(inArray(schema.stockBalances.warehouseId, warehouseIds))
    : [];

  const countedByKey = new Map<string, number>();
  for (const r of countedRows) {
    countedByKey.set(`${r.itemId}|${r.warehouseId}`, Number(r.qty));
  }
  const stockByKey = new Map<string, number>();
  for (const sb of balances) {
    const key = `${sb.itemId}|${sb.warehouseId}`;
    stockByKey.set(key, (stockByKey.get(key) ?? 0) + sb.closingQty);
  }

  const keys = new Set([...stockByKey.keys(), ...countedByKey.keys()]);
  const itemsAll = await db.select({ id: schema.items.id, code: schema.items.code, name: schema.items.name, uomId: schema.items.uomId }).from(schema.items);
  const uomsAll = await db.select({ id: schema.uom.id, name: schema.uom.name }).from(schema.uom);
  const itemById = new Map(itemsAll.map((i) => [i.id, i]));
  const uomById = new Map(uomsAll.map((u) => [u.id, u]));

  const variance: {
    itemId: string; itemCode: string; itemName: string; unit: string;
    warehouseId: string; warehouseName: string;
    systemQty: number; countedQty: number; diff: number;
  }[] = [];

  for (const key of keys) {
    const [itemId, warehouseId] = key.split("|");
    const item = itemById.get(itemId);
    if (!item) continue;
    const systemQty = stockByKey.get(key) ?? 0;
    const countedQty = countedByKey.get(key) ?? 0;
    variance.push({
      itemId,
      itemCode: item.code,
      itemName: item.name,
      unit: item.uomId ? (uomById.get(item.uomId)?.name ?? "—") : "—",
      warehouseId,
      warehouseName: whNameMap.get(warehouseId) ?? "—",
      systemQty,
      countedQty,
      diff: countedQty - systemQty,
    });
  }
  variance.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  res.json({
    projectId,
    progress: { total: totalLoc, counted: countedLoc, pct },
    progressByWh,
    variance,
  });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/opname-projects/:id                                     */
/* ------------------------------------------------------------------ */
router.patch("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "update"))) return;

  const { name, deadline, cutOffDate, cutOffTime, description, status } = req.body as {
    name?: string;
    deadline?: string | null;
    cutOffDate?: string | null;
    cutOffTime?: string | null;
    description?: string | null;
    status?: string;
  };
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (deadline !== undefined) patch.deadline = deadline ? new Date(deadline) : null;
  if (cutOffDate !== undefined) (patch as Record<string, unknown>).cutOffDate = cutOffDate;
  if (cutOffTime !== undefined) (patch as Record<string, unknown>).cutOffTime = cutOffTime;
  if (description !== undefined) patch.description = description;
  if (status !== undefined) {
    if (!["DRAFT", "IN_PROGRESS", "APPROVED", "CANCELLED"].includes(status)) {
      res.status(400).json({ error: "Status tidak valid." });
      return;
    }
    patch.status = status;
    patch.updatedAt = new Date();
  }

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "Tidak ada field yang diupdate." });
    return;
  }

  const id = String(req.params.id);
  const [existing] = await db
    .select({ id: schema.opnameProjects.id })
    .from(schema.opnameProjects)
    .where(eq(schema.opnameProjects.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Project tidak ditemukan." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.opnameProjects)
        .set(patch)
        .where(eq(schema.opnameProjects.id, id));
      if (status === "APPROVED" || status === "CANCELLED") {
        await tx
          .update(schema.opnameWarehouses)
          .set({
            status: status === "APPROVED" ? "COMPLETED" : "CANCELLED",
            completedAt: new Date(),
          })
          .where(eq(schema.opnameWarehouses.opnameId, id));
      }
    });
    res.json({ ok: true });
  } catch (e) {
    console.error("PATCH opname-projects", e);
    res.status(500).json({ error: "Gagal mengupdate project." });
  }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/opname-projects/:id                                    */
/* ------------------------------------------------------------------ */
router.delete("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "delete"))) return;

  const projectId = String(req.params.id);

  const [existing] = await db
    .select({ id: schema.opnameProjects.id })
    .from(schema.opnameProjects)
    .where(eq(schema.opnameProjects.id, projectId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Project tidak ditemukan." });
    return;
  }

  try {
    // opname_warehouses / opname_scans / opname_scan_details ter-cascade via FK.
    await db.delete(schema.opnameProjects).where(eq(schema.opnameProjects.id, projectId));
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE opname-projects", e);
    res.status(500).json({ error: "Gagal menghapus project." });
  }
});

export default router;