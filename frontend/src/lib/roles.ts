export const ROLE_ADMINISTRATOR = "role_sys_admin";
export const ROLE_ADMIN = "role_admin";
export const ROLE_STAFF = "role_staff";

export const MANAGER_ROLES: string[] = [ROLE_ADMINISTRATOR, ROLE_ADMIN];
export const ALL_ROLES: string[] = [ROLE_ADMINISTRATOR, ROLE_ADMIN, ROLE_STAFF];

export function isManager(role: string) {
  return MANAGER_ROLES.includes(role);
}
