import { Router, type Request, type Response } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission } from "../middleware/rbac";

export const workflowsRouter = Router();

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
async function resolveWorkflowId(param: string): Promise<number | null> {
  if (isUuid(param)) {
    const [row] = await db.select({ id: s.workflows.id }).from(s.workflows).where(eq(s.workflows.publicId, param)).limit(1);
    return row?.id ?? null;
  }
  if (/^\d+$/.test(param)) return Number(param);
  const [row] = await db.select({ id: s.workflows.id }).from(s.workflows).where(eq(s.workflows.name, param)).limit(1);
  return row?.id ?? null;
}
async function resolveStateId(param: string): Promise<number | null> {
  if (isUuid(param)) {
    const [row] = await db.select({ id: s.workflowStates.id }).from(s.workflowStates).where(eq(s.workflowStates.publicId, param)).limit(1);
    return row?.id ?? null;
  }
  if (/^\d+$/.test(param)) return Number(param);
  return null;
}
async function resolveTransitionId(param: string): Promise<number | null> {
  if (isUuid(param)) {
    const [row] = await db.select({ id: s.workflowTransitions.id }).from(s.workflowTransitions).where(eq(s.workflowTransitions.publicId, param)).limit(1);
    return row?.id ?? null;
  }
  if (/^\d+$/.test(param)) return Number(param);
  return null;
}

// Workflows CRUD
workflowsRouter.get("/workflows", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "view"))) return;
  try {
    const rows = await db.select().from(s.workflows).orderBy(desc(s.workflows.createdAt));
    res.json(rows.map((r: any) => ({ ...r, id: r.publicId })));
  } catch (e) { next(e); }
});

workflowsRouter.post("/workflows", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const b = req.body ?? {};
    if (!b.name || !b.documentType) return res.status(400).json({ error: "name, documentType wajib." });
    const name = String(b.name).trim();
    if (!name) return res.status(400).json({ error: "name wajib." });
    const documentType = String(b.documentType).trim().toUpperCase();
    if (!["PO", "SO", "GR", "RECEIVING", "QC", "DELIVERY"].includes(documentType)) {
      return res.status(400).json({ error: "documentType harus PO, SO, GR, RECEIVING, QC, DELIVERY." });
    }
    const [row] = await db.insert(s.workflows).values({
      name,
      documentType,
      status: "DRAFT",
      isActive: b.isActive ?? true,
      isDefault: b.isDefault ?? false,
      version: 1,
    }).returning();
    if (b.isDefault) {
      await db.update(s.workflows).set({ isDefault: false }).where(and(eq(s.workflows.documentType, documentType), eq(s.workflows.isDefault, true)));
      await db.update(s.workflows).set({ isDefault: true }).where(eq(s.workflows.id, row.id));
    }
    res.status(201).json({ id: row.publicId, name: row.name });
  } catch (e) { next(e); }
});

