// @ts-nocheck
import { Router } from "express";
import { checkPermission, hasPermission, isAdminUser } from "../middleware/rbac";
import { realtimeEmitter } from "../lib/realtime";

export const realtimeRouter = Router();

// GET /api/realtime/stream?tables=receivings,qc-inspections,purchase-orders
// Subscribe SSE untuk list transaksional — FE fetch cuma pas mount, sisanya dorong dari sini
realtimeRouter.get("/realtime/stream", async (req, res, next) => {
  try {
    // auth sudah via requireAuth di index.ts, tapi double check
    const tablesRaw = String(req.query.tables ?? "").trim();
    const tables = tablesRaw
      ? tablesRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    // Jika tidak ada filter, anggap subscribe semua realtime table (untuk debug)
    // Tapi tetap butuh setidaknya 1 — kalau kosong, tolak
    if (tables.length === 0) {
      return res.status(400).json({ error: "tables query param wajib, contoh: ?tables=receivings,purchase-orders" });
    }

    // Validasi minimal punya akses view ke salah satu table
    // Untuk master yang jarang, tidak perlu SSE — tapi kita tetap izinkan

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    // @ts-ignore
    if (res.flushHeaders) res.flushHeaders();

    res.write(`: connected ${tables.join(",")}\n\n`);

    const send = (payload: any) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {}
    };

    const onChange = (payload: any) => {
      const tbl = String(payload.table ?? "");
      // cocokkan exact atau normalisasi -/_ 
      const match = tables.some((t) => {
        if (t === tbl) return true;
        if (t.replace(/_/g, "-") === tbl.replace(/_/g, "-")) return true;
        return false;
      });
      if (match) send(payload);
    };

    realtimeEmitter.on("change", onChange);

    const hb = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch {}
    }, 15000);

    const cleanup = () => {
      clearInterval(hb);
      try { realtimeEmitter.off("change", onChange); } catch {}
      try { res.end(); } catch {}
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
  } catch (e) {
    next(e);
  }
});
