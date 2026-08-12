import type { SessionAccess } from "./session";

const systemRoleId = "role_sys_admin";

/** Cek akses menu/aksi dengan hierarki menu (sama dengan aturan backend):
 *  - cocok persis (menu, action) → boleh;
 *  - aksi apa pun pada menu itu → boleh view halamannya;
 *  - action "view": submenu mana pun mengizinkan view menu induknya.
 *  Arah sebaliknya TIDAK berlaku — permission menu induk tidak memberi akses
 *  submenu; setiap submenu digate permission-nya sendiri. */
export function can(
  isSystem: boolean,
  permissions: { menu: string; action: string }[],
  menu: string,
  action: string
): boolean {
  if (isSystem) return true;
  if (permissions.some((p) => p.menu === menu && p.action === action)) return true;
  if (permissions.some((p) => p.menu === menu)) return action === "view";
  if (action === "view" && permissions.some((p) => p.menu.startsWith(menu + "."))) return true;
  return false;
}

export function accessibleBranchIds(
  isSystem: boolean,
  access: SessionAccess,
  branches: { id: string }[] | null
): string[] {
  if (isSystem && branches) return branches.map((b) => b.id);
  return access.branchIds;
}

export function accessibleWarehouseIds(
  isSystem: boolean,
  access: SessionAccess,
  warehouses: { id: string }[] | null
): string[] {
  if (isSystem && warehouses) return warehouses.map((w) => w.id);
  return access.warehouseIds;
}

export { systemRoleId };