workflowsRouter.get("/workflows/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "view"))) return;
  try {
    const id = await resolveWorkflowId(String(req.params.id));
    if (!id) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const [row] = await db.select().from(s.workflows).where(eq(s.workflows.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const states = await db.select().from(s.workflowStates).where(eq(s.workflowStates.workflowId, id)).orderBy(s.workflowStates.orderNo);
    const transitions = await db.select().from(s.workflowTransitions).where(eq(s.workflowTransitions.workflowId, id));
    res.json({
      ...row,
      id: (row as any).publicId,
      states: states.map((st: any) => ({ ...st, id: st.publicId, workflowId: (row as any).publicId })),
      transitions: transitions.map((tr: any) => ({ ...tr, id: tr.publicId, workflowId: (row as any).publicId, fromStateId: tr.fromStateId, toStateId: tr.toStateId })),
    });
  } catch (e) { next(e); }
});

workflowsRouter.put("/workflows/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const id = await resolveWorkflowId(String(req.params.id));
    if (!id) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const b = req.body ?? {};
    const [existing] = await db.select({ status: s.workflows.status }).from(s.workflows).where(eq(s.workflows.id, id)).limit(1);
    if (!existing) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    // Hanya DRAFT yang boleh di-edit (sesuai request: pas status draft masih bisa di edit)
    if (existing.status !== "DRAFT" && (b.name !== undefined || b.documentType !== undefined || b.isDefault !== undefined || b.isActive !== undefined)) {
      // Izinkan update isActive/isDefault bahkan setelah ACTIVE? Batasi hanya DRAFT yang bisa ubah name/documentType/isDefault
      // Untuk sekarang tolak edit jika tidak DRAFT
      const isCorePatch = b.name !== undefined || b.documentType !== undefined || b.isDefault !== undefined;
      if (isCorePatch) return res.status(400).json({ error: "Hanya workflow dengan status DRAFT yang bisa diedit." });
    }
    const patch: Record<string, any> = {};
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.documentType !== undefined) patch.documentType = String(b.documentType).trim().toUpperCase();
    if (b.isActive !== undefined) patch.isActive = !!b.isActive;
    if (b.isDefault !== undefined) patch.isDefault = !!b.isDefault;
    if (b.status !== undefined && ["DRAFT", "ACTIVE"].includes(String(b.status).toUpperCase())) patch.status = String(b.status).toUpperCase();
    patch.updatedAt = new Date();
    await db.update(s.workflows).set(patch).where(eq(s.workflows.id, id));
    if (b.isDefault) {
      const [cur] = await db.select({ documentType: s.workflows.documentType }).from(s.workflows).where(eq(s.workflows.id, id)).limit(1);
      if (cur) {
        await db.update(s.workflows).set({ isDefault: false }).where(and(eq(s.workflows.documentType, cur.documentType), eq(s.workflows.isDefault, true)));
        await db.update(s.workflows).set({ isDefault: true }).where(eq(s.workflows.id, id));
      }
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

workflowsRouter.delete("/workflows/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const id = await resolveWorkflowId(String(req.params.id));
    if (!id) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    await db.delete(s.workflows).where(eq(s.workflows.id, id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Submit DRAFT -> ACTIVE
workflowsRouter.post("/workflows/:id/submit", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const id = await resolveWorkflowId(String(req.params.id));
    if (!id) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const [row] = await db.select().from(s.workflows).where(eq(s.workflows.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    if ((row as any).status !== "DRAFT") return res.status(400).json({ error: "Hanya workflow DRAFT yang bisa di-submit." });
    await db.update(s.workflows).set({ status: "ACTIVE", updatedAt: new Date() } as any).where(eq(s.workflows.id, id));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// States CRUD
workflowsRouter.get("/workflows/:id/states", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "view"))) return;
  try {
    const wid = await resolveWorkflowId(String(req.params.id));
    if (!wid) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const rows = await db.select().from(s.workflowStates).where(eq(s.workflowStates.workflowId, wid)).orderBy(s.workflowStates.orderNo);
    res.json(rows.map((r: any) => ({ ...r, id: r.publicId, workflowId: String(req.params.id) })));
  } catch (e) { next(e); }
});

workflowsRouter.post("/workflows/:id/states", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const wid = await resolveWorkflowId(String(req.params.id));
    if (!wid) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const [wf] = await db.select({ status: s.workflows.status }).from(s.workflows).where(eq(s.workflows.id, wid)).limit(1);
    if ((wf as any)?.status !== "DRAFT") return res.status(400).json({ error: "Hanya workflow DRAFT yang bisa diubah steps-nya." });
    const b = req.body ?? {};
    if (!b.code || !b.name) return res.status(400).json({ error: "code & name wajib." });
    const code = String(b.code).trim().toUpperCase().replace(/\s+/g, "_");
    const name = String(b.name).trim();
    const color = b.color ? String(b.color) : "neutral";
    const type = b.type && ["initial", "intermediate", "final", "rejected"].includes(b.type) ? b.type : "intermediate";
    const orderNo = b.orderNo != null ? Number(b.orderNo) : 0;
    const requiresSignature = !!b.requiresSignature;
    const [row] = await db.insert(s.workflowStates).values({
      workflowId: wid,
      code,
      name,
      color,
      type,
      orderNo,
      requiresSignature,
    }).returning();
    res.status(201).json({ id: row.publicId });
  } catch (e) { next(e); }
});

workflowsRouter.put("/workflow-states/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const sid = await resolveStateId(String(req.params.id));
    if (!sid) return res.status(404).json({ error: "State tidak ditemukan." });
    const [st] = await db.select({ workflowId: s.workflowStates.workflowId }).from(s.workflowStates).where(eq(s.workflowStates.id, sid)).limit(1);
    if (st) {
      const [wf] = await db.select({ status: s.workflows.status }).from(s.workflows).where(eq(s.workflows.id, st.workflowId)).limit(1);
      if ((wf as any)?.status !== "DRAFT") return res.status(400).json({ error: "Hanya workflow DRAFT yang bisa diubah steps-nya." });
    }
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.code !== undefined) patch.code = String(b.code).trim().toUpperCase().replace(/\s+/g, "_");
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.color !== undefined) patch.color = String(b.color);
    if (b.type !== undefined && ["initial", "intermediate", "final", "rejected"].includes(b.type)) patch.type = b.type;
    if (b.orderNo !== undefined) patch.orderNo = Number(b.orderNo);
    if (b.requiresSignature !== undefined) patch.requiresSignature = !!b.requiresSignature;
    patch.updatedAt = new Date();
    await db.update(s.workflowStates).set(patch).where(eq(s.workflowStates.id, sid));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

workflowsRouter.delete("/workflow-states/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const sid = await resolveStateId(String(req.params.id));
    if (!sid) return res.status(404).json({ error: "State tidak ditemukan." });
    const [st] = await db.select({ workflowId: s.workflowStates.workflowId }).from(s.workflowStates).where(eq(s.workflowStates.id, sid)).limit(1);
    if (st) {
      const [wf] = await db.select({ status: s.workflows.status }).from(s.workflows).where(eq(s.workflows.id, st.workflowId)).limit(1);
      if ((wf as any)?.status !== "DRAFT") return res.status(400).json({ error: "Hanya workflow DRAFT yang bisa diubah steps-nya." });
    }
    // check if used in transitions
    const used = await db.select({ id: s.workflowTransitions.id }).from(s.workflowTransitions).where(and(eq(s.workflowTransitions.fromStateId, sid), eq(s.workflowTransitions.toStateId, sid))).limit(1);
    // actually check both from and to
    const fromUsed = await db.select({ id: s.workflowTransitions.id }).from(s.workflowTransitions).where(eq(s.workflowTransitions.fromStateId, sid)).limit(1);
    const toUsed = await db.select({ id: s.workflowTransitions.id }).from(s.workflowTransitions).where(eq(s.workflowTransitions.toStateId, sid)).limit(1);
    if (fromUsed.length || toUsed.length) return res.status(400).json({ error: "State masih dipakai di transition, hapus transition dulu." });
    await db.delete(s.workflowStates).where(eq(s.workflowStates.id, sid));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Transitions CRUD
workflowsRouter.get("/workflows/:id/transitions", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "view"))) return;
  try {
    const wid = await resolveWorkflowId(String(req.params.id));
    if (!wid) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const rows = await db.select().from(s.workflowTransitions).where(eq(s.workflowTransitions.workflowId, wid));
    // map from/to to publicId for frontend
    const stateIds = [...new Set(rows.flatMap((r: any) => [r.fromStateId, r.toStateId].filter(Boolean)))] as number[];
    let stateMap = new Map<number, string>();
    if (stateIds.length) {
      const states = await db.select({ id: s.workflowStates.id, publicId: s.workflowStates.publicId }).from(s.workflowStates).where(inArray(s.workflowStates.id, stateIds));
      states.forEach((st) => stateMap.set(st.id, st.publicId));
    }
    res.json(rows.map((r: any) => ({
      ...r,
      id: r.publicId,
      workflowId: String(req.params.id),
      fromStateId: r.fromStateId ? (stateMap.get(r.fromStateId) ?? r.fromStateId) : null,
      toStateId: stateMap.get(r.toStateId) ?? r.toStateId,
    })));
  } catch (e) { next(e); }
});

