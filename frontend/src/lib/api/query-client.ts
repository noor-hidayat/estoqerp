import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime: data selalu dianggap stale agar refetch bisa jalan instant tanpa reload
      staleTime: 0,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
    },
  },
});

// Global realtime invalidator — dipanggil setiap ada broadcast dari `lib/realtime`.
// Jangan import `subscribe` di top-level untuk hindari circular; setup dilakukan via `setupRealtimeInvalidation()`.
export function setupRealtimeInvalidation(subscribeFn: (cb: (evt: { table: string }) => void) => () => void) {
  return subscribeFn((evt) => {
    // Invalidate semua query yang prefix-nya sama dengan table
    // e.g., table="receivings" akan invalidate ["receivings"] dan ["receivings", params] dan ["receivings", id]
    queryClient.invalidateQueries({ queryKey: [evt.table] });
    // Untuk tabel dengan alias / kasus khusus, tambahkan invalidasi silang:
    // QC submit juga mengubah receivings, jadi broadcast qc-inspections juga invalidate receivings
    if (evt.table === "qc-inspections") {
      queryClient.invalidateQueries({ queryKey: ["receivings"] });
    }
    if (evt.table === "receivings") {
      queryClient.invalidateQueries({ queryKey: ["qc-inspections"] });
    }
    // Transactions: list ada 2 key (paginated + cursor) — pastikan keduanya refetch
    if (evt.table === "transactions" || evt.table === "transactions-cursor") {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions-cursor"] });
      queryClient.invalidateQueries({ queryKey: ["transactions/scan-history"] });
    }
    // Purchase orders / receivings / goods-receipts sering cross-refetch (PO -> receipt)
    if (evt.table === "purchase-orders") {
      queryClient.invalidateQueries({ queryKey: ["receivings"] });
    }
  });
}
