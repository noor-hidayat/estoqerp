import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient, setupRealtimeInvalidation } from "@/lib/api/query-client";
import { subscribe, REALTIME_TABLES } from "@/lib/realtime";
import { api } from "@/lib/api/client";
import App from "./App";
import "./app/globals.css";

// Realtime lokal: setiap tab yang menerima broadcast akan invalidate & refetch otomatis tanpa reload
setupRealtimeInvalidation(subscribe);

// Realtime server: subscribe ke backend SSE untuk semua table transaksional
// Master (suppliers, warehouses, items dll) TIDAK ikut — fetch sekali saja (5 menit cache)
if (typeof window !== "undefined") {
  const tablesParam = REALTIME_TABLES.join(",");
  const controller = new AbortController();
  const path = `/realtime/stream?tables=${encodeURIComponent(tablesParam)}`;

  const connect = () => {
    if (controller.signal.aborted) return;
    api.subscribe(path, (evt: any) => {
      const tbl = String(evt?.table ?? "");
      if (!tbl) return;
      queryClient.invalidateQueries({ queryKey: [tbl] });
      // alias handling sama seperti setupRealtimeInvalidation
      if (tbl === "qc-inspections") queryClient.invalidateQueries({ queryKey: ["receivings"] });
      if (tbl === "receivings") queryClient.invalidateQueries({ queryKey: ["qc-inspections"] });
      if (tbl === "transactions" || tbl === "transactions-cursor") {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["transactions-cursor"] });
        queryClient.invalidateQueries({ queryKey: ["transactions/scan-history"] });
      }
      if (tbl === "purchase-orders") queryClient.invalidateQueries({ queryKey: ["receivings"] });
    }, controller.signal).catch((err) => {
      if (controller.signal.aborted) return;
      // retry 5 detik kalau putus (network / server restart) — jangan spam kalau 401
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("403")) return;
      console.debug("[realtime SSE] disconnected, retry in 5s", msg);
      setTimeout(connect, 5000);
    });
  };

  connect();
  // cleanup saat hot-reload / unload
  window.addEventListener("beforeunload", () => controller.abort());
}

// Register Service Worker for PWA - disabled in dev to avoid fetch 200 sw.js issues
// Unregister existing SW to fix "fetch 200 initiator sw.js:57" and failed to fetch
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) r.unregister().then(() => console.log("SW unregistered:", r.scope));
  });
  // Clear caches
  if (window.caches) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);