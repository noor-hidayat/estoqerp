import { Router } from "express";
import { and, eq, inArray, sql, count, desc } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import type { NodePgTransaction } from "drizzle-orm/node-postgres/session";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { checkPermission, canAccessEntity, isAdminUser } from "../middleware/rbac";
import type { Request, Response } from "express";

const router = Router();

type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;

async function nextPrjId(tx: Tx): Promise<string> {
  await tx.execute(sql`LOCK TABLE opname_projects IN EXCLUSIVE MODE`);
  const rows = await tx.select({ id: schema.opnameProjects.id }).from(schema.opnameProjects);
  const prefix = "PRJ-";
  const max = rows.reduce((m, r) => {
    const id = String(r.id);
    if (!id.startsWith(prefix)) return m;
    const n = Number(id.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

async function nextSopId(tx: Tx): Promise<string> {
  await tx.execute(sql`LOCK TABLE projects IN EXCLUSIVE MODE`);
  const rows = await tx.select({ id: schema.projects.id }).from(schema.projects);
  const max = rows.reduce((m, r) => {
    const id = String(r.id);
    const n = id.startsWith("SOP-") ? Number(id.slice(4)) : Number(id);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `SOP-${String(max + 1).padStart(3, "0")}`;
}

function deriveStatus(children: { status: string }[]): string {
  const all = children.map((c) => c.status);
  if (all.length === 0) return "DRAFT";
  if (all.every((s) => s === "APPROVED")) return "APPROVED";
  if (all.every((s) => s === "CANCELLED")) return "CANCELLED";
  if (all.some((s) => s === "IN_PROGRESS")) return "IN_PROGRESS";
  return all[0];
}

/** Scope subquery: project ids yang punya minimal 1 child project di warehouse terjangkau */
async function accessibleProjectIds(req: Request): Promise<string[] | null> {
  if (!req.user) return null;
  if (await isAdminUser(req.user.role)) return null; // null = all
  const whIds = req.accessibleWarehouseIds ?? [];
  if (whIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ projectId: schema.projects.projectId })
    .from(schema.projects)
    .where(inArray(schema.projects.warehouseId, whIds));
  return rows.map((r) => r.projectId).filter((id): id is string => !!id);
}

/* ------------------------------------------------------------------ */
/* POST  /api/opname-projects                                         */
/* ------------------------------------------------------------------ */
router.post("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "create"))) return;

  const body = req.body as {
    name: string;
    deadline?: string | null;
    mode: "COMPARE" | "SCRATCH";
    warehouses: { warehouseId: string; branchId: string }[];
  };

  if (!body.name || !body.mode || !Array.isArray(body.warehouses) || body.warehouses.length === 0) {
    res.status(400).json({ error: "Nama, mode, dan minimal 1 gudang diperlukan." });
    return;
  }

  // Validate entity access per warehouse (system admin punya akses penuh)
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
    const parentId = await db.transaction(async (tx) => {
      // Insert parent
      const parentId = await nextPrjId(tx);
      await tx.insert(schema.opnameProjects).values({
        id: parentId,
        name: body.name,
        createdAt: now,
        deadline,
        createdBy: req.user!.id,
      });

      // Insert one project (stock opname) per warehouse
      for (const wh of body.warehouses) {
        const sopId = await nextSopId(tx);
        await tx.insert(schema.projects).values({
          id: sopId,
          name: `${body.name} — ${wh.warehouseId}`,
          projectId: parentId,
          branchId: wh.branchId,
          warehouseId: wh.warehouseId,
          mode: body.mode,
          status: "DRAFT",
          createdAt: now,
          deadline,
          createdBy: req.user!.id,
        });
      }

      return parentId;
    });

    res.status(201).json({ id: parentId });
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
      deadline: schema.opnameProjects.deadline,
      createdAt: schema.opnameProjects.createdAt,
    })
    .from(schema.opnameProjects)
    .where(where)
    .orderBy(desc(schema.opnameProjects.createdAt));

  // Aggregate per project
  const result = await Promise.all(
    rows.map(async (proj) => {
      const children = await db
        .select({
          id: schema.projects.id,
          warehouseId: schema.projects.warehouseId,
          status: schema.projects.status,
        })
        .from(schema.projects)
        .where(eq(schema.projects.projectId, proj.id));

      const whIds = children.map((c) => c.warehouseId).filter(Boolean);
      const whNames =
        whIds.length > 0
          ? await db
              .select({ id: schema.warehouses.id, name: schema.warehouses.name })
              .from(schema.warehouses)
              .where(inArray(schema.warehouses.id, whIds))
          : [];
      const whMap = new Map(whNames.map((w) => [w.id, w.name]));

      // Total & counted locations per child
      let totalLokasi = 0;
      let countedLokasi = 0;
      for (const child of children) {
        if (!child.warehouseId) continue;
        const [locTotal] = await db
          .select({ total: count() })
          .from(schema.locations)
          .where(eq(schema.locations.warehouseId, child.warehouseId));
        totalLokasi += Number(locTotal.total);

        const countedRows = await db
          .selectDistinct({ locationId: schema.scanRecords.locationId })
          .from(schema.scanRecords)
          .where(eq(schema.scanRecords.projectId, child.id));
        // Only count locations that actually belong to this warehouse (scanRecords can have null locationId)
        const validCounted = countedRows.filter((r) => !!r.locationId).length;
        countedLokasi += validCounted;
      }

      const pct = totalLokasi > 0 ? Math.round((countedLokasi / totalLokasi) * 100) : 0;

      return {
        ...proj,
        jumlahGudang: children.length,
        status: deriveStatus(children),
        progress: { counted: countedLokasi, total: totalLokasi, pct },
        warehouses: children.map((c) => ({
          id: c.id,
          warehouseName: whMap.get(c.warehouseId) ?? "—",
          status: c.status,
        })),
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

  // Scope check for non-admin
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

  const children = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      warehouseId: schema.projects.warehouseId,
      branchId: schema.projects.branchId,
      mode: schema.projects.mode,
      status: schema.projects.status,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .where(eq(schema.projects.projectId as any, projectId))
    .orderBy(desc(schema.projects.createdAt));

  const whIds = [...new Set(children.map((c) => c.warehouseId).filter(Boolean))];
  const whNames =
    whIds.length > 0
      ? await db
          .select({ id: schema.warehouses.id, name: schema.warehouses.name })
          .from(schema.warehouses)
          .where(inArray(schema.warehouses.id, whIds))
      : [];
  const whMap = new Map(whNames.map((w) => [w.id, w.name]));

  const branchIds = [...new Set(children.map((c) => c.branchId).filter(Boolean))];
  const branchNames =
    branchIds.length > 0
      ? await db
          .select({ id: schema.branches.id, name: schema.branches.name })
          .from(schema.branches)
          .where(inArray(schema.branches.id, branchIds))
      : [];
  const branchMap = new Map(branchNames.map((b) => [b.id, b.name]));

  // Per-child stats
  const childRows = await Promise.all(
    children.map(async (child) => {
      const whId = child.warehouseId;
      if (!whId) return { ...child, totalLokasi: 0, countedLokasi: 0, pct: 0, warehouseName: "—", branchName: "—" };

      const [locTotal] = await db
        .select({ total: count() })
        .from(schema.locations)
        .where(eq(schema.locations.warehouseId, whId));
      const totalLokasi = Number(locTotal.total);

      const countedRows = await db
        .selectDistinct({ locationId: schema.scanRecords.locationId })
        .from(schema.scanRecords)
        .where(eq(schema.scanRecords.projectId, child.id));
      const countedLokasi = countedRows.filter((r) => !!r.locationId).length;
      const pct = totalLokasi > 0 ? Math.round((countedLokasi / totalLokasi) * 100) : 0;

      return {
        ...child,
        totalLokasi,
        countedLokasi,
        pct,
        warehouseName: whMap.get(whId) ?? "—",
        branchName: branchMap.get(child.branchId) ?? "—",
      };
    })
  );

  const totalLokasi = childRows.reduce((s, c) => s + c.totalLokasi, 0);
  const countedLokasi = childRows.reduce((s, c) => s + c.countedLokasi, 0);
  const pct = totalLokasi > 0 ? Math.round((countedLokasi / totalLokasi) * 100) : 0;

  res.json({
    parent,
    children: childRows,
    summary: {
      jumlahGudang: children.length,
      totalLokasi,
      countedLokasi,
      pct,
      status: deriveStatus(children),
    },
  });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/opname-projects/:id                                     */
/* ------------------------------------------------------------------ */
router.patch("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "update"))) return;

  const { name, deadline } = req.body as { name?: string; deadline?: string | null };
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (deadline !== undefined) patch.deadline = deadline ? new Date(deadline) : null;

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
    await db
      .update(schema.opnameProjects)
      .set(patch)
      .where(eq(schema.opnameProjects.id, id));
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
    await db.transaction(async (tx) => {
      // Delete child projects (cascades sessions/records/entries via FK)
      const children = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.projectId as any, projectId));

      for (const child of children) {
        await tx.delete(schema.projects).where(eq(schema.projects.id, child.id));
      }

      // Delete parent
      await tx.delete(schema.opnameProjects).where(eq(schema.opnameProjects.id, projectId));
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE opname-projects", e);
    res.status(500).json({ error: "Gagal menghapus project." });
  }
});

export default router;
