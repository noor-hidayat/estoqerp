import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt";

export interface AuthUser {
  id: string; // publicId uuid v7
  email: string;
  role: string; // role publicId or string numeric internal - kept as string for JWT
  internalId?: number; // bigint internal id (optional cache)
  roleInternalId?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    res.status(401).json({ error: "Sesi tidak valid atau sudah kedaluwarsa." });
  }
}

function roleMatches(required: string, actual: string): boolean {
  if (required === actual) return true;
  // Legacy ↔ new code alias for sys admin / admin / staff
  const alias: Record<string, string[]> = {
    role_sys_admin: ["SYS_ADMIN", "role_sys_admin"],
    SYS_ADMIN: ["role_sys_admin", "SYS_ADMIN"],
    role_admin: ["ADMIN", "role_admin"],
    ADMIN: ["role_admin", "ADMIN"],
    role_staff: ["STAFF", "role_staff"],
    STAFF: ["role_staff", "STAFF"],
  };
  return alias[required]?.includes(actual) ?? false;
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.some((r) => roleMatches(r, req.user!.role))) {
      res.status(403).json({ error: "Tidak memiliki akses." });
      return;
    }
    next();
  };
}
