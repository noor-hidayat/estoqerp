// @ts-nocheck
import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { checkPermission } from "../middleware/rbac";
import { logActivity, getActorInfo } from "../lib/activity-log";
import { computeDiff, diffLines, DIFF_DENYLIST } from "../lib/diff";
import type { Request, Response } from "express";

const router = Router();

function isUuid(v: string): boolean { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v); }
async function resolveProjectId(val: string): Promise<number|null> {
  if (isUuid(val)) { const [r]=await db.select({id: schema.opnameProjects.id}).from(schema.opnameProjects).where(eq(schema.opnameProjects.publicId, val)).limit(1); return r?.id??null; }
  if (/^\d+$/.test(val)) return Number(val);
  return null;
}
async function resolveWarehouseId(val: string): Promise<number|null> {
  if (isUuid(val)) { const [r]=await db.select({id: schema.warehouses.id}).from(schema.warehouses).where(eq(schema.warehouses.publicId, val)).limit(1); return r?.id??null; }
  if (/^\d+$/.test(val)) return Number(val);
  return null;
}
async function resolveItemId(val: string): Promise<number|null> {
  if (isUuid(val)) { const [r]=await db.select({id: schema.items.id}).from(schema.items).where(eq(schema.items.publicId, val)).limit(1); return r?.id??null; }
  if (/^\d+$/.test(val)) return Number(val);
  return null;
}
async function resolveUomId(val: string|null|undefined): Promise<number|null> {
  if (!val) return null;
  if (isUuid(val)) { const [r]=await db.select({id: schema.uom.id}).from(schema.uom).where(eq(schema.uom.publicId, val)).limit(1); return r?.id??null; }
  if (/^\d+$/.test(val)) return Number(val);
  return null;
}
async function resolveCountId(val: string): Promise<number|null> {
  if (isUuid(val)) { const [r]=await db.select({id: schema.opnameCounts.id}).from(schema.opnameCounts).where(eq(schema.opnameCounts.publicId, val)).limit(1); return r?.id??null; }
  if (/^\d+$/.test(val)) return Number(val);
  return null;
}

function cutOffAtOf(project: { cutOffDate: string | Date | null; cutOffTime: string | null }): Date | null {
  if (!project.cutOffDate || !project.cutOffTime) return null;
  const d = typeof project.cutOffDate === "string" ? project.cutOffDate : project.cutOffDate.toISOString().slice(0, 10);
  const t = project.cutOffTime.includes(":") ? project.cutOffTime : `${project.cutOffTime}:00`;
  const iso = `${d}T${t.length === 5 ? t + ":00" : t}`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

router.post("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "create"))) return;
  const body = req.body as {
    projectId: string; warehouseId: string; postingDate?: string | null; postingTime?: string | null; cutOffDate?: string | null; cutOffTime?: string | null; notes?: string | null;
    details: { itemId: string; qty: number | string; batch?: string | null; uomId?: string | null }[];
  };
  if (!body.projectId || !body.warehouseId) { res.status(400).json({ error: "projectId dan warehouseId wajib." }); return; }
  if (!Array.isArray(body.details) || body.details.length === 0) { res.status(400).json({ error: "Minimal 1 baris item diperlukan." }); return; }
  const projInternal = await resolveProjectId(String(body.projectId));
  const whInternal = await resolveWarehouseId(String(body.warehouseId));
  if (!projInternal || !whInternal) { res.status(400).json({ error: "projectId/warehouseId tidak valid." }); return; }
  const [project] = await db.select().from(schema.opnameProjects).where(eq(schema.opnameProjects.id, projInternal)).limit(1);
  if (!project) { res.status(404).json({ error: "Project tidak ditemukan." }); return; }
  if (project.mode === "COMPARE") {
    const cutOffAt = cutOffAtOf(project as any);
    if (cutOffAt) {
      for (const d of body.details) {
        if (!d.itemId) continue;
        const itemInternal = await resolveItemId(String(d.itemId));
        if (!itemInternal) continue;
        const ledger = await db.select({ id: schema.stockLedger.id }).from(schema.stockLedger).where(and(eq(schema.stockLedger.itemId, itemInternal), eq(schema.stockLedger.warehouseId, whInternal), sql`${schema.stockLedger.qtyIn} > 0`, sql`${schema.stockLedger.transactionDate} < ${cutOffAt.toISOString()}`)).limit(1);
        if (ledger.length === 0) console.warn(`COMPARE draft: Item ${d.itemId} belum ada stock masuk sebelum cutOff ${cutOffAt.toISOString()}`);
      }
    }
  }
  const socDateStr = body.postingDate || (project.cutOffDate as unknown as string) || new Date().toISOString().slice(0, 10);
  const socDate = new Date(socDateStr);
  try {
    const publicId = await db.transaction(async (tx) => {
      const { nextDocumentNo } = await import("../lib/document-number");
      const doc = await nextDocumentNo(tx as any, "SOC", { date: socDate });
      const now = new Date();
      const userInternal = (req as any).user?.internalId ?? (isUuid(String((req as any).user?.id)) ? (await db.select({id: schema.users.id}).from(schema.users).where(eq(schema.users.publicId, String((req as any).user.id))).limit(1).then(r=>r[0]?.id) ) : Number((req as any).user?.id));
      const [inserted] = await tx.insert(schema.opnameCounts).values({
        documentNo: doc.documentNo,
        seriesId: doc.seriesId,
        projectId: projInternal,
        warehouseId: whInternal,
        postingDate: body.postingDate || null,
        postingTime: body.postingTime || null,
        cutOffDate: body.cutOffDate || (project.cutOffDate as unknown as string) || null,
        cutOffTime: body.cutOffTime || (project.cutOffTime as unknown as string) || null,
        notes: body.notes ?? null,
        status: "DRAFT",
        createdBy: userInternal ?? null,
        createdAt: now,
        updatedAt: now,
      }).returning();
      for (const d of body.details) {
        if (!d.itemId) continue;
        const itemInternal = await resolveItemId(String(d.itemId));
        if (!itemInternal) continue;
        const uomInternal = d.uomId ? await resolveUomId(String(d.uomId)) : null;
        await tx.insert(schema.opnameCountDetails).values({
          countId: inserted.id,
          itemId: itemInternal,
          qty: String(d.qty),
          batch: d.batch ?? null,
          uomId: uomInternal,
          warehouseId: whInternal,
        });
      }
      return inserted.publicId;
    });
    try {
      const [cntRow] = await db.select({ id: schema.opnameCounts.id }).from(schema.opnameCounts).where(eq(schema.opnameCounts.publicId, publicId)).limit(1);
      if (cntRow) {
        const { internalId, role } = await getActorInfo(req);
        await logActivity({ documentType: "SOC", documentId: cntRow.id, action: "create", fromStatus: null, toStatus: "DRAFT", actorUserId: internalId, actorRole: role, metadata: { documentNo: cntRow.id } });
      }
    } catch {}
    res.status(201).json({ id: publicId });
  } catch (e) { console.error("POST opname-counts", e); res.status(500).json({ error: "Gagal membuat count." }); }
});

