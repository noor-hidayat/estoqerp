import { EventEmitter } from "events";

// Global emitter untuk realtime list — satu instance, banyak SSE consumer
export const realtimeEmitter = new EventEmitter();
realtimeEmitter.setMaxListeners(0);

export type RealtimePayload = {
  table: string;
  action: "create" | "update" | "delete" | "cancel" | "post" | "submit" | "approve" | "reject" | "*";
  id?: string | number | null;
  timestamp: string;
};

// Daftar table transaksional yang butuh SSE (master tidak ikut biar hemat koneksi)
// FE hanya subscribe ke subset ini; tapi backend boleh emit semua, FE yang filter
export const REALTIME_TABLES = new Set<string>([
  "receivings",
  "qc-inspections",
  "qcInspections",
  "purchase-orders",
  "purchase-requests",
  "material-requests",
  "rfqs",
  "sales-orders",
  "goods-receipts",
  "deliveries",
  "transactions",
  "transactions-cursor",
  "stock-ledger",
  "stockBalances",
  "stock-ledger",
  "opnameProjects",
  "opnameCounts",
  "opname-warehouses",
  "opnameWarehouses",
  "priceListLines",
]);

export function emitRealtime(table: string, action: RealtimePayload["action"] = "*", id?: string | number | null) {
  const payload: RealtimePayload = {
    table,
    action,
    id: id ?? null,
    timestamp: new Date().toISOString(),
  };
  try {
    realtimeEmitter.emit("change", payload);
    realtimeEmitter.emit(table, payload);
    // juga emit dengan normalisasi kebab vs camel
    const alt = table.replace(/_/g, "-");
    if (alt !== table) realtimeEmitter.emit(alt, payload);
    const alt2 = table.replace(/-/g, "_");
    if (alt2 !== table) realtimeEmitter.emit(alt2, payload);
  } catch {}
}
