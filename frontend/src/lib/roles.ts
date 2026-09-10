// Legacy role ids (frontend guard) + new DB codes (backend JWT: SYS_ADMIN/ADMIN/STAFF)
// Both must be accepted because backend now returns SYS_ADMIN/ADMIN/STAFF while
// older frontend guards still use role_sys_admin/role_admin/role_staff.
export const ROLE_ADMINISTRATOR = "role_sys_admin";
export const ROLE_ADMINISTRATOR_CODE = "SYS_ADMIN";
export const ROLE_ADMIN = "role_admin";
export const ROLE_ADMIN_CODE = "ADMIN";
export const ROLE_STAFF = "role_staff";
export const ROLE_STAFF_CODE = "STAFF";

export const MANAGER_ROLES: string[] = [
  ROLE_ADMINISTRATOR,
  ROLE_ADMINISTRATOR_CODE,
  ROLE_ADMIN,
  ROLE_ADMIN_CODE,
];
export const ALL_ROLES: string[] = [
  ROLE_ADMINISTRATOR,
  ROLE_ADMINISTRATOR_CODE,
  ROLE_ADMIN,
  ROLE_ADMIN_CODE,
  ROLE_STAFF,
  ROLE_STAFF_CODE,
];

// Normalise any role string to the canonical legacy id for comparison.
export function normalizeRole(role: string): string {
  if (!role) return role;
  const r = role.trim();
  if (r === "SYS_ADMIN" || r === "role_sys_admin") return ROLE_ADMINISTRATOR;
  if (r === "ADMIN" || r === "role_admin") return ROLE_ADMIN;
  if (r === "STAFF" || r === "role_staff") return ROLE_STAFF;
  return r;
}

export function isManager(role: string) {
  return MANAGER_ROLES.includes(role);
}
