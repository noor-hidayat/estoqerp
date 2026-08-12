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
import { crudRouter } from "./routes/crud";
import { dashboardRouter } from "./routes/dashboard";

const app = express();

app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);

app.use("/api", requireAuth);
app.use("/api", resolveScope);
app.use("/api", dashboardRouter);
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
