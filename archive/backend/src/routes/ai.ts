// @ts-nocheck
import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { requireRoles } from "../middleware/auth";
import { isDataRelated, lookupEntities } from "../ai/context";
import { getCachedContext } from "../ai/context-cache";
import { streamAiChat, KNOWN_MODELS, type AiChatMessage, type AiProviderName } from "../ai/providers";
import { checkPermission, hasWorkspaceAccess } from "../middleware/rbac";

export const aiRouter = Router();

const KEY_MASK = "••••••••";

function sendEvent(res: Response, obj: unknown) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

async function loadSettings(workspaceId?: string | null) {
  const rows = await db.select().from(schema.aiSettings);
  if (workspaceId) {
    const found = rows.find((r) => (r as unknown as { workspaceId: string | null }).workspaceId === workspaceId);
    if (found) return found;
  }
  const global = rows.find((r) => (r as unknown as { workspaceId: string | null }).workspaceId == null);
  return global ?? rows[0] ?? null;
}

function providerLabel(p: string): string {
  return p === "DEEPSEEK" ? "DeepSeek" : "Google Gemini";
}

// Status publik untuk semua user login (dipakai widget chat) — per workspace jika ?workspaceId.
aiRouter.get("/status", async (req, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
    const s = await loadSettings(workspaceId ?? null);
    res.json({
      enabled: s?.enabled ?? false,
      defaultProvider: s?.defaultProvider ?? "GOOGLE",
      googleModel: s?.googleModel ?? "gemini-3.5-flash",
      deepseekModel: s?.deepseekModel ?? "deepseek-chat",
      googleKeySet: !!s?.googleApiKey,
      deepseekKeySet: !!s?.deepseekApiKey,
    });
  } catch (e) {
    next(e);
  }
});

// Daftar model yang dikenal — untuk pemilih model di widget chat.
aiRouter.get("/models", (_req, res, next) => {
  try {
    res.json(KNOWN_MODELS);
  } catch (e) {
    next(e);
  }
});

// Kelola konfigurasi AI — khusus role manager (sys admin & admin).
const MANAGER_ROLES = ["role_sys_admin", "SYS_ADMIN", "role_admin", "ADMIN"];

aiRouter.get("/settings", requireRoles(...MANAGER_ROLES), async (req, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
    const s = await loadSettings(workspaceId ?? null);
    res.json({
      enabled: s?.enabled ?? false,
      defaultProvider: s?.defaultProvider ?? "GOOGLE",
      googleApiKey: s?.googleApiKey ? KEY_MASK : "",
      googleModel: s?.googleModel ?? "gemini-3.5-flash",
      deepseekApiKey: s?.deepseekApiKey ? KEY_MASK : "",
      deepseekModel: s?.deepseekModel ?? "deepseek-chat",
    });
  } catch (e) {
    next(e);
  }
});

aiRouter.put("/settings", requireRoles(...MANAGER_ROLES), async (req, res, next) => {
  try {
    const body = req.body ?? {};
    const provider = body.defaultProvider;
    if (provider !== "GOOGLE" && provider !== "DEEPSEEK") {
      res.status(400).json({ error: "defaultProvider harus GOOGLE atau DEEPSEEK." });
      return;
    }

    const resolveKey = (sent: unknown, current: string | null): string | null => {
      if (typeof sent !== "string") return current;
      if (sent === KEY_MASK) return current;
      const trimmed = sent.trim();
      return trimmed.length > 0 ? trimmed : null;
    };

    const workspaceId = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : null;
    const existing = await loadSettings(workspaceId);
    const row = {
      enabled: typeof body.enabled === "boolean" ? body.enabled : existing?.enabled ?? false,
      defaultProvider: provider,
      googleApiKey: resolveKey(body.googleApiKey, existing?.googleApiKey ?? null),
      googleModel: typeof body.googleModel === "string" && body.googleModel.trim() ? body.googleModel.trim() : existing?.googleModel ?? "gemini-3.5-flash",
      deepseekApiKey: resolveKey(body.deepseekApiKey, existing?.deepseekApiKey ?? null),
      deepseekModel: typeof body.deepseekModel === "string" && body.deepseekModel.trim() ? body.deepseekModel.trim() : existing?.deepseekModel ?? "deepseek-chat",
      workspaceId,
    };

    if (existing) {
      await db
        .update(schema.aiSettings)
        .set({ ...row, updatedAt: new Date() })
        .where(eq(schema.aiSettings.id, existing.id));
    } else {
      const id = workspaceId ? `ai-${workspaceId}` : "ai_001";
      await db.insert(schema.aiSettings).values({ id, ...row });
    }

    const s = await loadSettings(workspaceId);
    res.json({
      enabled: s?.enabled ?? false,
      defaultProvider: s?.defaultProvider ?? "GOOGLE",
      googleApiKey: s?.googleApiKey ? KEY_MASK : "",
      googleModel: s?.googleModel ?? "gemini-3.5-flash",
      deepseekApiKey: s?.deepseekApiKey ? KEY_MASK : "",
      deepseekModel: s?.deepseekModel ?? "deepseek-chat",
    });
  } catch (e) {
    next(e);
  }
});

