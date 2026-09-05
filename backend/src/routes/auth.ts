import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import { refreshTokens, users, roles, rolePermissions, branchAccesses, branches, warehouses } from "../db/schema";
import * as schema from "../db/schema";
import { config } from "../config";
import { requireAuth, requireRoles, type AuthUser } from "../middleware/auth";
import { signAccessToken } from "../utils/jwt";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from "../utils/tokens";

export const authRouter = Router();

export type PublicUser = {
  id: string; // publicId uuid v7
  publicId: string;
  internalId: number;
  name: string;
  email: string;
  role: string; // publicId or code for compat
  roleId?: number | null;
  active: boolean;
  avatarHue: number;
  createdAt: Date;
};

export async function toPublicUser(row: typeof users.$inferSelect): Promise<PublicUser> {
  const { passwordHash: _passwordHash, publicId, id, roleId, ...rest } = row as any;
  let roleStr: string = "";
  if (roleId) {
    const [r] = await db.select({ publicId: roles.publicId, code: roles.code, isSystem: roles.isSystem }).from(roles).where(eq(roles.id, roleId)).limit(1);
    if (r) {
      if (r.isSystem) roleStr = r.code ?? r.publicId;
      else roleStr = r.publicId;
    } else roleStr = String(roleId);
  }
  return {
    id: publicId,
    publicId,
    internalId: id,
    name: (row as any).name,
    email: (row as any).email,
    role: roleStr,
    roleId: roleId ?? null,
    active: (row as any).active,
    avatarHue: (row as any).avatarHue,
    createdAt: (row as any).createdAt,
  };
}
function toPublicUserSync(row: typeof users.$inferSelect): PublicUser {
  const { passwordHash: _passwordHash, publicId, id, roleId, ...rest } = row as any;
  // sync fallback without DB lookup for role (used where role not needed)
  return {
    id: publicId,
    publicId,
    internalId: id,
    name: (row as any).name,
    email: (row as any).email,
    role: roleId ? String(roleId) : "",
    roleId: roleId ?? null,
    active: (row as any).active,
    avatarHue: (row as any).avatarHue,
    createdAt: (row as any).createdAt,
  };
}

function issueTokens(user: PublicUser) {
  const accessToken = signAccessToken({
    sub: user.publicId,
    email: user.email,
    role: user.role,
  });
  const { token: refreshToken, hash } = generateRefreshToken();
  return { accessToken, refreshToken, hash };
}

async function resolveUserInternalId(publicId: string): Promise<number | null> {
  if (!publicId) return null;
  if (/^\d+$/.test(publicId)) return Number(publicId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId);
  if (isUuid) {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
    return u?.id ?? null;
  }
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return u?.id ?? null;
}

async function persistRefreshToken(userPublicId: string, hash: string) {
  const internalId = await resolveUserInternalId(userPublicId);
  if (internalId === null) throw new Error("User not found for refresh token");
  await db.insert(refreshTokens).values({
    userId: internalId,
    tokenHash: hash,
    expiresAt: refreshTokenExpiry(config.jwtRefreshExpiresDays),
  });
}

async function findUserById(publicId: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(publicId);
  if (isUuid) {
    const [row] = await db.select().from(users).where(eq(users.publicId, publicId));
    return row ?? null;
  }
  if (/^\d+$/.test(publicId)) {
    const [row] = await db.select().from(users).where(eq(users.id, Number(publicId)));
    return row ?? null;
  }
  // try email? fallback by publicId
  const [row] = await db.select().from(users).where(eq(users.publicId, publicId));
  return row ?? null;
}

