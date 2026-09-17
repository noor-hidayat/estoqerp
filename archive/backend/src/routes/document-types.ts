import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission } from "../middleware/rbac";
import { previewDocumentNo } from "../lib/document-number";

export const documentTypesRouter = Router();
export const documentSeriesRouter = Router();

// Helper to check uuid
function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
async function resolveTypeId(param: string): Promise<number | null> {
  if (isUuid(param)) {
    const [r] = await db.select({ id: s.documentTypes.id }).from(s.documentTypes).where(eq(s.documentTypes.publicId, param)).limit(1);
    return r?.id ?? null;
  }
  if (/^\d+$/.test(param)) return Number(param);
  // fallback by name (code removed, use name)
  const [r] = await db.select({ id: s.documentTypes.id }).from(s.documentTypes).where(eq(s.documentTypes.name, param)).limit(1);
  return r?.id ?? null;
}
async function resolveSeriesId(param: string): Promise<number | null> {
  if (isUuid(param)) {
    const [r] = await db.select({ id: s.documentSeries.id }).from(s.documentSeries).where(eq(s.documentSeries.publicId, param)).limit(1);
    return r?.id ?? null;
  }
  if (/^\d+$/.test(param)) return Number(param);
  const [r] = await db.select({ id: s.documentSeries.id }).from(s.documentSeries).where(eq(s.documentSeries.name, param)).limit(1);
  return r?.id ?? null;
}

// ---------------------------------------------------------------------------
// Document Types CRUD
// ---------------------------------------------------------------------------

documentTypesRouter.get("/", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "view"))) return;
  try {
    const rows = await db.select().from(s.documentTypes).orderBy(s.documentTypes.name);
    res.json(rows.map((r) => ({ ...r, id: r.publicId, _internalId: r.id })));
  } catch (e) { next(e); }
});

documentTypesRouter.get("/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "view"))) return;
  try {
    const id = await resolveTypeId(req.params.id);
    if (!id) return res.status(404).json({ error: "Tipe dokumen tidak ditemukan." });
    const [row] = await db.select().from(s.documentTypes).where(eq(s.documentTypes.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Tipe dokumen tidak ditemukan." });
    const series = await db.select().from(s.documentSeries).where(eq(s.documentSeries.documentTypeId, row.id)).orderBy(desc(s.documentSeries.isDefault), s.documentSeries.name);
    res.json({ ...row, id: row.publicId, _internalId: row.id, series: series.map((sr) => ({ ...sr, id: sr.publicId, _internalId: sr.id })) });
  } catch (e) { next(e); }
});

documentTypesRouter.post("/", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.name) return res.status(400).json({ error: "name wajib." });
    const name = String(b.name).trim();
    if (!name) return res.status(400).json({ error: "name tidak valid." });
    const [exists] = await db.select({ id: s.documentTypes.id }).from(s.documentTypes).where(eq(s.documentTypes.name, name)).limit(1);
    if (exists) return res.status(409).json({ error: `Name ${name} sudah ada.` });
    const [ins] = await db.insert(s.documentTypes).values({
      name,
      description: b.description ?? null,
      isActive: b.isActive ?? true,
    }).returning();
    res.status(201).json({ id: ins.publicId, _internalId: ins.id });
  } catch (e) { next(e); }
});

