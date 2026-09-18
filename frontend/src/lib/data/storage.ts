// LocalStorage storage adapter — SATU-SATUNYA pintu akses localStorage
// untuk data ERP (selain realtime bus & token legacy).
//
// Prinsip issue #3:
//   UI -> Hooks -> Repository -> StorageAdapter -> localStorage
// Page/component DILARANG memanggil localStorage.getItem/setItem langsung.

const NAMESPACE = "estoq:v1:";

function hasStorage(): boolean {
  return typeof localStorage !== "undefined";
}

function key(collection: string): string {
  return `${NAMESPACE}${collection}`;
}

export function readCollection<T>(collection: string): T[] {
  if (!hasStorage()) return [];
  try {
    const raw = localStorage.getItem(key(collection));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCollection<T>(collection: string, rows: T[]): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key(collection), JSON.stringify(rows));
  } catch {
    // storage penuh / private mode — abaikan agar app tidak crash
  }
}

export function readValue<T>(collection: string, fallback: T): T {
  if (!hasStorage()) return fallback;
  try {
    const raw = localStorage.getItem(key(collection));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeValue(collection: string, value: unknown): void {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(key(collection), JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function removeCollection(collection: string): void {
  if (!hasStorage()) return;
  try {
    localStorage.removeItem(key(collection));
  } catch {
    // ignore
  }
}

/** Daftar semua koleksi ERP yang dikelola data layer (untuk reset/clear). */
export const MANAGED_COLLECTIONS = [
  // master
  "branches",
  "warehouses",
  "locations",
  "itemGroups",
  "uom",
  "items",
  "suppliers",
  "customers",
  "departments",
  "taxCategories",
  "priceLists",
  "priceListLines",
  "paymentTerms",
  "movementTypes",
  "documentTypes",
  "documentSeries",
  "barcodeFormats",
  "batchFormats",
  "qcParameters",
  "companySettings",
  "roles",
  "users",
  "workspaces",
  // transactions
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
  // meta
  "docCounters",
  "seedMeta",
] as const;

export function clearCollections(collections: readonly string[]): void {
  for (const c of collections) removeCollection(c);
}

export function resetAll(): void {
  clearCollections(MANAGED_COLLECTIONS);
}