async function findUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return row ?? null;
}

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    res.status(400).json({ error: "Email dan password wajib diisi." });
    return;
  }

  const user = await findUserByEmail(String(email));
  if (!user || !user.active) {
    res.status(401).json({ error: "Email atau password salah." });
    return;
  }

  const valid = await bcrypt.compare(String(password), user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Email atau password salah." });
    return;
  }

  const publicUser = await toPublicUser(user);
  const { accessToken, refreshToken, hash } = issueTokens(publicUser);
  await persistRefreshToken(publicUser.publicId, hash);

  res.json({ accessToken, refreshToken, user: publicUser });
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) {
    res.status(400).json({ error: "Refresh token wajib diisi." });
    return;
  }

  const tokenHash = hashRefreshToken(String(refreshToken));
  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash));

  if (!stored || stored.expiresAt.getTime() < Date.now()) {
    res.status(401).json({ error: "Refresh token tidak valid." });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, stored.userId)).limit(1);
  if (!user || !user.active) {
    res.status(401).json({ error: "Akun tidak aktif." });
    return;
  }

  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  const publicUser = await toPublicUser(user);
  const tokens = issueTokens(publicUser);
  await persistRefreshToken(publicUser.publicId, tokens.hash);

  res.json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: publicUser,
  });
});

authRouter.post("/logout", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (refreshToken) {
    const tokenHash = hashRefreshToken(String(refreshToken));
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
  }
  res.status(204).end();
});

