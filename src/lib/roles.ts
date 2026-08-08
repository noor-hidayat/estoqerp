import type { Role } from "@/types";

export const ROLE_ADMINISTRATOR: Role = "ADMINISTRATOR";
export const ROLE_ADMIN: Role = "ADMIN";
export const ROLE_STAFF: Role = "STAFF";

export const MANAGER_ROLES: Role[] = [ROLE_ADMINISTRATOR, ROLE_ADMIN];
export const ALL_ROLES: Role[] = [ROLE_ADMINISTRATOR, ROLE_ADMIN, ROLE_STAFF];

export function isManager(role: Role) {
  return MANAGER_ROLES.includes(role);
}