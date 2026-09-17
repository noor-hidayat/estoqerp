import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { isAdminUser } from "../middleware/rbac";

export const companySettingsRouter = Router();

const VALID_CURRENCIES = ["IDR", "USD", "EUR", "SGD", "JPY", "CNY", "MYR", "THB", "AUD"];
const VALID_COUNTRIES = ["Indonesia", "Malaysia", "Singapore", "Thailand", "Vietnam", "Philippines", "Japan", "China", "USA"];
const VALID_TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai", "America/New_York", "Europe/London"];
const VALID_FISCAL = ["JANUARY_DECEMBER", "APRIL_MARCH", "JULY_JUNE"];

async function getOrCreate(): Promise<any> {
  const rows = await db.select().from(schema.companySettings).limit(1);
  if (rows.length > 0) return rows[0];
  const [ins] = await db
    .insert(schema.companySettings)
    .values({
      companyName: "Estoq",
      companyCode: "ESTOQ",
      country: "Indonesia",
      baseCurrency: "IDR",
      timezone: "Asia/Jakarta",
      fiscalYear: "JANUARY_DECEMBER",
    })
    .returning();
  return ins;
}

// GET /company-settings — all authenticated can read (for default currency & logo in docs)
companySettingsRouter.get("/company-settings", async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Tidak terautentikasi." });
      return;
    }
    const row = await getOrCreate();
    res.json({
      id: (row as any).publicId ?? String((row as any).id),
      _internalId: (row as any).id,
      companyName: (row as any).companyName,
      companyCode: (row as any).companyCode,
      address: (row as any).address ?? null,
      taxId: (row as any).taxId ?? null,
      phone: (row as any).phone ?? null,
      email: (row as any).email ?? null,
      website: (row as any).website ?? null,
      country: (row as any).country,
      baseCurrency: (row as any).baseCurrency,
      timezone: (row as any).timezone,
      fiscalYear: (row as any).fiscalYear,
      logo: (row as any).logo ?? null,
      updatedAt: (row as any).updatedAt,
    });
  } catch (e) {
    next(e);
  }
});

// PUT /company-settings — SYS_ADMIN only
companySettingsRouter.put("/company-settings", async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Tidak terautentikasi." });
      return;
    }
    if (!(await isAdminUser(req.user.role))) {
      res.status(403).json({ error: "Hanya SYS_ADMIN yang boleh mengubah Company Settings." });
      return;
    }
    const b = req.body ?? {};
    const patch: Record<string, any> = {};

    if (b.companyName !== undefined) {
      const v = String(b.companyName).trim();
      if (!v) {
        res.status(400).json({ error: "Company Name wajib diisi." });
        return;
      }
      patch.companyName = v;
    }
    if (b.companyCode !== undefined) {
      const v = String(b.companyCode).trim().toUpperCase();
      if (!v) {
        res.status(400).json({ error: "Company Code wajib diisi." });
        return;
      }
      if (!/^[A-Z0-9_-]{2,20}$/.test(v)) {
        res.status(400).json({ error: "Company Code harus 2-20 karakter A-Z 0-9 _ -." });
        return;
      }
      patch.companyCode = v;
    }
    if (b.address !== undefined) patch.address = b.address ? String(b.address).trim() : null;
    if (b.taxId !== undefined) patch.taxId = b.taxId ? String(b.taxId).trim() : null;
    if (b.phone !== undefined) patch.phone = b.phone ? String(b.phone).trim() : null;
    if (b.email !== undefined) {
      const v = b.email ? String(b.email).trim() : "";
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        res.status(400).json({ error: "Format email tidak valid." });
        return;
      }
      patch.email = v || null;
    }
    if (b.website !== undefined) patch.website = b.website ? String(b.website).trim() : null;
    if (b.country !== undefined) {
      const v = String(b.country).trim();
      if (!VALID_COUNTRIES.includes(v)) {
        res.status(400).json({ error: `Country harus salah satu: ${VALID_COUNTRIES.join(", ")}` });
        return;
      }
      patch.country = v;
    }
    if (b.baseCurrency !== undefined) {
      const v = String(b.baseCurrency).trim().toUpperCase();
      if (!VALID_CURRENCIES.includes(v)) {
        res.status(400).json({ error: `Base Currency harus salah satu: ${VALID_CURRENCIES.join(", ")}` });
        return;
      }
      patch.baseCurrency = v;
    }
    if (b.timezone !== undefined) {
      const v = String(b.timezone).trim();
      if (!VALID_TIMEZONES.includes(v)) {
        res.status(400).json({ error: `Timezone harus salah satu: ${VALID_TIMEZONES.join(", ")}` });
        return;
      }
      patch.timezone = v;
    }
    if (b.fiscalYear !== undefined) {
      const v = String(b.fiscalYear).trim().toUpperCase();
      if (!VALID_FISCAL.includes(v)) {
        res.status(400).json({ error: `Fiscal Year harus salah satu: ${VALID_FISCAL.join(", ")}` });
        return;
      }
      patch.fiscalYear = v;
    }
    if (b.logo !== undefined) {
      if (b.logo === null || b.logo === "") {
        patch.logo = null;
      } else {
        const s = String(b.logo).trim();
        // allow data URL or https URL, limit 5MB base64
        if (s.length > 5 * 1024 * 1024) {
          res.status(400).json({ error: "Logo terlalu besar (max 5MB)." });
          return;
        }
        if (!(s.startsWith("data:image/") || s.startsWith("http://") || s.startsWith("https://"))) {
          res.status(400).json({ error: "Logo harus data:image/* base64 atau URL https." });
          return;
        }
        patch.logo = s;
      }
    }

    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "Tidak ada field yang diubah." });
      return;
    }
    patch.updatedAt = new Date();

    const existing = await getOrCreate();
    const [updated] = await db
      .update(schema.companySettings)
      .set(patch)
      .where(eq(schema.companySettings.id, existing.id))
      .returning();

    const row = updated ?? existing;
    res.json({
      id: (row as any).publicId ?? String((row as any).id),
      companyName: (row as any).companyName,
      companyCode: (row as any).companyCode,
      address: (row as any).address ?? null,
      taxId: (row as any).taxId ?? null,
      phone: (row as any).phone ?? null,
      email: (row as any).email ?? null,
      website: (row as any).website ?? null,
      country: (row as any).country,
      baseCurrency: (row as any).baseCurrency,
      timezone: (row as any).timezone,
      fiscalYear: (row as any).fiscalYear,
      logo: (row as any).logo ?? null,
      updatedAt: (row as any).updatedAt,
    });
  } catch (e) {
    next(e);
  }
});
