// @ts-nocheck
import { Router } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { checkPermission } from "../middleware/rbac";

export const activityLogsRouter = Router();

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

const DOC_TABLE_MAP: Record<string, any> = {
  PR: s.purchaseRequests,
  MR: s.materialRequests,
  RFQ: (s as any).rfqs,
  PO: s.purchaseOrders,
  SO: s.salesOrders,
  GR: s.goodsReceipts,
  RCV: s.receivings,
  RECEIVING: s.receivings,
  QC: s.qcInspections,
  DLV: s.deliveries,
  DELIVERY: s.deliveries,
  SMV: s.stockMovements,
  OPJ: s.opnameProjects,
  SOC: s.opnameCounts,
  // Master setup (CRUD generic)
  ITEM: s.items,
  ITEM_GROUP: s.itemGroups,
  WAREHOUSE: s.warehouses,
  BRANCH: s.branches,
  LOCATION: s.locations,
  UOM: s.uom,
  DEPARTMENT: (s as any).departments,
  TAX_CATEGORY: (s as any).taxCategories,
  PRICE_LIST: (s as any).priceLists,
  PRICE_LIST_LINE: (s as any).priceListLines,
  MOVEMENT_TYPE: s.movementTypes,
  SUPPLIER: s.suppliers,
  CUSTOMER: s.customers,
  ROLE: s.roles,
  USER: s.users,
  BATCH: s.batches,
  STOCK_BATCH: s.stockBatches,
  STOCK_BARCODE: s.stockBarcodes,
  BATCH_FORMAT: s.batchFormats,
  BARCODE_FORMAT: s.barcodeFormats,
  WORKSPACE: s.workspaces,
};

const DOC_MENU_MAP: Record<string, string> = {
  PR: "supply.purchaseRequests",
  MR: "supply.materialRequests",
  RFQ: "supply.purchaseRequests",
  PO: "supply.purchaseOrders",
  SO: "supply.salesOrders",
  GR: "supply.goodsReceipts",
  RCV: "supply.receivings",
  RECEIVING: "supply.receivings",
  QC: "supply.goodsReceipts",
  DLV: "supply.deliveries",
  DELIVERY: "supply.deliveries",
  SMV: "inventory.transactions",
  OPJ: "opname",
  SOC: "opname",
  ITEM: "master.items",
  ITEM_GROUP: "master.itemGroups",
  WAREHOUSE: "inventory.warehouses",
  BRANCH: "inventory.branches",
  LOCATION: "inventory.locations",
  UOM: "master.uom",
  DEPARTMENT: "master.departments",
  TAX_CATEGORY: "master.taxCategories",
  PRICE_LIST: "master.priceLists",
  PRICE_LIST_LINE: "master.priceLists",
  MOVEMENT_TYPE: "master.movementTypes",
  SUPPLIER: "supply.suppliers",
  CUSTOMER: "supply.customers",
  ROLE: "settings.roles",
  USER: "settings.users",
  BATCH: "inventory.batches",
  STOCK_BATCH: "inventory.batches",
  STOCK_BARCODE: "inventory.batches",
  BATCH_FORMAT: "master.batchFormats",
  BARCODE_FORMAT: "master.barcodeFormats",
  WORKSPACE: "settings.roles",
};

async function resolveInternalId(table: any, pid: string): Promise<number | null> {
  if (!pid) return null;
  const str = String(pid).trim();
  if (isUuid(str)) {
    const [row] = await db.select({ id: table.id }).from(table).where(eq(table.publicId, str)).limit(1);
    return row?.id ?? null;
  }
  if (/^\d+$/.test(str)) return Number(str);
  // try documentNo
  if (table.documentNo) {
    const [row] = await db.select({ id: table.id }).from(table).where(eq(table.documentNo, str)).limit(1);
    if (row) return row.id;
  }
  return null;
}

