import { EventEmitter } from "events";
import { db } from "../db/pool";
import * as s from "../db/schema";
import { eq } from "drizzle-orm";

// Event bus untuk SSE realtime activity log — di-emit setiap logActivity sukses
export const activityEmitter = new EventEmitter();
// Hindari memory leak warning saat banyak SSE client terkoneksi
activityEmitter.setMaxListeners(0);

type LogParams = {
  documentType: string;
  documentId: number;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  comment?: string | null;
  metadata?: Record<string, unknown>;
  actorUserId?: number | null;
  actorRole?: string | null;
  tx?: any;
};

export async function logActivity(params: LogParams) {
  const {
    documentType,
    documentId,
    action,
    fromStatus,
    toStatus,
    comment,
    metadata,
    actorUserId,
    actorRole,
    tx,
  } = params;

  const executor = tx ?? db;
  try {
    const [inserted] = await executor.insert(s.documentActivities).values({
      documentType: String(documentType).toUpperCase(),
      documentId,
      actorUserId: actorUserId ?? null,
      actorRole: actorRole ?? null,
      action: String(action).toLowerCase(),
      fromStatus: fromStatus ?? null,
      toStatus: toStatus ?? null,
      comment: comment ?? null,
      metadata: metadata ?? {},
    }).returning();
    // Emit untuk SSE — kirim minimal payload agar FE bisa invalidate/refetch
    try {
      const dtUp = String(documentType).toUpperCase();
      activityEmitter.emit("new", {
        documentType: dtUp,
        documentId,
        action: String(action).toLowerCase(),
        id: (inserted as any)?.id ?? null,
        publicId: (inserted as any)?.publicId ?? null,
        createdAt: (inserted as any)?.createdAt ?? new Date().toISOString(),
      });
      // Channel spesifik per dokumen untuk filter efisien di SSE handler
      activityEmitter.emit(`${dtUp}:${documentId}`, {
        documentType: dtUp,
        documentId,
        action: String(action).toLowerCase(),
        id: (inserted as any)?.id ?? null,
        publicId: (inserted as any)?.publicId ?? null,
        createdAt: (inserted as any)?.createdAt ?? new Date().toISOString(),
      });
    } catch {}
  } catch (e) {
    // log should not block main transaction, but we are inside same tx, so rethrow to allow caller to handle
    // if called without tx, we swallow error to avoid breaking main flow
    if (tx) throw e;
    console.error("logActivity failed (non-tx):", e);
  }
}

export async function getActorInfo(req: any): Promise<{ internalId: number | null; role: string | null }> {
  const publicId = req?.user?.id ?? null;
  const role = req?.user?.role ?? null;
  if (!publicId) return { internalId: req?.user?.internalId ?? null, role };
  if (req?.user?.internalId) return { internalId: req.user.internalId, role };
  try {
    const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.publicId, publicId)).limit(1);
    return { internalId: u?.id ?? null, role };
  } catch {
    return { internalId: null, role };
  }
}
