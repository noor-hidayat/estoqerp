// Middleware RBAC — permission menu per role + akses entitas (branch/warehouse) per role.
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/pool";
import { roles, rolePermissions, branchAccesses, workspaceAccesses, branches, warehouses, workspaces } from "../db/schema";

type EntityType = "BRANCH" | "WAREHOUSE";

export const systemRoleId = "role_sys_admin"; // legacy, kept for compat, use isAdminUser() instead

const systemRoleCache = new Map<string, boolean>();

async function resolveRoleInternalId(roleId: string): Promise<number | null> {
  if (!roleId) return null;
  if (/^\d+$/.test(roleId)) return Number(roleId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(roleId);
  if (isUuid) {
    const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.publicId, roleId)).limit(1);
    if (r) return r.id;
  }
  // try by code (SYS_ADMIN)
  const [byCode] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, roleId)).limit(1);
  if (byCode) return byCode.id;
  // legacy text id still in JWT during transition
  // try publicId fallback
  const [byPublic] = await db.select({ id: roles.id }).from(roles).where(eq(roles.publicId, roleId)).limit(1);
  if (byPublic) return byPublic.id;
  return null;
}

export async function isAdminUser(roleId: string): Promise<boolean> {
  if (!roleId) return false;
  if (systemRoleCache.has(roleId)) return systemRoleCache.get(roleId)!;
  // legacy hard-coded string always admin for backward compat during migration
  if (roleId === systemRoleId) {
    systemRoleCache.set(roleId, true);
    return true;
  }
  let internalId: number | null = null;
  if (/^\d+$/.test(roleId)) internalId = Number(roleId);
  else {
    internalId = await resolveRoleInternalId(roleId);
  }
  let ok = false;
  if (internalId !== null) {
    const [r] = await db.select({ isSystem: roles.isSystem }).from(roles).where(eq(roles.id, internalId)).limit(1);
    ok = r?.isSystem ?? false;
  } else {
    // try publicId directly
    const [r] = await db.select({ isSystem: roles.isSystem }).from(roles).where(eq(roles.publicId, roleId)).limit(1);
    ok = r?.isSystem ?? false;
    if (!ok) {
      const [r2] = await db.select({ isSystem: roles.isSystem }).from(roles).where(eq(roles.code, roleId)).limit(1);
      ok = r2?.isSystem ?? false;
    }
  }
  systemRoleCache.set(roleId, ok);
  return ok;
}

// helper to get internal role id for queries
export async function getRoleInternalId(roleId: string): Promise<number | null> {
  return resolveRoleInternalId(roleId);
}

/** Cek permission langsung (non-middleware). Res 403 jika tidak punya akses.
 *
 *  Menu bersifat hierarkis (mis. "opname.detail.scan" berada di bawah
 *  "opname.detail" dan "opname"). Aturan akses — cocok PERSIS saja:
 *  - Cocok persis (menu, action) → boleh.
 *  - Aksi apa pun pada menu itu → boleh view halamannya.
 *  - Action "view": permission di submenu mengizinkan view menu induknya
 *    (untuk mencapai submenu harus bisa membuka induknya). Arah sebaliknya
 *    TIDAK berlaku — permission menu induk tidak otomatis memberi akses
 *    submenu; setiap submenu digate permission-nya sendiri.
 */
export async function hasPermission(
  roleId: string,
  menu: string,
  action: string
): Promise<boolean> {
  const internalId = await resolveRoleInternalId(roleId);
  const perms = await db
    .select({ menu: rolePermissions.menu, action: rolePermissions.action })
    .from(rolePermissions)
    .where(internalId !== null ? eq(rolePermissions.roleId, internalId) : eq(rolePermissions.roleId, -1 as any));

  // Cocok persis.
  if (perms.some((p) => p.menu === menu && p.action === action)) return true;

  if (perms.some((p) => p.menu === menu)) {
    // Aksi apa pun pada menu itu tetap berarti boleh melihat halamannya.
    return action === "view";
  }

  // Action "view": submenu mana pun mengizinkan view menu induknya.
  if (action === "view" && perms.some((p) => p.menu.startsWith(menu + "."))) {
    return true;
  }

  return false;
}