async function enrichUsers(userIds: number[]): Promise<Map<number, { name: string; email: string; publicId: string }>> {
  if (userIds.length === 0) return new Map();
  const uniq = [...new Set(userIds.filter(Boolean))];
  if (uniq.length === 0) return new Map();
  const rows = await db.select({ id: s.users.id, name: s.users.name, email: s.users.email, publicId: s.users.publicId }).from(s.users).where(inArray(s.users.id, uniq));
  const map = new Map();
  for (const r of rows) map.set(r.id, { name: r.name, email: (r as any).email ?? null, publicId: r.publicId });
  return map;
}

async function syntheticEvents(documentType: string, docRow: any, table: any): Promise<any[]> {
  if (!docRow) return [];
  const events: any[] = [];
  const dt = documentType.toUpperCase();

  // helper to get user id fields
  const createdBy = docRow.createdBy ?? docRow.created_by ?? null;
  const createdAt = docRow.createdAt ?? docRow.created_at ?? null;
  if (createdAt) {
    events.push({
      id: `syn-create-${docRow.id}`,
      publicId: null,
      documentType: dt,
      documentId: docRow.id,
      actorUserId: createdBy,
      actorRole: null,
      action: "create",
      fromStatus: null,
      toStatus: "DRAFT",
      comment: null,
      metadata: {},
      createdAt,
      isBackfilled: true,
    });
  }

  // prepared / submitted variants
  if (docRow.preparedSignedAt || docRow.preparedBy) {
    events.push({
      id: `syn-prepare-${docRow.id}`,
      publicId: null,
      documentType: dt,
      documentId: docRow.id,
      actorUserId: docRow.preparedBy ?? docRow.prepared_by ?? null,
      actorRole: null,
      action: "prepare",
      fromStatus: "DRAFT",
      toStatus: "DRAFT",
      comment: null,
      metadata: { signature: !!docRow.preparedSignature },
      createdAt: docRow.preparedSignedAt ?? docRow.prepared_signed_at ?? createdAt,
      isBackfilled: true,
    });
  }
  if (docRow.submittedAt || docRow.submittedBy) {
    events.push({
      id: `syn-submit-${docRow.id}`,
      publicId: null,
      documentType: dt,
      documentId: docRow.id,
      actorUserId: docRow.submittedBy ?? docRow.submitted_by ?? null,
      actorRole: null,
      action: "submit",
      fromStatus: "DRAFT",
      toStatus: "PENDING_QC",
      comment: docRow.qcNotes ?? docRow.qc_notes ?? null,
      metadata: {},
      createdAt: docRow.submittedAt ?? docRow.submitted_at ?? docRow.updatedAt,
      isBackfilled: true,
    });
  }

  // status based synthetic
  const status = String(docRow.status ?? "").toUpperCase();
  const updatedAt = docRow.updatedAt ?? docRow.updated_at ?? null;
  if (status && status !== "DRAFT") {
    // avoid duplicate if status already covered by above
    const hasStatusEvent = events.some((e) => e.toStatus === status);
    if (!hasStatusEvent) {
      let action = "update";
      if (status === "POSTED") action = "post";
      else if (status === "PENDING_APPROVAL") action = "post";
      else if (status === "APPROVED") action = "approve";
      else if (status === "REJECTED") action = "reject";
      else if (status === "CANCELED") action = "cancel";
      else if (status === "COMPLETED") action = "complete";
      else if (status === "PENDING_QC") action = "submit";

      let actor = null;
      if (status === "APPROVED" || status === "REJECTED") actor = docRow.approvedBy ?? docRow.approved_by ?? null;
      else if (status === "COMPLETED" && docRow.qcInspectedBy) actor = docRow.qcInspectedBy ?? docRow.qc_inspected_by ?? null;
      else actor = createdBy;

      let ts = updatedAt;
      if (status === "APPROVED" && docRow.approvedSignedAt) ts = docRow.approvedSignedAt ?? docRow.approved_signed_at ?? updatedAt;
      if (status === "COMPLETED" && docRow.qcInspectedAt) ts = docRow.qcInspectedAt ?? docRow.qc_inspected_at ?? updatedAt;

      events.push({
        id: `syn-${status.toLowerCase()}-${docRow.id}`,
        publicId: null,
        documentType: dt,
        documentId: docRow.id,
        actorUserId: actor,
        actorRole: null,
        action,
        fromStatus: "DRAFT",
        toStatus: status,
        comment: null,
        metadata: {},
        createdAt: ts ?? updatedAt ?? createdAt,
        isBackfilled: true,
      });
    }
  }

  // sort by createdAt - terbaru di atas (desc)
  events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return events;
}

