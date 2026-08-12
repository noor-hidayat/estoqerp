import path from "node:path";
import { config as loadEnv } from "dotenv";

// Muat .env relatif ke lokasi file ini (backend/.env),
// supaya berjalan benar dari root repo maupun folder backend.
loadEnv({ path: path.resolve(__dirname, "../.env") });

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-jangan-pakai-di-produksi",
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  jwtRefreshExpiresDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS ?? 7),
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
