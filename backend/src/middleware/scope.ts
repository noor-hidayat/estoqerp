import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";

declare global {
  namespace Express {
    interface Request {
      accessibleBranchIds?: string[];
      accessibleWarehouseIds?: string[];
    }
  }
}

async function isAdmin(roleId: string): Promise<boolean> {
  const [r] = await db
    .select({ isSystem: schema.roles.isSystem })
    .from(schema.roles)
    .where(eq(schema.roles.id, roleId))
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
        req.accessibleBranchIds = allBranches.map((b) => b.id);
        req.accessibleWarehouseIds = allWarehouses.map((w) => w.id);
        next();
        return;
      }

      const branchSet = new Set<string>();
      const warehouseSet = new Set<string>();

      const ras = await db
        .select({ entityType: schema.branchAccesses.entityType, entityId: schema.branchAccesses.entityId })
        .from(schema.branchAccesses)
        .where(eq(schema.branchAccesses.roleId, user.role));

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

      req.accessibleBranchIds = [...branchSet];
      req.accessibleWarehouseIds = [...warehouseSet];
      next();
    } catch (e) {
      next(e);
    }
  })();
}
