import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { nextSocId } from "../lib/id";
import { checkPermission } from "../middleware/rbac";
import type { Request, Response } from "express";

const router = Router();

// Helper: build cutOffAt datetime from project's cutOffDate + cutOffTime
function cutOffAtOf(project: { cutOffDate: string | Date | null; cutOffTime: string | null }): Date | null {
  if (!project.cutOffDate || !project.cutOffTime) return null;
  const d = typeof project.cutOffDate === "string" ? project.cutOffDate : project.cutOffDate.toISOString().slice(0, 10);
  // cutOffTime may be HH:mm or HH:mm:ss
  const t = project.cutOffTime.includes(":") ? project.cutOffTime : `${project.cutOffTime}:00`;
  const iso = `${d}T${t.length === 5 ? t + ":00" : t}`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

/* ------------------------------------------------------------------ */
/* POST  /api/opname-counts                                           */
/* ------------------------------------------------------------------ */
router.post("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "create"))) return;

  const body = req.body as {
    projectId: string;
    warehouseId: string;
    postingDate?: string | null;
    postingTime?: string | null;
    cutOffDate?: string | null;
    cutOffTime?: string | null;
    notes?: string | null;
    details: { itemId: string; qty: number | string; batch?: string | null; uomId?: string | null }[];
  };

  if (!body.projectId || !body.warehouseId) {
    res.status(400).json({ error: "projectId dan warehouseId wajib." });
    return;
  }
  if (!Array.isArray(body.details) || body.details.length === 0) {
    res.status(400).json({ error: "Minimal 1 baris item diperlukan." });
    return;
  }

  const [project] = await db
    .select()
    .from(schema.opnameProjects)
    .where(eq(schema.opnameProjects.id, body.projectId))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Project tidak ditemukan." });
    return;
  }

  // Validasi COMPARE: untuk DRAFT boleh simpan dulu, validasi hanya saat POSTED
  // Untuk sekarang DRAFT tidak di-block, hanya log warning bila stock belum ada sebelum cutOff
  if (project.mode === "COMPARE") {
    const cutOffAt = cutOffAtOf(project as unknown as { cutOffDate: string | null; cutOffTime: string | null });
    if (!cutOffAt) {
      // Project lama mungkin belum punya cutOff, allow draft
      console.warn(`Project ${project.id} COMPARE tanpa cutOff, skip validasi`);
    } else {
      for (const d of body.details) {
        if (!d.itemId) continue;
        const ledger = await db
          .select({ id: schema.stockLedger.id })
          .from(schema.stockLedger)
          .where(
            and(
              eq(schema.stockLedger.itemId, d.itemId),
              eq(schema.stockLedger.warehouseId, body.warehouseId),
              sql`${schema.stockLedger.qtyIn} > 0`,
              sql`${schema.stockLedger.transactionDate} < ${cutOffAt.toISOString()}`
            )
          )
          .limit(1);
        if (ledger.length === 0) {
          console.warn(`COMPARE draft: Item ${d.itemId} belum ada stock masuk sebelum cutOff ${cutOffAt.toISOString()} — tetap simpan sebagai DRAFT`);
          // Jangan return error untuk DRAFT, hanya warning
        }
      }
    }
  }

  // Tentukan tanggal untuk SOC id: pakai postingDate atau cutOffDate atau now
  const socDateStr = body.postingDate || (project.cutOffDate as unknown as string) || new Date().toISOString().slice(0, 10);
  const socDate = new Date(socDateStr);

  try {
    const countId = await db.transaction(async (tx) => {
      const id = await nextSocId(tx, schema.opnameCounts, socDate, { lock: true });
      const now = new Date();
      await tx.insert(schema.opnameCounts).values({
        id,
        projectId: body.projectId,
        warehouseId: body.warehouseId,
        postingDate: body.postingDate || null,
        postingTime: body.postingTime || null,
        cutOffDate: body.cutOffDate || (project.cutOffDate as unknown as string) || null,
        cutOffTime: body.cutOffTime || (project.cutOffTime as unknown as string) || null,
        notes: body.notes ?? null,
        status: "DRAFT",
        createdBy: req.user!.id,
        createdAt: now,
        updatedAt: now,
      });
      for (const d of body.details) {
        if (!d.itemId) continue;
        const qty = String(d.qty);
        await tx.insert(schema.opnameCountDetails).values({
          id: `${id}-${Math.random().toString(36).slice(2, 8)}`, // simple unique per detail, bisa pakai nextRowId jika mau
          countId: id,
          itemId: d.itemId,
          qty,
          batch: d.batch ?? null,
          uomId: d.uomId ?? null,
          warehouseId: body.warehouseId,
        });
      }
      return id;
    });
    res.status(201).json({ id: countId });
  } catch (e) {
    console.error("POST opname-counts", e);
    res.status(500).json({ error: "Gagal membuat count." });
  }
});

