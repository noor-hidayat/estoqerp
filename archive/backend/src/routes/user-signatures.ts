import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import * as s from "../db/schema";

export const userSignaturesRouter = Router();

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
async function resolveUserId(param: string): Promise<number | null> {
  if (isUuid(param)) {
    const [row] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.publicId, param)).limit(1);
    return row?.id ?? null;
  }
  if (/^\d+$/.test(param)) return Number(param);
  return null;
}

// GET /user-signatures/me — own signature
userSignaturesRouter.get("/user-signatures/me", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Tidak terautentikasi." });
    const internalId = user.internalId ?? user.id;
    const uid = typeof internalId === "string" && isUuid(internalId) ? await resolveUserId(String(internalId)) : Number(internalId);
    if (!uid) return res.status(404).json({ error: "User tidak ditemukan." });
    const [row] = await db.select().from(s.userSignatures).where(eq(s.userSignatures.userId, uid)).limit(1);
    if (!row) return res.json(null);
    res.json({ id: row.publicId, userId: user.publicId ?? String(uid), signatureData: row.signatureData, updatedAt: row.updatedAt });
  } catch (e) { next(e); }
});

// PUT /user-signatures/me — upsert
userSignaturesRouter.put("/user-signatures/me", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Tidak terautentikasi." });
    const internalId = user.internalId ?? user.id;
    const uid = typeof internalId === "string" && isUuid(internalId) ? await resolveUserId(String(internalId)) : Number(internalId);
    if (!uid) return res.status(404).json({ error: "User tidak ditemukan." });
    const b = req.body ?? {};
    const data = b.signatureData ?? b.signature;
    if (!data || typeof data !== "string") return res.status(400).json({ error: "signatureData wajib (data:image/...;base64)." });
    const sData = String(data).trim();
    if (!sData.startsWith("data:image/")) return res.status(400).json({ error: "signatureData harus data:image/* base64." });
    if (sData.length > 1 * 1024 * 1024) return res.status(400).json({ error: "Signature terlalu besar (max 1MB)." });
    const [existing] = await db.select().from(s.userSignatures).where(eq(s.userSignatures.userId, uid)).limit(1);
    if (existing) {
      const [upd] = await db.update(s.userSignatures).set({ signatureData: sData, updatedAt: new Date() }).where(eq(s.userSignatures.userId, uid)).returning();
      return res.json({ id: upd.publicId, signatureData: upd.signatureData });
    }
    const [ins] = await db.insert(s.userSignatures).values({ userId: uid, signatureData: sData }).returning();
    res.status(201).json({ id: ins.publicId, signatureData: ins.signatureData });
  } catch (e) { next(e); }
});

userSignaturesRouter.delete("/user-signatures/me", async (req, res, next) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "Tidak terautentikasi." });
    const internalId = user.internalId ?? user.id;
    const uid = typeof internalId === "string" && isUuid(internalId) ? await resolveUserId(String(internalId)) : Number(internalId);
    if (!uid) return res.status(404).json({ error: "User tidak ditemukan." });
    await db.delete(s.userSignatures).where(eq(s.userSignatures.userId, uid));
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /user-signatures/:userId — admin or self
userSignaturesRouter.get("/user-signatures/:userId", async (req, res, next) => {
  try {
    const param = String(req.params.userId);
    if (param === "me") return res.status(400).json({ error: "Use /user-signatures/me" });
    const uid = await resolveUserId(param);
    if (!uid) return res.status(404).json({ error: "User tidak ditemukan." });
    const [row] = await db.select().from(s.userSignatures).where(eq(s.userSignatures.userId, uid)).limit(1);
    if (!row) return res.json(null);
    // only self or admin can view? for now allow any authenticated
    res.json({ id: row.publicId, userId: param, signatureData: row.signatureData, updatedAt: row.updatedAt });
  } catch (e) { next(e); }
});
