import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { config } from "./config";
import { requireAuth } from "./middleware/auth";
import { resolveScope } from "./middleware/scope";
import { authRouter } from "./routes/auth";
import { aiRouter } from "./routes/ai";
import { crudRouter } from "./routes/crud";
import { dashboardRouter } from "./routes/dashboard";
import { dashboardBuilderRouter } from "./routes/dashboard-builder";
import { importRouter } from "./routes/import";
import opnameProjectsRouter from "./routes/opname-projects";
import opnameCountsRouter from "./routes/opname-counts";
import { stockLedgerRouter, transactionsRouter } from "./routes/transactions";
import { supplyChainRouter } from "./routes/supply-chain";
import { purchaseRequestRouter } from "./routes/purchase-requests";
import { materialRequestRouter } from "./routes/material-requests";
import { documentTypesRouter, documentSeriesRouter } from "./routes/document-types";
import { companySettingsRouter } from "./routes/company-settings";
import { exchangeRouter } from "./routes/exchange";
import { workflowsRouter } from "./routes/workflows";
import { userSignaturesRouter } from "./routes/user-signatures";
import { activityLogsRouter } from "./routes/activity-logs";
import { rfqRouter } from "./routes/rfq";
import { realtimeRouter } from "./routes/realtime";
import { emitRealtime } from "./lib/realtime";

const app = express();

app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
  })
);
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

app.use("/api", requireAuth);
app.use("/api", resolveScope);
// Global realtime emitter: setiap mutation sukses (POST/PUT/PATCH/DELETE) emit ke SSE
// FE subscribe ke /api/realtime/stream?tables=... untuk dapat dorongan tanpa polling
app.use("/api", (req, _res, next) => {
  const res = _res as express.Response;
  res.on("finish", () => {
    try {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const m = req.method;
        if (!["POST", "PUT", "PATCH", "DELETE"].includes(m)) return;
        const url = (req.originalUrl || req.url || "").split("?")[0];
        const seg = url.replace(/^\/api\//, "").split("/")[0];
        if (!seg) return;
        const skip = new Set([
          "auth",
          "realtime",
          "activity-logs",
          "health",
          "import",
          "exchange",
          "company-settings",
          "ai",
          "workflows",
          "user-signatures",
        ]);
        if (skip.has(seg)) return;
        // seg sudah kebab-case sesuai FE queryKey (purchase-orders, receivings, etc)
        // Tentukan action untuk log lebih spesifik
        let action: any = "*";
        if (m === "POST") {
          if (url.includes("/cancel")) action = "cancel";
          else if (url.includes("/submit")) action = "submit";
          else if (url.includes("/post")) action = "post";
          else if (url.includes("/approve")) action = "approve";
          else if (url.includes("/reject")) action = "reject";
          else if (url.includes("/close")) action = "close";
          else action = "create";
        } else if (m === "DELETE") action = "delete";
        else action = "update";
        const id = (req.params as any)?.id ?? undefined;
        emitRealtime(seg, action, id);
        // juga emit untuk alias singular/plural yang mungkin dipakai FE
        // mis FE pakai "purchase-orders" tapi URL "purchase-orders" sudah sama
      }
    } catch {}
  });
  next();
});
app.use("/api", dashboardRouter);
app.use("/api", dashboardBuilderRouter);
app.use("/api/import", importRouter);
app.use("/api/opname-projects", opnameProjectsRouter);
app.use("/api/opname-counts", opnameCountsRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/stock-ledger", stockLedgerRouter);
app.use("/api/document-types", documentTypesRouter);
app.use("/api/document-series", documentSeriesRouter);
app.use("/api/ai", aiRouter);
app.use("/api", companySettingsRouter);
app.use("/api", exchangeRouter);
app.use("/api", supplyChainRouter);
app.use("/api", purchaseRequestRouter);
app.use("/api", materialRequestRouter);
app.use("/api", rfqRouter);
app.use("/api", workflowsRouter);
app.use("/api", userSignaturesRouter);
app.use("/api", realtimeRouter);
app.use("/api", activityLogsRouter);
app.use("/api", crudRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("API error:", err);
  const anyErr = err as { status?: number; statusCode?: number; type?: string; message?: string };
  const status = anyErr?.status ?? anyErr?.statusCode;
  // body-parser / express.json PayloadTooLargeError -> type === 'entity.too.large', status 413
  if (status === 413 || anyErr?.type === "entity.too.large") {
    res.status(413).json({ error: "Payload terlalu besar. Logo maksimal 5MB (disarankan <500KB, PNG/JPG). Silakan kompres/ resize gambar sebelum upload." });
    return;
  }
  const httpStatus = typeof status === "number" && status >= 400 && status < 600 ? status : 500;
  const message = err instanceof Error ? err.message : "Terjadi kesalahan pada server.";
  res.status(httpStatus).json({ error: message });
});

app.listen(config.port, "0.0.0.0", () => {
  console.log(`StockOpname API berjalan di http://0.0.0.0:${config.port}`);
});