router.get("/", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;
  const rows = await db.select().from(schema.opnameCounts).orderBy(desc(schema.opnameCounts.createdAt));
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter(Boolean))] as number[];
  const warehouseIds = [...new Set(rows.map((r) => r.warehouseId).filter(Boolean))] as number[];
  const userIds = [...new Set(rows.map((r) => r.createdBy).filter(Boolean))] as number[];
  const projects = projectIds.length ? await db.select({ id: schema.opnameProjects.id, publicId: schema.opnameProjects.publicId, name: schema.opnameProjects.name }).from(schema.opnameProjects).where(inArray(schema.opnameProjects.id, projectIds)) : [];
  const warehouses = warehouseIds.length ? await db.select({ id: schema.warehouses.id, publicId: schema.warehouses.publicId, name: schema.warehouses.name }).from(schema.warehouses).where(inArray(schema.warehouses.id, warehouseIds)) : [];
  const users = userIds.length ? await db.select({ id: schema.users.id, publicId: schema.users.publicId, name: schema.users.name }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const pMap = new Map(projects.map((p) => [p.id, p]));
  const wMap = new Map(warehouses.map((w) => [w.id, w]));
  const uMap = new Map(users.map((u) => [u.id, u.name]));
  const result = rows.map((r) => ({
    ...r,
    id: r.publicId,
    _internalId: r.id,
    documentNo: r.documentNo,
    projectId: pMap.get(r.projectId)?.publicId ?? String(r.projectId),
    warehouseId: wMap.get(r.warehouseId)?.publicId ?? String(r.warehouseId),
    projectName: pMap.get(r.projectId)?.name ?? "",
    projectPublicId: pMap.get(r.projectId)?.publicId ?? null,
    warehouseName: wMap.get(r.warehouseId)?.name ?? "",
    warehousePublicId: wMap.get(r.warehouseId)?.publicId ?? null,
    auditor: r.createdBy ? (uMap.get(r.createdBy) ?? String(r.createdBy)) : "",
  }));
  res.json(result);
});