workflowsRouter.post("/workflows/:id/transitions", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const wid = await resolveWorkflowId(String(req.params.id));
    if (!wid) return res.status(404).json({ error: "Workflow tidak ditemukan." });
    const b = req.body ?? {};
    if (!b.code || !b.name || !b.toStateId) return res.status(400).json({ error: "code, name, toStateId wajib." });
    const code = String(b.code).trim().toUpperCase().replace(/\s+/g, "_");
    const name = String(b.name).trim();
    const fromStateId = b.fromStateId ? await resolveStateId(String(b.fromStateId)) : null;
    const toStateId = await resolveStateId(String(b.toStateId));
    if (!toStateId) return res.status(400).json({ error: "toStateId tidak valid." });
    const trigger = b.trigger && ["submit", "approve", "reject", "cancel", "custom"].includes(b.trigger) ? b.trigger : "approve";
    let allowedRoleIds: string[] = [];
    if (Array.isArray(b.allowedRoleIds)) allowedRoleIds = b.allowedRoleIds.map((v: any) => String(v));
    else if (typeof b.allowedRoleIds === "string" && b.allowedRoleIds) allowedRoleIds = [String(b.allowedRoleIds)];
    // validate roles exist if provided as publicId
    if (allowedRoleIds.length) {
      for (const rid of allowedRoleIds) {
        if (!/^[0-9a-f-]{36}$/i.test(rid) && !/^\d+$/.test(rid)) {
          // assume code, try resolve
        }
      }
    }
    const condition = b.condition ?? null;
    const requiresComment = !!b.requiresComment;
    const [row] = await db.insert(s.workflowTransitions).values({
      workflowId: wid,
      code,
      name,
      fromStateId,
      toStateId,
      trigger,
      allowedRoleIds,
      condition,
      requiresComment,
    }).returning();
    res.status(201).json({ id: row.publicId });
  } catch (e) { next(e); }
});

