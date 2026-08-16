// Middleware RBAC — permission menu per role + akses entitas (branch/warehouse) per role.
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/pool";
import { roles, rolePermissions, branchAccesses } from "../db/schema";

type EntityType = "BRANCH" | "WAREHOUSE";

export const systemRoleId = "role_sys_admin";

const systemRoleCache = new Map<string, boolean>();

export async function isAdminUser(roleId: string): Promise<boolean> {
  if (systemRoleCache.has(roleId)) return systemRoleCache.get(roleId)!;
  const [r] = await db
    .select({ isSystem: roles.isSystem })
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);
  const ok = r?.isSystem ?? false;
  systemRoleCache.set(roleId, ok);
  return ok;
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
  const perms = await db
    .select({ menu: rolePermissions.menu, action: rolePermissions.action })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));

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
  const menus = await db
    .select({ menu: rolePermissions.menu })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));
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
  entityId: string
): Promise<boolean> {
  const [ra] = await db
    .select({ id: branchAccesses.id })
    .from(branchAccesses)
    .where(
      and(
        eq(branchAccesses.roleId, userRoleId),
        eq(branchAccesses.entityType, type),
        eq(branchAccesses.entityId, entityId)
      )
    )
    .limit(1);
  return !!ra;
}