/* ------------------------------------------------------------------ */
/* GET   /api/opname-counts                                            */
/* ------------------------------------------------------------------ */
router.get("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;

  const rows = await db
    .select()
    .from(schema.opnameCounts)
    .orderBy(desc(schema.opnameCounts.createdAt));

  // Enrich with project/warehouse names and auditor
  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouseId))];
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean) as string[])];

  const projects = projectIds.length
    ? await db.select({ id: schema.opnameProjects.id, name: schema.opnameProjects.name }).from(schema.opnameProjects).where(inArray(schema.opnameProjects.id, projectIds))
    : [];
  const warehouses = warehouseIds.length
    ? await db.select({ id: schema.warehouses.id, name: schema.warehouses.name }).from(schema.warehouses).where(inArray(schema.warehouses.id, warehouseIds))
    : [];
  const users = userIds.length
    ? await db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds))
    : [];

  const pMap = new Map(projects.map((p) => [p.id, p.name]));
  const wMap = new Map(warehouses.map((w) => [w.id, w.name]));
  const uMap = new Map(users.map((u) => [u.id, u.name]));

  const result = rows.map((r) => ({
    ...r,
    projectName: pMap.get(r.projectId) ?? "—",
    warehouseName: wMap.get(r.warehouseId) ?? "—",
    auditor: r.createdBy ? (uMap.get(r.createdBy) ?? r.createdBy) : "—",
  }));

  res.json(result);
});

/* ------------------------------------------------------------------ */
/* GET   /api/opname-counts/:id                                        */
/* ------------------------------------------------------------------ */
router.get("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;
  const id = String(req.params.id);
  const [row] = await db.select().from(schema.opnameCounts).where(eq(schema.opnameCounts.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Count tidak ditemukan." });
    return;
  }
  const details = await db.select().from(schema.opnameCountDetails).where(eq(schema.opnameCountDetails.countId, id));
  res.json({ ...row, details });
});

/* ------------------------------------------------------------------ */
/* PATCH /api/opname-counts/:id                                        */
/* ------------------------------------------------------------------ */
router.patch("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "update"))) return;
  const id = String(req.params.id);
  const patch = req.body as Record<string, unknown> & { details?: { itemId: string; qty: number | string; batch?: string | null; uomId?: string | null }[] };
  // Only allow certain fields
  const allowed = ["postingDate", "postingTime", "cutOffDate", "cutOffTime", "notes", "status", "warehouseId", "projectId"];
  const toUpdate: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) toUpdate[k] = patch[k];
  const hasDetails = Array.isArray(patch.details);
  if (Object.keys(toUpdate).length === 0 && !hasDetails) {
    res.status(400).json({ error: "Tidak ada field yang diupdate." });
    return;
  }

  // Jika status akan jadi POSTED, validasi COMPARE stock di bawah cutOff
  if (patch.status === "POSTED") {
    const [existing] = await db.select().from(schema.opnameCounts).where(eq(schema.opnameCounts.id, id)).limit(1);
    if (!existing) {
      res.status(404).json({ error: "Count tidak ditemukan." });
      return;
    }
    const [project] = await db.select().from(schema.opnameProjects).where(eq(schema.opnameProjects.id, (patch.projectId as string) ?? existing.projectId)).limit(1);
    if (project?.mode === "COMPARE") {
      const cutOffAt = cutOffAtOf(project as unknown as { cutOffDate: string | null; cutOffTime: string | null });
      if (!cutOffAt) {
        res.status(400).json({ error: "Project COMPARE wajib punya cut off." });
        return;
      }
      const detailsToCheck = hasDetails ? patch.details! : await db.select().from(schema.opnameCountDetails).where(eq(schema.opnameCountDetails.countId, id));
      const warehouseId = (patch.warehouseId as string) ?? existing.warehouseId;
      for (const d of detailsToCheck as unknown as { itemId: string }[]) {
        if (!d.itemId) continue;
        const ledger = await db
          .select({ id: schema.stockLedger.id })
          .from(schema.stockLedger)
          .where(
            and(
              eq(schema.stockLedger.itemId, d.itemId),
              eq(schema.stockLedger.warehouseId, warehouseId),
              sql`${schema.stockLedger.qtyIn} > 0`,
              sql`${schema.stockLedger.transactionDate} < ${cutOffAt.toISOString()}`
            )
          )
          .limit(1);
        if (ledger.length === 0) {
          res.status(400).json({
            error: `Item ${d.itemId} tidak ada stock masuk sebelum cut off ${cutOffAt.toLocaleString("id-ID")} — COMPARE hanya boleh hitung stock di bawah cut off.`,
          });
          return;
        }
      }
    }
  }

  await db.transaction(async (tx) => {
    if (Object.keys(toUpdate).length > 0) {
      (toUpdate as Record<string, unknown>).updatedAt = new Date();
      await tx.update(schema.opnameCounts).set(toUpdate).where(eq(schema.opnameCounts.id, id));
    }
    if (hasDetails) {
      await tx.delete(schema.opnameCountDetails).where(eq(schema.opnameCountDetails.countId, id));
      for (const d of patch.details!) {
        if (!d.itemId) continue;
        await tx.insert(schema.opnameCountDetails).values({
          id: `${id}-${Math.random().toString(36).slice(2, 8)}`,
          countId: id,
          itemId: d.itemId,
          qty: String(d.qty),
          batch: d.batch ?? null,
          uomId: d.uomId ?? null,
          warehouseId: (patch.warehouseId as string) ?? (await tx.select({ warehouseId: schema.opnameCounts.warehouseId }).from(schema.opnameCounts).where(eq(schema.opnameCounts.id, id)).limit(1).then(r=>r[0]?.warehouseId) ?? ""),
        });
      }
    }
  });
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ */
/* DELETE /api/opname-counts/:id                                       */
/* ------------------------------------------------------------------ */
router.delete("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "delete"))) return;
  const id = String(req.params.id);
  await db.delete(schema.opnameCounts).where(eq(schema.opnameCounts.id, id));
  res.json({ ok: true });
});

export default router;
