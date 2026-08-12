import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import { refreshTokens, users, roles, rolePermissions, branchAccesses, branches, warehouses } from "../db/schema";
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
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  avatarHue: number;
  createdAt: Date;
};

export function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  const { passwordHash: _passwordHash, ...rest } = row;
  return rest;
}

function issueTokens(user: PublicUser) {
  const accessToken = signAccessToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });
  const { token: refreshToken, hash } = generateRefreshToken();
  return { accessToken, refreshToken, hash };
}

async function persistRefreshToken(userId: string, hash: string) {
  await db.insert(refreshTokens).values({
    id: `rt_${randomBytes(8).toString("hex")}`,
    userId,
    tokenHash: hash,
    expiresAt: refreshTokenExpiry(config.jwtRefreshExpiresDays),
  });
}

async function findUserById(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

async function findUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()));
  return row ?? null;
}

async function nextUserId(): Promise<string> {
  const rows = await db.select({ id: users.id }).from(users);
  const max = rows.reduce((m, r) => {
    if (!r.id.startsWith("usr_")) return m;
    const n = Number(r.id.slice(4));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `usr_${String(max + 1).padStart(3, "0")}`;
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

  const publicUser = toPublicUser(user);
  const { accessToken, refreshToken, hash } = issueTokens(publicUser);
  await persistRefreshToken(publicUser.id, hash);

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

  const user = await findUserById(stored.userId);
  if (!user || !user.active) {
    res.status(401).json({ error: "Akun tidak aktif." });
    return;
  }

  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  const publicUser = toPublicUser(user);
  const tokens = issueTokens(publicUser);
  await persistRefreshToken(publicUser.id, tokens.hash);

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

  let userRole = "role_staff";
  if (roleId) {
    const [r] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.id, String(roleId)))
      .limit(1);
    if (r) userRole = r.id;
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const [created] = await db
    .insert(users)
    .values({
      id: await nextUserId(),
      name: String(name),
      email: normalizedEmail,
      passwordHash,
      role: userRole,
      active: true,
      avatarHue: Math.floor(Math.random() * 360),
    })
    .returning();

  res.status(201).json({ user: toPublicUser(created) });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = req.user as AuthUser;
  const row = await findUserById(user.id);
  if (!row) {
    res.status(404).json({ error: "User tidak ditemukan." });
    return;
  }

  const role = await db
    .select({ isSystem: roles.isSystem })
    .from(roles)
    .where(eq(roles.id, user.role))
    .limit(1);

  const isSystem = role[0]?.isSystem ?? false;

  let permissions: { menu: string; action: string }[] = [];
  let branchIds: string[] = [];
  let warehouseIds: string[] = [];

  if (isSystem) {
    const allBranches = await db.select({ id: branches.id }).from(branches);
    const allWarehouses = await db.select({ id: warehouses.id }).from(warehouses);
    branchIds = allBranches.map((b) => b.id);
    warehouseIds = allWarehouses.map((w) => w.id);
  } else {
    permissions = (await db
      .select({ menu: rolePermissions.menu, action: rolePermissions.action })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, user.role))
    ).map((p) => ({ menu: p.menu, action: p.action }));

    const branchSet = new Set<string>();
    const warehouseSet = new Set<string>();

    const ras = await db
      .select({ entityType: branchAccesses.entityType, entityId: branchAccesses.entityId })
      .from(branchAccesses)
      .where(eq(branchAccesses.roleId, user.role));

    for (const e of ras) {
      if (e.entityType === "BRANCH") branchSet.add(e.entityId);
      if (e.entityType === "WAREHOUSE") {
        warehouseSet.add(e.entityId);
        const [wh] = await db
          .select({ branchId: warehouses.branchId })
          .from(warehouses)
          .where(eq(warehouses.id, e.entityId))
          .limit(1);
        if (wh) branchSet.add(wh.branchId);
      }
    }

    branchIds = [...branchSet];
    warehouseIds = [...warehouseSet];
  }

  res.json({
    ...toPublicUser(row),
    isSystem,
    permissions,
    access: { branchIds, warehouseIds },
  });
});