router.get("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "view"))) return;
  const pid = String(req.params.id);
  const internal = await resolveCountId(pid);
  if (!internal) return res.status(404).json({ error: "Count tidak ditemukan." });
  const [row] = await db.select().from(schema.opnameCounts).where(eq(schema.opnameCounts.id, internal)).limit(1);
  if (!row) { res.status(404).json({ error: "Count tidak ditemukan." }); return; }
  const details = await db.select().from(schema.opnameCountDetails).where(eq(schema.opnameCountDetails.countId, internal));
  // map details to publicIds
  const itemIds = [...new Set(details.map((d) => d.itemId).filter(Boolean))] as number[];
  const uomIds = [...new Set(details.map((d) => d.uomId).filter(Boolean))] as number[];
  let itemMap = new Map<number, string>();
  let uomMap = new Map<number, string>();
  if (itemIds.length) {
    const items = await db.select({ id: schema.items.id, publicId: schema.items.publicId }).from(schema.items).where(inArray(schema.items.id, itemIds));
    items.forEach((it) => itemMap.set(it.id, it.publicId));
  }
  if (uomIds.length) {
    const uoms = await db.select({ id: schema.uom.id, publicId: schema.uom.publicId }).from(schema.uom).where(inArray(schema.uom.id, uomIds as number[]));
    uoms.forEach((u) => uomMap.set(u.id, u.publicId));
  }
  // map FKs to publicId for frontend (before mappedDetails so it can use whPub)
  let projPub: string | null = null;
  let whPub: string | null = null;
  if (row.projectId) {
    const [pr] = await db.select({ publicId: schema.opnameProjects.publicId }).from(schema.opnameProjects).where(eq(schema.opnameProjects.id, row.projectId)).limit(1);
    projPub = pr?.publicId ?? String(row.projectId);
  }
  if (row.warehouseId) {
    const [wh] = await db.select({ publicId: schema.warehouses.publicId }).from(schema.warehouses).where(eq(schema.warehouses.id, row.warehouseId)).limit(1);
    whPub = wh?.publicId ?? String(row.warehouseId);
  }
  const mappedDetails = details.map((d: any) => ({ ...d, id: d.publicId, _internalId: d.id, countId: row.publicId, itemId: itemMap.get(d.itemId) ?? String(d.itemId), uomId: d.uomId ? (uomMap.get(d.uomId) ?? String(d.uomId)) : null, warehouseId: whPub ?? String(d.warehouseId) }));
  res.json({ ...row, id: row.publicId, _internalId: row.id, documentNo: row.documentNo, projectId: projPub ?? String(row.projectId), warehouseId: whPub ?? String(row.warehouseId), details: mappedDetails });
});