authRouter.post(
  "/register",
  requireAuth,
  requireRoles("role_sys_admin"),
  async (req, res) => {
  const { name, email, password, roleId } = req.body ?? {};
  if (!name || !email || !password) {
    res.status(400).json({ error: "Nama, email, dan password wajib diisi." });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password minimal 6 karakter." });
    return;
  }

  const normalizedEmail = String(email).toLowerCase();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: "Email sudah terdaftar." });
    return;
  }

  let roleInternalId: number | null = null;
  if (roleId) {
    if (/^\d+$/.test(String(roleId))) roleInternalId = Number(roleId);
    else {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(roleId));
      if (isUuid) {
        const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.publicId, String(roleId))).limit(1);
        if (r) roleInternalId = r.id;
        else {
          const [r2] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, String(roleId))).limit(1);
          if (r2) roleInternalId = r2.id;
        }
      } else {
        const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, String(roleId))).limit(1);
        if (r) roleInternalId = r.id;
        else {
          const [r2] = await db.select({ id: roles.id }).from(roles).where(eq(roles.publicId, String(roleId))).limit(1);
          if (r2) roleInternalId = r2.id;
        }
      }
    }
  }
  if (!roleInternalId) {
    // default to Staff
    const [staff] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, "STAFF")).limit(1);
    if (staff) roleInternalId = staff.id;
    else {
      const [anyR] = await db.select({ id: roles.id }).from(roles).limit(1);
      roleInternalId = anyR?.id ?? null;
    }
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const [created] = await db
    .insert(users)
    .values({
      name: String(name),
      email: normalizedEmail,
      passwordHash,
      roleId: roleInternalId,
      active: true,
      avatarHue: Math.floor(Math.random() * 360),
    })
    .returning();

  res.status(201).json({ user: await toPublicUser(created) });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = req.user as AuthUser;
  const row = await findUserById(user.id);
  if (!row) {
    res.status(404).json({ error: "User tidak ditemukan." });
    return;
  }

  // resolve role internal for permission check
  let roleInternalId: number | null = null;
  if (/^\d+$/.test(user.role)) roleInternalId = Number(user.role);
  else {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.role);
    if (isUuid) {
      const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.publicId, user.role)).limit(1);
      roleInternalId = r?.id ?? null;
    } else {
      const [r] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, user.role)).limit(1);
      roleInternalId = r?.id ?? null;
      if (!roleInternalId) {
        const [r2] = await db.select({ id: roles.id }).from(roles).where(eq(roles.publicId, user.role)).limit(1);
        roleInternalId = r2?.id ?? null;
      }
    }
  }
  // fallback to user's actual roleId
  if (!roleInternalId) roleInternalId = (row as any).roleId;

  const [role] = roleInternalId ? await db.select({ isSystem: roles.isSystem }).from(roles).where(eq(roles.id, roleInternalId)).limit(1) : [];
  const isSystem = (role as any)?.isSystem ?? false;

  let permissions: { menu: string; action: string }[] = [];
  let branchPublicIds: string[] = [];
  let warehousePublicIds: string[] = [];
  let workspacePublicIds: string[] = [];
  let branchInternalIds: (number|string)[] = [];
  let warehouseInternalIds: (number|string)[] = [];
  let workspaceInternalIds: (number|string)[] = [];

  if (isSystem) {
    const allBranches = await db.select({ id: branches.id, publicId: branches.publicId }).from(branches);
    const allWarehouses = await db.select({ id: warehouses.id, publicId: warehouses.publicId }).from(warehouses);
    const allWorkspaces = await db.select({ id: schema.workspaces.id, publicId: schema.workspaces.publicId }).from(schema.workspaces);
    branchInternalIds = allBranches.map((b) => b.id);
    warehouseInternalIds = allWarehouses.map((w) => w.id);
    workspaceInternalIds = allWorkspaces.map((w) => w.id);
    branchPublicIds = allBranches.map((b) => b.publicId);
    warehousePublicIds = allWarehouses.map((w) => w.publicId);
    workspacePublicIds = allWorkspaces.map((w) => w.publicId);
  } else if (roleInternalId) {
    permissions = (await db
      .select({ menu: rolePermissions.menu, action: rolePermissions.action })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleInternalId))
    ).map((p) => ({ menu: p.menu, action: p.action }));

    const branchSet = new Set<number>();
    const warehouseSet = new Set<number>();
    const branchPublicSet = new Set<string>();
    const warehousePublicSet = new Set<string>();

    const ras = await db
      .select({ entityType: branchAccesses.entityType, entityId: branchAccesses.entityId })
      .from(branchAccesses)
      .where(eq(branchAccesses.roleId, roleInternalId));

    for (const e of ras) {
      if (e.entityType === "BRANCH") {
        branchSet.add(e.entityId);
        const [b] = await db.select({ publicId: branches.publicId }).from(branches).where(eq(branches.id, e.entityId)).limit(1);
        if (b) branchPublicSet.add(b.publicId);
      }
      if (e.entityType === "WAREHOUSE") {
        warehouseSet.add(e.entityId);
        const [w] = await db.select({ publicId: warehouses.publicId, branchId: warehouses.branchId }).from(warehouses).where(eq(warehouses.id, e.entityId)).limit(1);
        if (w) {
          warehousePublicSet.add(w.publicId);
          branchSet.add(w.branchId);
          const [b] = await db.select({ publicId: branches.publicId }).from(branches).where(eq(branches.id, w.branchId)).limit(1);
          if (b) branchPublicSet.add(b.publicId);
        }
      }
    }

    branchInternalIds = [...branchSet];
    warehouseInternalIds = [...warehouseSet];
    branchPublicIds = [...branchPublicSet];
    warehousePublicIds = [...warehousePublicSet];

    const was = await db
      .select({ workspaceId: schema.workspaceAccesses.workspaceId })
      .from(schema.workspaceAccesses)
      .where(eq(schema.workspaceAccesses.roleId, roleInternalId));
    workspaceInternalIds = was.map((w) => w.workspaceId);
    if (was.length) {
      const ws = await db.select({ publicId: schema.workspaces.publicId }).from(schema.workspaces).where(eq(schema.workspaces.id, was[0].workspaceId));
      // fetch all
      const allWs = await db.select({ publicId: schema.workspaces.publicId, id: schema.workspaces.id }).from(schema.workspaces);
      const map = new Map(allWs.map((r) => [r.id, r.publicId]));
      workspacePublicIds = was.map((w) => map.get(w.workspaceId) ?? String(w.workspaceId)).filter(Boolean) as string[];
    }
  }

  const publicUser = await toPublicUser(row);
  res.json({
    ...publicUser,
    isSystem,
    permissions,
    access: { branchIds: branchPublicIds, warehouseIds: warehousePublicIds, workspaceIds: workspacePublicIds },
    // internal ids kept for scope middleware compat (numbers)
    _internalAccess: { branchIds: branchInternalIds, warehouseIds: warehouseInternalIds, workspaceIds: workspaceInternalIds },
  });
});