// SSE stream: push realtime saat ada log baru untuk dokumen tertentu
// Frontend fetch saat mount + listen stream ini → tanpa polling 4s
activityLogsRouter.get("/activity-logs/stream", async (req, res, next) => {
  try {
    const documentTypeRaw = String(req.query.documentType ?? "").trim();
    const documentIdRaw = String(req.query.documentId ?? "").trim();
    if (!documentTypeRaw || !documentIdRaw) return res.status(400).json({ error: "documentType & documentId wajib untuk stream." });
    const dt = documentTypeRaw.toUpperCase();
    const table = DOC_TABLE_MAP[dt];
    if (!table) return res.status(400).json({ error: `documentType ${dt} tidak dikenal.` });
    const menu = DOC_MENU_MAP[dt];
    if (menu) {
      const allowed = await checkPermission(req, res, menu, "view");
      if (!allowed) return;
    }
    const internalId = await resolveInternalId(table, documentIdRaw);
    if (!internalId) return res.status(404).json({ error: "Dokumen tidak ditemukan untuk stream." });

    // Setup SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    // @ts-ignore
    if (res.flushHeaders) res.flushHeaders();

    // Kirim komentar awal agar connection dianggap aktif
    res.write(`: connected ${dt}:${internalId}\n\n`);

    // Lazy import emitter untuk hindari circular
    const { activityEmitter } = await import("../lib/activity-log");

    const channel = `${dt}:${internalId}`;

    const send = (payload: any) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {}
    };

    const onNew = (evt: any) => {
      // channel sudah spesifik per dokumen, langsung kirim
      send(evt);
    };

    // Listen ke channel spesifik dokumen
    activityEmitter.on(channel, onNew);

    // Heartbeat tiap 15s agar proxy tidak close
    const hb = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {}
    }, 15000);

    // Cleanup saat client disconnect
    const cleanup = () => {
      clearInterval(hb);
      try { activityEmitter.off(channel, onNew); } catch {}
      try { res.end(); } catch {}
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
    // Jangan next(), biarkan koneksi tetap open
  } catch (e) {
    next(e);
  }
});

activityLogsRouter.get("/activity-logs", async (req, res, next) => {
  try {
    const documentTypeRaw = String(req.query.documentType ?? req.query.documenttype ?? "").trim();
    const documentIdRaw = String(req.query.documentId ?? req.query.documentid ?? req.query.id ?? "").trim();
    if (!documentTypeRaw || !documentIdRaw) return res.status(400).json({ error: "documentType & documentId wajib." });

    const dt = documentTypeRaw.toUpperCase();
    const table = DOC_TABLE_MAP[dt];
    if (!table) return res.status(400).json({ error: `documentType ${dt} tidak dikenal.` });

    const menu = DOC_MENU_MAP[dt];
    if (menu) {
      // check view permission for that document type, but allow if fails? Use checkPermission soft
      const allowed = await checkPermission(req, res, menu, "view");
      if (!allowed) return;
    }

    const internalId = await resolveInternalId(table, documentIdRaw);
    if (!internalId) return res.json([]);

    // fetch real activities - terbaru di atas
    const rows = await db
      .select()
      .from(s.documentActivities)
      .where(and(eq(s.documentActivities.documentType, dt), eq(s.documentActivities.documentId, internalId)))
      .orderBy(desc(s.documentActivities.createdAt));

    // if no real logs, synthesize from document row
    let out: any[] = rows.map((r: any) => ({ ...r, isBackfilled: false }));
    if (out.length === 0) {
      const [docRow] = await db.select().from(table).where(eq(table.id, internalId)).limit(1);
      if (docRow) {
        const syn = await syntheticEvents(dt, docRow, table);
        out = syn;
      }
    }

    // enrich actor names
    const userIds = out.map((r: any) => r.actorUserId).filter(Boolean);
    const userMap = await enrichUsers(userIds as number[]);

    let enriched = out.map((r: any) => ({
      id: r.publicId ?? r.id,
      publicId: r.publicId ?? null,
      documentType: r.documentType,
      documentId: internalId,
      actorUserId: r.actorUserId,
      actorName: r.actorUserId ? (userMap.get(r.actorUserId)?.name ?? null) : null,
      actorEmail: r.actorUserId ? (userMap.get(r.actorUserId)?.email ?? null) : null,
      actorRole: r.actorRole ?? null,
      action: r.action,
      fromStatus: r.fromStatus ?? null,
      toStatus: r.toStatus ?? null,
      comment: r.comment ?? null,
      metadata: r.metadata ?? {},
      createdAt: r.createdAt,
      isBackfilled: !!r.isBackfilled,
    }));
    // limit param for retention-forever pagination (client can send ?limit=50) - desc order jadi ambil paling atas
    const limitRaw = (req.query as any).limit ?? (req.query as any).pageSize;
    const limitNum = limitRaw ? Number(limitRaw) : null;
    if (limitNum && Number.isFinite(limitNum) && limitNum > 0 && limitNum < 1000) {
      enriched = enriched.slice(0, limitNum);
    }

    res.json(enriched);
  } catch (e) {
    next(e);
  }
});