workflowsRouter.put("/workflow-transitions/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const tid = await resolveTransitionId(String(req.params.id));
    if (!tid) return res.status(404).json({ error: "Transition tidak ditemukan." });
    const b = req.body ?? {};
    const patch: Record<string, any> = {};
    if (b.code !== undefined) patch.code = String(b.code).trim().toUpperCase().replace(/\s+/g, "_");
    if (b.name !== undefined) patch.name = String(b.name).trim();
    if (b.fromStateId !== undefined) patch.fromStateId = b.fromStateId ? await resolveStateId(String(b.fromStateId)) : null;
    if (b.toStateId !== undefined) {
      const toId = await resolveStateId(String(b.toStateId));
      if (!toId) return res.status(400).json({ error: "toStateId tidak valid." });
      patch.toStateId = toId;
    }
    if (b.trigger !== undefined && ["submit", "approve", "reject", "cancel", "custom"].includes(b.trigger)) patch.trigger = b.trigger;
    if (b.allowedRoleIds !== undefined) {
      let arr: string[] = [];
      if (Array.isArray(b.allowedRoleIds)) arr = b.allowedRoleIds.map((v: any) => String(v));
      else if (b.allowedRoleIds) arr = [String(b.allowedRoleIds)];
      patch.allowedRoleIds = arr;
    }
    if (b.condition !== undefined) patch.condition = b.condition;
    if (b.requiresComment !== undefined) patch.requiresComment = !!b.requiresComment;
    patch.updatedAt = new Date();
    await db.update(s.workflowTransitions).set(patch).where(eq(s.workflowTransitions.id, tid));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

workflowsRouter.delete("/workflow-transitions/:id", async (req, res, next) => {
  if (!(await checkPermission(req, res, "settings.workflows", "manage"))) return;
  try {
    const tid = await resolveTransitionId(String(req.params.id));
    if (!tid) return res.status(404).json({ error: "Transition tidak ditemukan." });
    await db.delete(s.workflowTransitions).where(eq(s.workflowTransitions.id, tid));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
