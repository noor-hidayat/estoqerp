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
app.use("/api", workflowsRouter);
app.use("/api", userSignaturesRouter);
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
