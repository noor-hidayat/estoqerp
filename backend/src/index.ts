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
import { stockLedgerRouter, transactionsRouter } from "./routes/transactions";
import { supplyChainRouter } from "./routes/supply-chain";

const app = express();

app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
  })
);
app.use(express.json({ limit: "10mb" }));

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
app.use("/api/transactions", transactionsRouter);
app.use("/api/stock-ledger", stockLedgerRouter);
app.use("/api/ai", aiRouter);
app.use("/api", supplyChainRouter);
app.use("/api", crudRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan." });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("API error:", err);
  const message = err instanceof Error ? err.message : "Terjadi kesalahan pada server.";
  res.status(500).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`StockOpname API berjalan di http://localhost:${config.port}`);
});
