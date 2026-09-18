// Development tools — reset / re-seed / clear (§13 issue).
// Hanya untuk development; dipanggil dari halaman Settings > Dev Data
// dan diekspos di `window.__estoqData` untuk console.

import { MANAGED_COLLECTIONS, clearCollections, readCollection } from "./storage";
import { ensureSeed } from "./seed";

const TRANSACTION_COLLECTIONS = [
  "purchaseRequests",
  "materialRequests",
  "rfqs",
  "supplierQuotations",
  "purchaseOrders",
  "salesOrders",
  "goodsReceipts",
  "receivings",
  "qcInspections",
  "deliveries",
  "transactions",
  "batches",
  "stockBatches",
  "stockBarcodes",
  "opnameProjects",
  "opnameWarehouses",
  "opnameScans",
  "opnameScanDetails",
  "opnameCounts",
  "workflows",
  "activityLogs",
  "docCounters",
];

const MASTER_COLLECTIONS = MANAGED_COLLECTIONS.filter((c) => !(TRANSACTION_COLLECTIONS as string[]).includes(c) && c !== "seedMeta");

export function reseed(): { seeded: boolean; collections: string[] } {
  return ensureSeed();
}

/** Hapus SEMUA data lalu seed ulang master. */
export function resetAll(): { seeded: boolean; collections: string[] } {
  clearCollections(MANAGED_COLLECTIONS);
  return ensureSeed();
}

/** Hapus hanya transaksi (master dipertahankan). */
export function clearTransactions(): void {
  clearCollections(TRANSACTION_COLLECTIONS);
}

/** Hapus hanya master/setup (transaksi dipertahankan). */
export function clearMaster(): void {
  clearCollections(MASTER_COLLECTIONS);
}

export function collectionCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of MANAGED_COLLECTIONS) {
    try {
      const rows = readCollection<unknown>(c);
      out[c] = Array.isArray(rows) ? rows.length : 1;
    } catch {
      out[c] = 0;
    }
  }
  return out;
}

if (typeof window !== "undefined") {
  (window as unknown as { __estoqData: unknown }).__estoqData = {
    reseed,
    resetAll,
    clearTransactions,
    clearMaster,
    collectionCounts,
  };
}
