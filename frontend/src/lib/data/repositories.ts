// Repository layer — issue #3 §10.
//
//   Page/Component --(hooks)--> Repository interface --> LocalStorage impl
//   FUTURE:                             `--> Api impl --> Backend API
//
// UI & hooks HANYA bergantung pada interface `Repository<T>` / fungsi di file
// ini, TIDAK PERNAH menyentuh localStorage langsung. Semua akses storage
// lewat `storage.ts` (adapter) di dalam `LocalStorageRepository`.

import { readCollection, writeCollection } from "./storage";
import { nextDocumentNo } from "./document-number";

export interface Repository<T extends { id: string }> {
  readonly collection: string;
  list(filter?: (row: T) => boolean): T[];
  get(id: string): T | null;
  /** get by id ATAU documentNo (navigasi PO/2026/09/0004 memakai id UUID, fallback documentNo). */
  getByIdOrDocumentNo(idOrNo: string): T | null;
  create(input: Omit<T, "id"> & { id?: string }): T;
  update(id: string, patch: Partial<T>): T | null;
  remove(id: string): boolean;
  clear(): void;
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

export class LocalStorageRepository<T extends { id: string }> implements Repository<T> {
  readonly collection: string;
  private docPrefix: boolean;

  constructor(collection: string, opts?: { documentNo?: boolean }) {
    this.collection = collection;
    this.docPrefix = opts?.documentNo ?? false;
  }

  list(filter?: (row: T) => boolean): T[] {
    const rows = readCollection<T>(this.collection);
    return filter ? rows.filter(filter) : rows;
  }

  get(id: string): T | null {
    return readCollection<T>(this.collection).find((r) => r.id === id) ?? null;
  }

  getByIdOrDocumentNo(idOrNo: string): T | null {
    const rows = readCollection<T>(this.collection);
    const decoded = safeDecode(idOrNo);
    return (
      rows.find((r) => r.id === idOrNo || r.id === decoded) ??
      rows.find((r) => (r as Record<string, unknown>).documentNo === idOrNo || (r as Record<string, unknown>).documentNo === decoded) ??
      null
    );
  }

  create(input: Omit<T, "id"> & { id?: string }): T {
    const rows = readCollection<T>(this.collection);
    const rec = { ...(input as Record<string, unknown>) } as Record<string, unknown>;
    if (!rec.id) rec.id = uid();
    const nowIso = new Date().toISOString();
    if (!rec.createdAt) rec.createdAt = nowIso;
    rec.updatedAt = nowIso;
    if (this.docPrefix && !rec.documentNo) {
      rec.documentNo = nextDocumentNo(this.collection);
    }
    // default lifecycle: transaksi baru selalu DRAFT bila status belum diisi
    if (this.docPrefix && !rec.status) rec.status = "DRAFT";
    // beri id pada nested lines/details yang belum punya id
    for (const k of ["lines", "details"]) {
      const arr = rec[k];
      if (Array.isArray(arr)) {
        rec[k] = arr.map((l) => {
          const line = { ...(l as Record<string, unknown>) };
          if (!line.id) line.id = uid();
          return line;
        });
      }
    }
    rows.push(rec as unknown as T);
    writeCollection(this.collection, rows);
    return rec as unknown as T;
  }

  update(id: string, patch: Partial<T>): T | null {
    const rows = readCollection<T>(this.collection);
    const idx = rows.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    const merged = {
      ...(rows[idx] as Record<string, unknown>),
      ...(patch as Record<string, unknown>),
      id,
      updatedAt: new Date().toISOString(),
    } as unknown as T;
    rows[idx] = merged;
    writeCollection(this.collection, rows);
    return merged as unknown as T;
  }

  remove(id: string): boolean {
    const rows = readCollection<T>(this.collection);
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    writeCollection(this.collection, next);
    return true;
  }