/** Cek permission langsung (non-middleware). Res 403 jika tidak punya akses. */
export async function checkPermission(
  req: Request,
  res: Response,
  menu: string,
  action: string
): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return false;
  }
  if (await isAdminUser(req.user.role)) return true;
  if (await hasPermission(req.user.role, menu, action)) return true;
  res.status(403).json({ error: "Tidak memiliki akses." });
  return false;
}

/** Cek apakah role boleh menggunakan fitur opname — punya akses menu opname
 *  apa pun (list, detail, scan, session, variance). */
export async function canViewOpnameContext(roleId: string): Promise<boolean> {
  const internalId = await resolveRoleInternalId(roleId);
  const menus = await db
    .select({ menu: rolePermissions.menu })
    .from(rolePermissions)
    .where(internalId !== null ? eq(rolePermissions.roleId, internalId) : eq(rolePermissions.roleId, -1 as any));
  return menus.some((p) => p.menu === "opname" || p.menu.startsWith("opname."));
}

/** Sama dengan checkPermission, tetapi boleh: pass jika SALAH SATU menu
 *  memberi akses. Dipakai tabel yang dibaca lintas fitur (mis. scan_records
 *  dibaca halaman Scan, halaman Session, dan laporan Riwayat Scan). */
export async function checkAnyPermission(
  req: Request,
  res: Response,
  menus: string[],
  action: string
): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return false;
  }
  if (await isAdminUser(req.user.role)) return true;
  for (const menu of menus) {
    if (await hasPermission(req.user.role, menu, action)) return true;
  }
  res.status(403).json({ error: "Tidak memiliki akses." });
  return false;
}

/** Cek apakah ROLE user punya akses ke entitas tertentu (branch/warehouse).
 *  Akses entitas murni per role — diatur di Role Management. */
export async function canAccessEntity(
  userRoleId: string,
  type: EntityType,
  entityId: string | number
): Promise<boolean> {
  const internalRoleId = await resolveRoleInternalId(userRoleId);
  if (internalRoleId === null) return false;
  let internalEntityId: number | null = null;
  if (typeof entityId === "number") internalEntityId = entityId;
  else if (/^\d+$/.test(String(entityId))) internalEntityId = Number(entityId);
  else {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(entityId));
    if (isUuid) {
      // try branches
      if (type === "BRANCH") {
        const [b] = await db.select({ id: branches.id }).from(branches).where(eq(branches.publicId, String(entityId))).limit(1);
        if (b) internalEntityId = b.id;
      } else {
        const [w] = await db.select({ id: warehouses.id }).from(warehouses).where(eq(warehouses.publicId, String(entityId))).limit(1);
        if (w) internalEntityId = w.id;
      }
    }
    if (internalEntityId === null) {
      // try numeric fallback via code? not needed
      const n = Number(entityId);
      if (!Number.isNaN(n)) internalEntityId = n;
    }
  }
  if (internalEntityId === null) return false;
  const [ra] = await db
    .select({ id: branchAccesses.id })
    .from(branchAccesses)
    .where(
      and(
        eq(branchAccesses.roleId, internalRoleId),
        eq(branchAccesses.entityType, type),
        eq(branchAccesses.entityId, internalEntityId)
      )
    )
    .limit(1);
  return !!ra;
}

export async function canAccessWorkspace(roleId: string, workspaceId: string): Promise<boolean> {
  if (await isAdminUser(roleId)) return true;
  const internalRoleId = await resolveRoleInternalId(roleId);
  if (internalRoleId === null) return false;
  let internalWsId: number | null = null;
  if (/^\d+$/.test(workspaceId)) internalWsId = Number(workspaceId);
  else {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId);
    if (isUuid) {
      const [w] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.publicId, workspaceId)).limit(1);
      if (w) internalWsId = w.id;
    }
  }
  if (internalWsId === null) return false;
  const [r] = await db
    .select({ id: workspaceAccesses.id })
    .from(workspaceAccesses)
    .where(and(eq(workspaceAccesses.roleId, internalRoleId), eq(workspaceAccesses.workspaceId, internalWsId)))
    .limit(1);
  return !!r;
}

export async function hasWorkspaceAccess(req: Request, workspaceId: string): Promise<boolean> {
  if (!req.user) return false;
  if (await isAdminUser(req.user.role)) return true;
  const ids = req.accessibleWorkspaceIds ?? [];
  // ids are internal bigint numbers stringified or publicIds
  return ids.includes(workspaceId) || ids.includes(String(workspaceId));
}
