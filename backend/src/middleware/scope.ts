import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";

declare global {
  namespace Express {
    interface Request {
      // internal bigint ids stored as numbers (or string numeric for compat)
      accessibleBranchIds?: (number | string)[];
      accessibleWarehouseIds?: (number | string)[];
      accessibleWorkspaceIds?: (number | string)[];
    }
  }
}

async function resolveRoleInternal(roleId: string): Promise<number | null> {
  if (!roleId) return null;
  if (/^\d+$/.test(roleId)) return Number(roleId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleId);
  if (isUuid) {
    const [r] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.publicId, roleId)).limit(1);
    if (r) return r.id;
  }
  const [byCode] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.code, roleId)).limit(1);
  if (byCode) return byCode.id;
  if (roleId === "role_sys_admin" || roleId === "SYS_ADMIN") {
    const [sys] = await db.select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.isSystem, true)).limit(1);
    return sys?.id ?? null;
  }
  return null;
}

async function isAdmin(roleId: string): Promise<boolean> {
  if (!roleId) return false;
  if (roleId === "role_sys_admin" || roleId === "SYS_ADMIN") return true;
  const internal = await resolveRoleInternal(roleId);
  if (internal === null) {
    const [r] = await db.select({ isSystem: schema.roles.isSystem }).from(schema.roles).where(eq(schema.roles.publicId, roleId)).limit(1);
    return r?.isSystem ?? false;
  }
  const [r] = await db
    .select({ isSystem: schema.roles.isSystem })
    .from(schema.roles)
    .where(eq(schema.roles.id, internal))
    .limit(1);
  return r?.isSystem ?? false;
}

export function resolveScope(req: Request, _res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) { next(); return; }

  void (async () => {
    try {
      const admin = await isAdmin(user.role);
      if (admin) {
        const allBranches = await db.select({ id: schema.branches.id }).from(schema.branches);
        const allWarehouses = await db.select({ id: schema.warehouses.id }).from(schema.warehouses);
        const allWorkspaces = await db.select({ id: schema.workspaces.id }).from(schema.workspaces);
        req.accessibleBranchIds = allBranches.map((b) => b.id);
        req.accessibleWarehouseIds = allWarehouses.map((w) => w.id);
        req.accessibleWorkspaceIds = allWorkspaces.map((w) => w.id);
        next();
        return;
      }

      const internalRoleId = await resolveRoleInternal(user.role);
      const branchSet = new Set<number>();
      const warehouseSet = new Set<number>();
      const workspaceSet = new Set<number>();

      if (internalRoleId !== null) {
        const ras = await db
          .select({ entityType: schema.branchAccesses.entityType, entityId: schema.branchAccesses.entityId })
          .from(schema.branchAccesses)
          .where(eq(schema.branchAccesses.roleId, internalRoleId));

        for (const e of ras) {
          if (e.entityType === "BRANCH") branchSet.add(e.entityId);
          if (e.entityType === "WAREHOUSE") {
            warehouseSet.add(e.entityId);
            const [wh] = await db
              .select({ branchId: schema.warehouses.branchId })
              .from(schema.warehouses)
              .where(eq(schema.warehouses.id, e.entityId))
              .limit(1);
            if (wh) branchSet.add(wh.branchId);
          }
        }

        const was = await db
          .select({ workspaceId: schema.workspaceAccesses.workspaceId })
          .from(schema.workspaceAccesses)
          .where(eq(schema.workspaceAccesses.roleId, internalRoleId));
        for (const w of was) workspaceSet.add(w.workspaceId);
      }

      req.accessibleBranchIds = [...branchSet];
      req.accessibleWarehouseIds = [...warehouseSet];
      req.accessibleWorkspaceIds = [...workspaceSet];
      next();
    } catch (e) {
      next(e);
    }
  })();
}
