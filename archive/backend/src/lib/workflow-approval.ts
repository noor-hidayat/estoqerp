import { and, eq } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";

// Build snapshot of all approval levels for a document.
// Returns array ordered by orderNo, with status: pending/approved/rejected/current
export type ApprovalLevel = {
  level: number;
  orderNo: number;
  stateId: number;
  stateName: string;
  statePublicId?: string | null;
  type: string; // intermediate/final etc
  requiresSignature: boolean;
  roleCodes: string[]; // from transition allowedRoleIds -> roles.code
  roleNames: string[];
  rolePublicIds: string[];
  status: "pending" | "approved" | "rejected" | "current" | "skipped";
  actorName?: string | null;
  actorPublicId?: string | null;
  actedAt?: string | null;
};

export async function buildApprovalLevels(opts: {
  workflowId: number | null | undefined;
  documentType?: string; // PR/MR/PO etc, used to fallback default workflow
  currentLevel?: number | null;
  docStatus?: string | null;
  approvedBy?: number | null;
  approvedAt?: string | Date | null;
  // optional: instance detail
  instanceId?: number | null;
}): Promise<ApprovalLevel[]> {
  let wfId = opts.workflowId ?? null;
  if (!wfId && opts.documentType) {
    const [def] = await db.select({ id: s.workflows.id }).from(s.workflows).where(and(eq(s.workflows.documentType, String(opts.documentType).toUpperCase()), eq(s.workflows.isDefault, true), eq(s.workflows.isActive, true))).limit(1);
    if (def) wfId = def.id;
  }
  if (!wfId) return [];

  const states = await db.select().from(s.workflowStates).where(eq(s.workflowStates.workflowId, wfId)).orderBy(s.workflowStates.orderNo as any);
  if (states.length === 0) return [];

  // Filter to intermediate + final? Keep all non-initial for approval steps
  // In seed, initial = DRAFT, intermediate = level 1..n, final = approved, rejected = rejected
  // We want intermediate levels + final as last approval? Let's include intermediate + final where type != "initial" && type != "rejected"
  const approvalStates = states.filter((st: any) => st.type === "intermediate" || st.type === "final").sort((a: any, b: any) => a.orderNo - b.orderNo);
  const relevant = approvalStates.length > 0 ? approvalStates : states.filter((st: any) => st.type !== "initial" && st.type !== "rejected");

  // Load transitions to get allowedRoleIds per state
  const transitions = await db.select().from(s.workflowTransitions).where(eq(s.workflowTransitions.workflowId, wfId));
  // Map fromStateId -> roles
  const stateRoleMap = new Map<number, { roleCodes: string[]; roleNames: string[]; rolePublicIds: string[] }>();

  for (const st of relevant) {
    // find transition where toStateId == st.id or from is previous state's target
    // Workflow_transitions: fromStateId -> toStateId, trigger approve etc, allowedRoleIds jsonb array of publicId/code
    const incoming = transitions.filter((t: any) => t.toStateId === st.id && t.trigger === "approve");
    // If none, try from previous state's outgoing
    let roleIds: string[] = [];
    if (incoming.length > 0) {
      for (const tr of incoming) {
        const ids = (tr as any).allowedRoleIds as unknown;
        if (Array.isArray(ids)) roleIds.push(...ids.map(String));
        else if (typeof ids === "string" && ids) roleIds.push(ids);
      }
    } else {
      // fallback: find transition from previous approval state
      const prevIdx = relevant.findIndex((r: any) => r.id === st.id) - 1;
      if (prevIdx >= 0) {
        const prev = relevant[prevIdx] as any;
        const out = transitions.filter((t: any) => t.fromStateId === prev.id);
        for (const tr of out) {
          const ids = (tr as any).allowedRoleIds as unknown;
          if (Array.isArray(ids)) roleIds.push(...ids.map(String));
        }
      } else {
        // first level: from initial
        const initial = states.find((x: any) => x.type === "initial");
        if (initial) {
          const out = transitions.filter((t: any) => t.fromStateId === initial.id);
          for (const tr of out) {
            const ids = (tr as any).allowedRoleIds as unknown;
            if (Array.isArray(ids)) roleIds.push(...ids.map(String));
          }
        }
      }
    }
    roleIds = [...new Set(roleIds)];
    let roleCodes: string[] = [];
    let roleNames: string[] = [];
    let rolePublicIds: string[] = [];
    if (roleIds.length > 0) {
      const allRoles = await db.select({ publicId: s.roles.publicId, code: s.roles.code, name: s.roles.name }).from(s.roles);
      const mapByPublic = new Map(allRoles.map(r => [r.publicId, r]));
      const mapByCode = new Map(allRoles.map(r => [r.code, r]));
      for (const rid of roleIds) {
        const found = mapByPublic.get(rid) ?? mapByCode.get(rid);
        if (found) {
          roleCodes.push(found.code ?? rid);
          roleNames.push(found.name ?? rid);
          rolePublicIds.push(found.publicId);
        } else {
          roleCodes.push(rid);
          roleNames.push(rid);
        }
      }
    }
    stateRoleMap.set(st.id, { roleCodes, roleNames, rolePublicIds });
  }

  // Determine status per level based on docStatus & currentLevel & workflow_logs
  const currentLevel = Number(opts.currentLevel ?? 0);
  const docStatus = String(opts.docStatus ?? "").toUpperCase();
  // Fetch workflow_logs if instance exists for richer actor info
  let logs: any[] = [];
  if (opts.instanceId) {
    logs = await db.select().from(s.workflowLogs).where(eq(s.workflowLogs.instanceId, opts.instanceId)).orderBy(s.workflowLogs.createdAt as any);
  } else if (wfId && opts.documentType) {
    // Try to find instance via documentType+? Not linked to document table, so skip logs unless instanceId known
  }
  // Build levels
  const levels: ApprovalLevel[] = relevant.map((st: any, idx: number) => {
    const levelNo = idx + 1;
    const roles = stateRoleMap.get(st.id) ?? { roleCodes: [], roleNames: [], rolePublicIds: [] };
    let status: ApprovalLevel["status"] = "pending";
    if (docStatus === "APPROVED" || docStatus === "POSTED") {
      status = "approved";
    } else if (docStatus === "REJECTED" || docStatus === "CANCELED") {
      // if rejected, levels up to current are approved, current is rejected?
      if (levelNo < currentLevel) status = "approved";
      else if (levelNo === currentLevel) status = "rejected";
      else status = "skipped";
    } else if (docStatus === "PENDING_APPROVAL") {
      if (levelNo < currentLevel) status = "approved";
      else if (levelNo === currentLevel) status = "current";
      else status = "pending";
    } else {
      status = "pending";
    }
    // Override with logs if available
    const logForState = logs.find((l: any) => l.toStateId === st.id || l.fromStateId === st.id);
    let actorName: string | null = null;
    let actorPublicId: string | null = null;
    let actedAt: string | null = null;
    if (logForState) {
      // enrich actor name later if needed
      actedAt = logForState.createdAt ? new Date(logForState.createdAt).toISOString() : null;
    }
    return {
      level: levelNo,
      orderNo: st.orderNo,
      stateId: st.id,
      statePublicId: st.publicId,
      stateName: st.name ?? `Level ${levelNo}`,
      type: st.type,
      requiresSignature: !!st.requiresSignature,
      roleCodes: roles.roleCodes,
      roleNames: roles.roleNames,
      rolePublicIds: roles.rolePublicIds,
      status,
      actorName,
      actorPublicId,
      actedAt,
    };
  });

  // If doc is APPROVED, mark all as approved
  if (docStatus === "APPROVED" && levels.length > 0) {
    levels.forEach(l => (l.status = "approved"));
  }

  return levels;
}

// Helper to snapshot approvalLevels and include in activity log metadata
export async function snapshotApprovalLevelsForDoc(opts: {
  documentType: string;
  workflowId?: number | null;
  currentLevel?: number | null;
  status?: string | null;
  approvedBy?: number | null;
}): Promise<ApprovalLevel[]> {
  try {
    return await buildApprovalLevels({
      workflowId: opts.workflowId ?? null,
      documentType: opts.documentType,
      currentLevel: opts.currentLevel ?? 0,
      docStatus: opts.status ?? null,
    });
  } catch {
    return [];
  }
}
