// Realtime bus untuk sinkronisasi antar-tab & antar-komponen tanpa reload.
// Menggunakan BroadcastChannel (modern) + localStorage fallback + CustomEvent untuk same-tab.
// Setiap mutation (create/delete/cancel/update) memanggil `broadcast(table, action)`.
// Listener global akan otomatis `invalidateQueries` sehingga list ter-refetch realtime.

export type RealtimeAction = "create" | "update" | "delete" | "cancel" | "post" | "submit" | "approve" | "reject" | "*";

export type RealtimeEvent = {
  table: string;
  action: RealtimeAction;
  id?: string;
  timestamp: number;
};

const CHANNEL_NAME = "estoq-realtime";
const STORAGE_KEY = "__estoq_realtime";

let bc: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== "undefined") {
    bc = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  bc = null;
}

export function broadcast(table: string, action: RealtimeAction = "*", id?: string) {
  const evt: RealtimeEvent = { table, action, id, timestamp: Date.now() };
  // 1. BroadcastChannel untuk antar-tab instant
  try {
    bc?.postMessage(evt);
  } catch {
    // ignore
  }
  // 2. CustomEvent untuk same-tab (komponen yang sedang mount)
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent<RealtimeEvent>("estoq:realtime", { detail: evt }));
    }
  } catch {
    // ignore
  }
  // 3. localStorage fallback (trigger storage event di tab lain)
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(evt));
    }
  } catch {
    // ignore
  }
}

export function subscribe(cb: (evt: RealtimeEvent) => void): () => void {
  const onBC = (e: MessageEvent<RealtimeEvent>) => {
    if (e?.data?.table) cb(e.data);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue) as RealtimeEvent;
        if (parsed?.table) cb(parsed);
      } catch {
        // ignore invalid json
      }
    }
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<RealtimeEvent>).detail;
    if (detail?.table) cb(detail);
  };

  bc?.addEventListener("message", onBC as EventListener);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
    window.addEventListener("estoq:realtime", onCustom as EventListener);
  }

  return () => {
    try {
      bc?.removeEventListener("message", onBC as EventListener);
    } catch {
      // ignore
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("estoq:realtime", onCustom as EventListener);
    }
  };
}

// Helper: broadcast + invalidate (dipakai langsung dari mutation)
// Dipanggil setelah `qc.invalidateQueries` agar semua tab & komponen refetch.
export function notifyRealtime(table: string, action: RealtimeAction = "*", id?: string) {
  broadcast(table, action, id);
}

export const REALTIME_TABLES = [
  "receivings",
  "qc-inspections",
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
  "opnameProjects",
  "opnameCounts",
] as const;
