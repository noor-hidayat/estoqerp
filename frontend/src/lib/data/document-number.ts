// Centralized document numbering — SATU-SATUNYA tempat nomor dokumen dibuat.
// Format: PREFIX/YYYY/MM/NNNN  (mis. PO/2026/09/0001, RCV/2026/09/0001)
// Counter disimpan di LocalStorage per PREFIX+YYYYMM sehingga persist
// setelah refresh dan tidak dipakai ulang.
//
// Future backend: ganti implementasi ini dengan API-generated numbering,
// page/component tidak perlu berubah (mereka memanggil nextDocumentNo/peek).

import { readValue, writeValue } from "./storage";

type CounterMap = Record<string, number>;

const COUNTERS_KEY = "docCounters";

function periodSuffix(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}/${m}`;
}

function periodCompact(date = new Date()): string {
  const y = String(date.getFullYear()).slice(2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

/** Prefix per koleksi transaksi. */
export const DOC_PREFIX: Record<string, string> = {
  purchaseRequests: "PR",
  materialRequests: "MR",
  rfqs: "RFQ",
  purchaseOrders: "PO",
  salesOrders: "SO",
  goodsReceipts: "GRN",
  receivings: "RCV",
  qcInspections: "QC",
  deliveries: "DN",
  transactions: "TRX",
  opnameProjects: "SOP",
  opnameCounts: "SOC",
  batches: "BATCH",
};

function loadCounters(): CounterMap {
  return readValue<CounterMap>(COUNTERS_KEY, {});
}

/** Ambil nomor berikutnya DAN increment counter (dipakai saat create). */
export function nextDocumentNo(collection: string, date = new Date()): string {
  const prefix = DOC_PREFIX[collection] ?? collection.toUpperCase().slice(0, 3);
  const counters = loadCounters();
  // QC memakai format khusus QC-YYMM-XXXX (dokumen terpisah, lihat AGENTS.md)
  if (collection === "qcInspections") {
    const k = `QC-${periodCompact(date)}`;
    const n = (counters[k] ?? 0) + 1;
    counters[k] = n;
    writeValue(COUNTERS_KEY, counters);
    return `${k}-${String(n).padStart(4, "0")}`;
  }
  const k = `${prefix}/${periodSuffix(date)}`;
  const n = (counters[k] ?? 0) + 1;
  counters[k] = n;
  writeValue(COUNTERS_KEY, counters);
  return `${k}/${String(n).padStart(4, "0")}`;
}

/** Intip nomor berikutnya TANPA increment (untuk preview di form New). */
export function peekDocumentNo(collection: string, date = new Date()): string {
  const prefix = DOC_PREFIX[collection] ?? collection.toUpperCase().slice(0, 3);
  const counters = loadCounters();
  if (collection === "qcInspections") {
    const k = `QC-${periodCompact(date)}`;
    return `${k}-${String((counters[k] ?? 0) + 1).padStart(4, "0")}`;
  }
  const k = `${prefix}/${periodSuffix(date)}`;
  return `${k}/${String((counters[k] ?? 0) + 1).padStart(4, "0")}`;
}