  clear(): void {
    writeCollection(this.collection, []);
  }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---- Koleksi transaksi (punya documentNo + lifecycle) ----

const TRANSACTIONAL = new Set([
  "purchaseRequests",
  "materialRequests",
  "rfqs",
  "purchaseOrders",
  "salesOrders",
  "goodsReceipts",
  "receivings",
  "qcInspections",
  "deliveries",
  "transactions",
  "opnameProjects",
  "opnameCounts",
]);

const repos = new Map<string, LocalStorageRepository<{ id: string }>>();

/** Repository generik per koleksi (dipakai local-api untuk SEMUA tabel). */
export function repo<T extends { id: string }>(collection: string): Repository<T> {
  let r = repos.get(collection) as LocalStorageRepository<T> | undefined;
  if (!r) {
    r = new LocalStorageRepository<T>(collection, { documentNo: TRANSACTIONAL.has(collection) });
    repos.set(collection, r as LocalStorageRepository<{ id: string }>);
  }
  return r;
}

// ---- Transaction lifecycle (§6, §12 issue) ----

/** Urutan lifecycle generik dokumen ERP. */
export const LIFECYCLE = ["DRAFT", "SUBMITTED", "APPROVED", "POSTED", "COMPLETED"] as const;

/** Terapkan transisi status; return false bila transisi tidak dikenal. */
export function applyTransition(collection: string, id: string, action: string, extra?: Record<string, unknown>): Record<string, unknown> | null {
  const r = repo<Record<string, unknown> & { id: string }>(collection);
  const row = r.get(id);
  if (!row) return null;
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { ...(extra ?? {}) };

  switch (action) {
    case "post":
      patch.status = collection === "receivings" ? "PENDING_QC" : "POSTED";
      break;
    case "submit":
      if (collection === "receivings") patch.status = (row as any).qcRequired === false ? "SUBMITTED" : "PENDING_QC";
      else if (collection === "qcInspections") patch.status = "COMPLETED";
      else patch.status = "SUBMITTED";
      patch.submittedAt = nowIso;
      break;
    case "approve":
      patch.status = "APPROVED";
      break;
    case "reject":
      patch.status = "REJECTED";
      break;
    case "cancel":
      patch.status = "CANCELED";
      break;
    case "send":
      patch.status = "SENT";
      break;
    case "close":
      patch.status = "CLOSED";
      break;
    case "unpost":
    case "amend":
      patch.status = "DRAFT";
      break;
    default:
      return null;
  }
  return (r.update(id, patch as Partial<Record<string, unknown> & { id: string }>) ?? row) as Record<string, unknown>;
}

// ---- Inventory calculation (§9): Opening + In - Out = Closing ----

export interface InventoryBalance {
  warehouseId: string;
  itemId: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
  balanceDate: string;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function movementKind(typeId: string): "RECEIPT" | "ISSUE" | "TRANSFER" | "OTHER" {
  const types = readCollection<{ id: string; kind: string }>("movementTypes");
  const t = types.find((x) => x.id === typeId);
  const k = String(t?.kind ?? "").toUpperCase();
  if (k === "RECEIPT" || k === "ISSUE" || k === "TRANSFER") return k;
  // fallback heuristik dari kode umum
  const id = typeId.toLowerCase();
  if (id.includes("out") || id.includes("issue")) return "ISSUE";
  if (id.includes("trf") || id.includes("transfer")) return "TRANSFER";
  return "RECEIPT";
}

/**
 * Hitung balance dari transaksi POSTED (+ GRN POSTED sebagai stock-in).
 * Sumber: `transactions` (details[].qty, from/to warehouse) dan
 * `goodsReceipts` berstatus POSTED (lines[].qty ke warehouseId).
 */
export function computeInventory(params?: { warehouseId?: string; itemId?: string }): InventoryBalance[] {
  const map = new Map<string, InventoryBalance>();
  const keyOf = (w: string, i: string) => `${w}::${i}`;
  const touch = (warehouseId: string, itemId: string): InventoryBalance => {
    const k = keyOf(warehouseId, itemId);
    let b = map.get(k);
    if (!b) {
      b = { warehouseId, itemId, openingQty: 0, inQty: 0, outQty: 0, closingQty: 0, balanceDate: new Date().toISOString().slice(0, 10) };
      map.set(k, b);
    }
    return b;
  };

  const movements = readCollection<{
    id: string; status: string; typeId: string;
    details?: { itemId: string; qty: unknown; fromWarehouseId?: string | null; toWarehouseId?: string | null }[];
  }>("transactions");

  for (const m of movements) {
    if (String(m.status).toUpperCase() !== "POSTED") continue;
    const kind = movementKind(m.typeId ?? "");
    for (const d of m.details ?? []) {
      const q = num(d.qty);
      if (kind === "TRANSFER") {
        if (d.fromWarehouseId) touch(String(d.fromWarehouseId), String(d.itemId)).outQty += q;
        if (d.toWarehouseId) touch(String(d.toWarehouseId), String(d.itemId)).inQty += q;
      } else if (kind === "ISSUE") {
        const w = String(d.fromWarehouseId ?? d.toWarehouseId ?? "");
        if (w) touch(w, String(d.itemId)).outQty += q;
      } else {
        const w = String(d.toWarehouseId ?? d.fromWarehouseId ?? "");
        if (w) touch(w, String(d.itemId)).inQty += q;
      }
    }
  }

  const grns = readCollection<{
    status: string; warehouseId: string;
    lines?: { itemId: string; qty: unknown }[];
  }>("goodsReceipts");
  for (const g of grns) {
    if (String(g.status).toUpperCase() !== "POSTED") continue;
    for (const l of g.lines ?? []) {
      touch(String(g.warehouseId), String(l.itemId)).inQty += num(l.qty);
    }
  }

  for (const b of map.values()) b.closingQty = b.openingQty + b.inQty - b.outQty;

  let rows = [...map.values()];
  if (params?.warehouseId) rows = rows.filter((r) => r.warehouseId === params.warehouseId);
  if (params?.itemId) rows = rows.filter((r) => r.itemId === params.itemId);
  return rows.sort((a, b) => (a.warehouseId + a.itemId).localeCompare(b.warehouseId + b.itemId));
}
