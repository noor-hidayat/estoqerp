import { Router } from "express";

export const exchangeRouter = Router();

// simple in-memory cache: key -> { rate, timestamp }
const cache = new Map<string, { rate: number; ts: number }>();
const TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchRate(from: string, to: string): Promise<{ rate: number; source: string }> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return { rate: 1, source: "identity" };

  // try exchangerate.host
  try {
    const res = await fetch(`https://api.exchangerate.host/convert?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}&amount=1`);
    if (res.ok) {
      const data: any = await res.json();
      // data.info.rate or data.result
      const rate = data?.info?.rate ?? data?.result ?? null;
      if (typeof rate === "number" && isFinite(rate) && rate > 0) {
        return { rate, source: "exchangerate.host" };
      }
      // try rates
      if (data?.rates && typeof data.rates[t] === "number") {
        return { rate: Number(data.rates[t]), source: "exchangerate.host" };
      }
    }
  } catch {}

  // fallback frankfurter
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`);
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.rates?.[t];
      if (typeof rate === "number" && isFinite(rate) && rate > 0) {
        return { rate, source: "frankfurter" };
      }
    }
  } catch {}

  // fallback er-api
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(f)}`);
    if (res.ok) {
      const data: any = await res.json();
      const rate = data?.rates?.[t];
      if (typeof rate === "number" && isFinite(rate) && rate > 0) {
        return { rate, source: "open.er-api" };
      }
    }
  } catch {}

  throw new Error("Gagal mengambil kurs realtime dari semua provider.");
}

exchangeRouter.get("/exchange-rate", async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Tidak terautentikasi." });
      return;
    }
    const from = String(req.query.from ?? "").trim().toUpperCase();
    const to = String(req.query.to ?? "").trim().toUpperCase();
    if (!from || !to) {
      res.status(400).json({ error: "from dan to wajib diisi (contoh: from=USD&to=IDR)." });
      return;
    }
    if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
      res.status(400).json({ error: "Currency harus kode 3 huruf (IDR, USD, ...)." });
      return;
    }
    const key = `${from}->${to}`;
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && now - cached.ts < TTL_MS) {
      res.json({ from, to, rate: cached.rate, source: "cache", cached: true, timestamp: new Date(cached.ts).toISOString() });
      return;
    }
    const { rate, source } = await fetchRate(from, to);
    cache.set(key, { rate, ts: now });
    res.json({ from, to, rate, source, cached: false, timestamp: new Date(now).toISOString() });
  } catch (e) {
    next(e);
  }
});