// Chat streaming (SSE) — per workspace, cek permission ai + akses workspace.
aiRouter.post("/chat", async (req: Request, res: Response, next) => {
  try {
    const body = req.body ?? {};
    const workspaceId = typeof body.workspaceId === "string" && body.workspaceId ? body.workspaceId : null;
    if (workspaceId && !(await hasWorkspaceAccess(req as unknown as Parameters<typeof hasWorkspaceAccess>[0], workspaceId))) {
      res.status(403).json({ error: "Tidak punya akses workspace." });
      return;
    }
    if (!(await checkPermission(req, res, "ai", "view"))) return;
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: AiChatMessage[] = [];
    for (const m of rawMessages) {
      if (typeof m?.content !== "string" || !m.content.trim()) continue;
      if (m.role === "user" || m.role === "assistant") {
        messages.push({ role: m.role, content: m.content.trim() });
      }
    }
    if (messages.length === 0 || messages.length > 50) {
      res.status(400).json({ error: "Pesan tidak valid." });
      return;
    }

    const settings = await loadSettings(workspaceId);
    const requested: string = typeof body.provider === "string" ? body.provider.toUpperCase() : "";
    const provider: AiProviderName =
      requested === "GOOGLE" || requested === "DEEPSEEK" ? requested : (settings?.defaultProvider ?? "GOOGLE");

    const apiKey = provider === "GOOGLE" ? settings?.googleApiKey : settings?.deepseekApiKey;
    const requestedModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "";
    const model =
      requestedModel ||
      (provider === "GOOGLE" ? settings?.googleModel : settings?.deepseekModel);

    if (!settings?.enabled || !apiKey) {
      res.status(503).json({
        error: `AI assistant belum dikonfigurasi (${providerLabel(provider)}). Hubungi admin untuk mengisi API key.`,
      });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    sendEvent(res, { type: "meta", provider, model });

    const scope = {
      branchIds: req.accessibleBranchIds ?? [],
      warehouseIds: req.accessibleWarehouseIds ?? [],
      isAdmin: !req.user || req.user.role === "role_sys_admin" || req.user.role === "SYS_ADMIN",
    };

    // Pertanyaan non-data tidak menyentuh DB sama sekali — langsung ke LLM.
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    let dataContext = "";
    if (isDataRelated(lastUserMsg)) {
      dataContext = await getCachedContext(scope);
      const lookup = await lookupEntities(lastUserMsg, scope);
      if (lookup) {
        dataContext += "\n\n" + lookup;
        console.log("[ai] lookup: ada hasil");
      }
    } else {
      console.log("[ai] chat non-data: DB dilewati");
    }

    const abort = new AbortController();
    const onClose = () => abort.abort();
    req.on("close", onClose);

    try {
      await streamAiChat(
        { provider, apiKey, model: model ?? "" },
        dataContext,
        messages,
        (token) => sendEvent(res, { type: "token", text: token }),
        abort.signal
      );
    } finally {
      req.off("close", onClose);
    }

    sendEvent(res, { type: "done" });
    res.end();
  } catch (e) {
    const message = e instanceof Error && e.name === "AbortError"
      ? "Percakapan dihentikan."
      : e instanceof Error
        ? e.message
        : "Terjadi kesalahan saat memproses pertanyaan.";
    if (!res.headersSent || res.writableEnded) {
      next(e);
      return;
    }
    try {
      sendEvent(res, { type: "error", message });
      res.end();
    } catch {
      res.destroy();
    }
  }
});