// also support path param style: GET /activity-logs/:documentType/:documentId
activityLogsRouter.get("/activity-logs/:documentType/:documentId", async (req, res, next) => {
  // delegate to query handler by rewriting
  (req.query as any).documentType = req.params.documentType;
  (req.query as any).documentId = req.params.documentId;
  // call same logic
  try {
    const dt = String(req.params.documentType ?? "").toUpperCase();
    const pid = String(req.params.documentId ?? "");
    const table = DOC_TABLE_MAP[dt];
    if (!table) return res.status(400).json({ error: `documentType ${dt} tidak dikenal.` });
    const menu = DOC_MENU_MAP[dt];
    if (menu) {
      const allowed = await checkPermission(req, res, menu, "view");
      if (!allowed) return;
    }
    const internalId = await resolveInternalId(table, pid);
    if (!internalId) return res.json([]);
    const rows = await db
      .select()
      .from(s.documentActivities)
      .where(and(eq(s.documentActivities.documentType, dt), eq(s.documentActivities.documentId, internalId)))
      .orderBy(desc(s.documentActivities.createdAt));
    let out: any[] = rows.map((r: any) => ({ ...r, isBackfilled: false }));
    if (out.length === 0) {
      const [docRow] = await db.select().from(table).where(eq(table.id, internalId)).limit(1);
      if (docRow) out = await syntheticEvents(dt, docRow, table);
    }
    const userIds = out.map((r: any) => r.actorUserId).filter(Boolean);
    const userMap = await enrichUsers(userIds as number[]);
    let enriched2 = out.map((r: any) => ({
      id: r.publicId ?? r.id,
      publicId: r.publicId ?? null,
      documentType: r.documentType,
      documentId: internalId,
      actorUserId: r.actorUserId,
      actorName: r.actorUserId ? (userMap.get(r.actorUserId)?.name ?? null) : null,
      actorEmail: r.actorUserId ? (userMap.get(r.actorUserId)?.email ?? null) : null,
      actorRole: r.actorRole ?? null,
      action: r.action,
      fromStatus: r.fromStatus ?? null,
      toStatus: r.toStatus ?? null,
      comment: r.comment ?? null,
      metadata: r.metadata ?? {},
      createdAt: r.createdAt,
      isBackfilled: !!r.isBackfilled,
    }));
    const limitRaw2 = (req.query as any).limit ?? (req.query as any).pageSize;
    const limitNum2 = limitRaw2 ? Number(limitRaw2) : null;
    if (limitNum2 && Number.isFinite(limitNum2) && limitNum2 > 0 && limitNum2 < 1000) enriched2 = enriched2.slice(0, limitNum2);
    res.json(enriched2);
  } catch (e) {
    next(e);
  }
});
