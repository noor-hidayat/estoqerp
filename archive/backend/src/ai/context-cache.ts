import { buildDataContext, type AiScope } from "./context";

const TTL_MS = 60_000;
const MAX_ENTRIES = 50;
const cache = new Map<string, { context: string; expiresAt: number }>();

function scopeKey(scope: AiScope): string {
  return [
    scope.isAdmin ? "A" : "U",
    [...scope.branchIds].sort().join(","),
    [...scope.warehouseIds].sort().join(","),
  ].join("|");
}

/** Snapshot ringkas yang di-cache 60 detik per scope akses user. */
export async function getCachedContext(scope: AiScope): Promise<string> {
  const key = scopeKey(scope);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    console.log("[ai] context: cache-hit");
    return hit.context;
  }
  const context = await buildDataContext(scope);
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { context, expiresAt: Date.now() + TTL_MS });
  console.log("[ai] context: cache-miss");
  return context;
}