router.patch("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "update"))) return;
  const pid = String(req.params.id);
  const internal = await resolveCountId(pid);
  if (!internal) return res.status(404).json({ error: "Count tidak ditemukan." });
  let oldRow: any = null;
  let oldDetails: any[] = [];
  try { const [r] = await db.select().from(schema.opnameCounts).where(eq(schema.opnameCounts.id, internal)).limit(1); oldRow = r; } catch {}
  try { if (Array.isArray((req.body as any)?.details)) oldDetails = await db.select().from(schema.opnameCountDetails).where(eq(schema.opnameCountDetails.countId, internal)); } catch {}
  const patch = req.body as Record<string, unknown> & { details?: { itemId: string; qty: number | string; batch?: string | null; uomId?: string | null }[] };
  const allowed = ["postingDate", "postingTime", "cutOffDate", "cutOffTime", "notes", "status", "warehouseId", "projectId"];
  const toUpdate: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) toUpdate[k] = patch[k];
  const hasDetails = Array.isArray(patch.details);
  if (Object.keys(toUpdate).length === 0 && !hasDetails) { res.status(400).json({ error: "Tidak ada field yang diupdate." }); return; }
  // resolve FKs in toUpdate
  if (toUpdate.projectId) {
    const v = await resolveProjectId(String(toUpdate.projectId));
    if (!v) return res.status(400).json({ error: "projectId tidak valid" });
    toUpdate.projectId = v;
  }
  if (toUpdate.warehouseId) {
    const v = await resolveWarehouseId(String(toUpdate.warehouseId));
    if (!v) return res.status(400).json({ error: "warehouseId tidak valid" });
    toUpdate.warehouseId = v;
  }
  if (patch.status === "POSTED") {
    const [existing] = await db.select().from(schema.opnameCounts).where(eq(schema.opnameCounts.id, internal)).limit(1);
    if (!existing) { res.status(404).json({ error: "Count tidak ditemukan." }); return; }
    const projIdForCheck = (toUpdate.projectId as number) ?? existing.projectId;
    const [project] = await db.select().from(schema.opnameProjects).where(eq(schema.opnameProjects.id, projIdForCheck)).limit(1);
    if (project?.mode === "COMPARE") {
      const cutOffAt = cutOffAtOf(project as any);
      if (!cutOffAt) { res.status(400).json({ error: "Project COMPARE wajib punya cut off." }); return; }
      const detailsToCheck = hasDetails ? patch.details! : await db.select().from(schema.opnameCountDetails).where(eq(schema.opnameCountDetails.countId, internal));
      const whId = (toUpdate.warehouseId as number) ?? existing.warehouseId;
      for (const d of detailsToCheck as unknown as { itemId: string|number }[]) {
        if (!d.itemId) continue;
        const itemInternal = typeof d.itemId === "string" && isUuid(d.itemId) ? await resolveItemId(String(d.itemId)) : Number(d.itemId);
        if (!itemInternal) continue;
        const ledger = await db.select({ id: schema.stockLedger.id }).from(schema.stockLedger).where(and(eq(schema.stockLedger.itemId, itemInternal), eq(schema.stockLedger.warehouseId, whId), sql`${schema.stockLedger.qtyIn} > 0`, sql`${schema.stockLedger.transactionDate} < ${cutOffAt.toISOString()}`)).limit(1);
        if (ledger.length === 0) { res.status(400).json({ error: `Item ${d.itemId} tidak ada stock masuk sebelum cut off ${cutOffAt.toLocaleString("id-ID")} — COMPARE hanya boleh hitung stock di bawah cut off.` }); return; }
      }
    }
  }
  let linesDiff: any = null;
  await db.transaction(async (tx) => {
    if (Object.keys(toUpdate).length > 0) {
      (toUpdate as Record<string, unknown>).updatedAt = new Date();
      await tx.update(schema.opnameCounts).set(toUpdate).where(eq(schema.opnameCounts.id, internal));
    }
    if (hasDetails) {
      await tx.delete(schema.opnameCountDetails).where(eq(schema.opnameCountDetails.countId, internal));
      const whId = (toUpdate.warehouseId as number) ?? (await tx.select({ warehouseId: schema.opnameCounts.warehouseId }).from(schema.opnameCounts).where(eq(schema.opnameCounts.id, internal)).limit(1).then(r=>r[0]?.warehouseId) ?? 0);
      for (const d of patch.details!) {
        if (!d.itemId) continue;
        const itemInternal = await resolveItemId(String(d.itemId));
        const uomInternal = d.uomId ? await resolveUomId(String(d.uomId)) : null;
        if (!itemInternal) continue;
        await tx.insert(schema.opnameCountDetails).values({ countId: internal, itemId: itemInternal, qty: String(d.qty), batch: d.batch ?? null, uomId: uomInternal, warehouseId: whId as number });
      }
    }
  });
  // compute diffs
  try {
    const { internalId, role } = await getActorInfo(req);
    const changes = computeDiff(oldRow as any, toUpdate as any, { denylist: DIFF_DENYLIST });
    const meta: Record<string, unknown> = { patchKeys: Object.keys(toUpdate) };
    if (Object.keys(changes).length) meta.changes = changes;
    if (Array.isArray(patch.details)) {
      try {
        const newDetailsResolved = await Promise.all((patch.details as any[]).map(async (l: any) => {
          const itemId = l.itemId ? await resolveInternalId(s.items, String(l.itemId)) : l.itemId;
          const uomId = l.uomId ? await resolveInternalId(s.uom, String(l.uomId)) : l.uomId;
          return { ...l, itemId: itemId ?? l.itemId, uomId: uomId ?? l.uomId };
        }));
        linesDiff = diffLines(oldDetails as any, newDetailsResolved as any);
      } catch {}
      if (linesDiff && (linesDiff.added.length || linesDiff.removed.length || linesDiff.modified.length)) meta.linesDiff = linesDiff;
    }
    await logActivity({ documentType: "SOC", documentId: internal, action: "update", fromStatus: oldRow?.status ?? null, toStatus: (toUpdate as any).status ?? oldRow?.status ?? null, actorUserId: internalId, actorRole: role, metadata: meta });
  } catch {}
  res.json({ ok: true });
});

router.delete("/:id", async (req: Request, res: Response) => {
  if (!(await checkPermission(req, res, "opname", "delete"))) return;
  const pid = String(req.params.id);
  const internal = await resolveCountId(pid);
  if (!internal) return res.status(404).json({ error: "Count tidak ditemukan." });
  let delRow: any = null;
  try { const [r] = await db.select().from(schema.opnameCounts).where(eq(schema.opnameCounts.id, internal)).limit(1); delRow = r; } catch {}
  await db.delete(schema.opnameCounts).where(eq(schema.opnameCounts.id, internal));
  try {
    const { internalId, role } = await getActorInfo(req);
    await logActivity({ documentType: "SOC", documentId: internal, action: "delete", fromStatus: delRow?.status ?? null, toStatus: null, actorUserId: internalId, actorRole: role, metadata: { documentNo: delRow?.documentNo ?? null } });
  } catch {}
  res.json({ ok: true });
});

export default router;