documentTypesRouter.patch("/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "manage"))) return;
  try {
    const id = await resolveTypeId(req.params.id);
    if (!id) return res.status(404).json({ error: "Tipe dokumen tidak ditemukan." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.name !== undefined) {
      const newName = String(b.name).trim();
      if (newName) {
        const [dup] = await db.select({ id: s.documentTypes.id }).from(s.documentTypes).where(and(eq(s.documentTypes.name, newName), sql`${s.documentTypes.id} != ${id}`)).limit(1);
        if (dup) return res.status(409).json({ error: `Name ${newName} sudah ada.` });
        patch.name = newName;
      }
    }
    if (b.description !== undefined) patch.description = b.description ?? null;
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    if (Object.keys(patch).length) {
      patch.updatedAt = new Date();
      await db.update(s.documentTypes).set(patch).where(eq(s.documentTypes.id, id));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

documentTypesRouter.delete("/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "manage"))) return;
  try {
    const id = await resolveTypeId(req.params.id);
    if (!id) return res.status(404).json({ error: "Tipe dokumen tidak ditemukan." });
    // check if any document uses this type via series
    const [used] = await db.select({ id: s.documentSeries.id }).from(s.documentSeries).where(eq(s.documentSeries.documentTypeId, id)).limit(1);
    if (used) {
      // check if any purchase/sales etc use series
      const seriesIds = await db.select({ id: s.documentSeries.id }).from(s.documentSeries).where(eq(s.documentSeries.documentTypeId, id));
      const ids = seriesIds.map((r) => r.id);
      if (ids.length) {
        const [poUsed] = await db.select({ id: s.purchaseOrders.id }).from(s.purchaseOrders).where(sql`${s.purchaseOrders.seriesId} IN (${sql.join(ids.map((v) => sql`${v}`), sql`, `)})`).limit(1);
        if (poUsed) return res.status(409).json({ error: "Tipe masih dipakai oleh dokumen. Non-aktifkan saja." });
      }
    }
    await db.delete(s.documentTypes).where(eq(s.documentTypes.id, id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---------------------------------------------------------------------------
// Document Series CRUD
// ---------------------------------------------------------------------------

documentSeriesRouter.get("/", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "view"))) return;
  try {
    const typeIdParam = req.query.documentTypeId as string | undefined;
    const typeCode = req.query.documentTypeCode as string | undefined;
    let where: any = undefined;
    if (typeIdParam) {
      const tid = await resolveTypeId(typeIdParam);
      if (tid) where = eq(s.documentSeries.documentTypeId, tid);
    } else if (typeCode) {
      const tid = await resolveTypeId(typeCode);
      if (tid) where = eq(s.documentSeries.documentTypeId, tid);
    }
    const rows = await db.select({
      id: s.documentSeries.id,
      publicId: s.documentSeries.publicId,
      documentTypeId: s.documentSeries.documentTypeId,
      typePublicId: s.documentTypes.publicId,
      name: s.documentSeries.name,
      prefix: s.documentSeries.prefix,
      format: s.documentSeries.format,
      padding: s.documentSeries.padding,
      resetPolicy: s.documentSeries.resetPolicy,
      isDefault: s.documentSeries.isDefault,
      branchSpecific: s.documentSeries.branchSpecific,
      isActive: s.documentSeries.isActive,
      createdAt: s.documentSeries.createdAt,
      updatedAt: s.documentSeries.updatedAt,
      typeName: s.documentTypes.name,
    }).from(s.documentSeries).leftJoin(s.documentTypes, eq(s.documentTypes.id, s.documentSeries.documentTypeId)).where(where).orderBy(s.documentTypes.name, desc(s.documentSeries.isDefault), s.documentSeries.name);
    res.json(rows.map((r) => ({ ...r, id: r.publicId, _internalId: r.id, documentTypeId: (r as any).typePublicId ? String((r as any).typePublicId) : String((r as any).documentTypeId) })));
  } catch (e) { next(e); }
});

documentSeriesRouter.get("/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "view"))) return;
  try {
    const id = await resolveSeriesId(req.params.id);
    if (!id) return res.status(404).json({ error: "Series tidak ditemukan." });
    const [row] = await db.select().from(s.documentSeries).where(eq(s.documentSeries.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Series tidak ditemukan." });
    // get current counter preview
    const now = new Date();
    const periodKey = (() => {
      const YYYY = String(now.getFullYear());
      const YY = YYYY.slice(-2);
      const MM = String(now.getMonth() + 1).padStart(2, "0");
      const DD = String(now.getDate()).padStart(2, "0");
      if (row.resetPolicy === "DAILY") return `${YYYY}${MM}${DD}`;
      if (row.resetPolicy === "YEARLY") return `${YYYY}`;
      if (row.resetPolicy === "NEVER") return "GLOBAL";
      return `${YY}${MM}`;
    })();
    const [seq] = await db.select({ lastNumber: s.documentSequences.lastNumber }).from(s.documentSequences).where(and(eq(s.documentSequences.seriesId, row.id), eq(s.documentSequences.periodKey, periodKey))).limit(1);
    const nextNum = (seq?.lastNumber ?? 0) + 1;
    const preview = previewDocumentNo({ prefix: row.prefix, format: row.format, padding: row.padding }, nextNum, now);
    res.json({ ...row, id: row.publicId, _internalId: row.id, nextNumber: nextNum, preview });
  } catch (e) { next(e); }
});

documentSeriesRouter.post("/", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.documentTypeId || !b.name || !b.prefix || !b.format) return res.status(400).json({ error: "documentTypeId, name, prefix, format wajib." });
    const typeId = await resolveTypeId(String(b.documentTypeId));
    if (!typeId) return res.status(400).json({ error: "documentTypeId tidak valid." });
    const name = String(b.name).trim();
    if (!name) return res.status(400).json({ error: "name wajib." });
    const [dup] = await db.select({ id: s.documentSeries.id }).from(s.documentSeries).where(and(eq(s.documentSeries.documentTypeId, typeId), eq(s.documentSeries.name, name))).limit(1);
    if (dup) return res.status(409).json({ error: `Name ${name} sudah ada untuk tipe ini.` });
    const isDefault = !!b.isDefault;
    if (isDefault) {
      await db.update(s.documentSeries).set({ isDefault: false }).where(eq(s.documentSeries.documentTypeId, typeId));
    }
    const [ins] = await db.insert(s.documentSeries).values({
      documentTypeId: typeId,
      name,
      prefix: String(b.prefix).trim().toUpperCase(),
      format: String(b.format).trim(),
      padding: Number(b.padding ?? 4),
      resetPolicy: b.resetPolicy ?? "MONTHLY",
      isDefault,
      branchSpecific: !!b.branchSpecific,
      isActive: b.isActive ?? true,
    }).returning();
    res.status(201).json({ id: ins.publicId, _internalId: ins.id });
  } catch (e) { next(e); }
});

documentSeriesRouter.patch("/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "manage"))) return;
  try {
    const id = await resolveSeriesId(req.params.id);
    if (!id) return res.status(404).json({ error: "Series tidak ditemukan." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.prefix !== undefined) patch.prefix = String(b.prefix).trim().toUpperCase();
    if (b.format !== undefined) patch.format = String(b.format).trim();
    if (b.padding !== undefined) patch.padding = Number(b.padding);
    if (b.resetPolicy !== undefined) patch.resetPolicy = b.resetPolicy;
    if (b.branchSpecific !== undefined) patch.branchSpecific = !!b.branchSpecific;
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    if (b.isDefault !== undefined) {
      if (b.isDefault) {
        const [cur] = await db.select({ documentTypeId: s.documentSeries.documentTypeId }).from(s.documentSeries).where(eq(s.documentSeries.id, id)).limit(1);
        if (cur) await db.update(s.documentSeries).set({ isDefault: false }).where(eq(s.documentSeries.documentTypeId, cur.documentTypeId));
      }
      patch.isDefault = !!b.isDefault;
    }
    if (Object.keys(patch).length) {
      patch.updatedAt = new Date();
      await db.update(s.documentSeries).set(patch).where(eq(s.documentSeries.id, id));
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

documentSeriesRouter.delete("/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "manage"))) return;
  try {
    const id = await resolveSeriesId(req.params.id);
    if (!id) return res.status(404).json({ error: "Series tidak ditemukan." });
    const [row] = await db.select({ isDefault: s.documentSeries.isDefault }).from(s.documentSeries).where(eq(s.documentSeries.id, id)).limit(1);
    if (row?.isDefault) return res.status(409).json({ error: "Series default tidak bisa dihapus. Jadikan series lain sebagai default dulu." });
    // check usage
    const [used] = await db.select({ id: s.purchaseOrders.id }).from(s.purchaseOrders).where(eq(s.purchaseOrders.seriesId, id)).limit(1);
    if (used) return res.status(409).json({ error: "Series masih dipakai oleh dokumen." });
    const [used2] = await db.select({ id: s.salesOrders.id }).from(s.salesOrders).where(eq(s.salesOrders.seriesId, id)).limit(1);
    if (used2) return res.status(409).json({ error: "Series masih dipakai oleh dokumen." });
    await db.delete(s.documentSeries).where(eq(s.documentSeries.id, id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

documentSeriesRouter.get("/:id/preview", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "view"))) return;
  try {
    const id = await resolveSeriesId(req.params.id);
    if (!id) return res.status(404).json({ error: "Series tidak ditemukan." });
    const [row] = await db.select().from(s.documentSeries).where(eq(s.documentSeries.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Series tidak ditemukan." });
    const seq = Number(req.query.seq ?? 1);
    const dateStr = req.query.date as string | undefined;
    const date = dateStr ? new Date(dateStr) : new Date();
    const preview = previewDocumentNo({ prefix: row.prefix, format: row.format, padding: row.padding }, seq, date);
    res.json({ preview, format: row.format, prefix: row.prefix, seq, date: date.toISOString() });
  } catch (e) { next(e); }
});

// Sequences view
documentSeriesRouter.get("/sequences/list", async (req, res, next) => {
  if (!(await checkPermission(req, res, "master.documentTypes", "view"))) return;
  try {
    const rows = await db.select({
      id: s.documentSequences.id,
      seriesId: s.documentSequences.seriesId,
      branchId: s.documentSequences.branchId,
      periodKey: s.documentSequences.periodKey,
      lastNumber: s.documentSequences.lastNumber,
      updatedAt: s.documentSequences.updatedAt,
      seriesName: s.documentSeries.name,
      seriesPrefix: s.documentSeries.prefix,
    }).from(s.documentSequences).leftJoin(s.documentSeries, eq(s.documentSeries.id, s.documentSequences.seriesId)).orderBy(desc(s.documentSequences.updatedAt));
    res.json(rows);
  } catch (e) { next(e); }
});
