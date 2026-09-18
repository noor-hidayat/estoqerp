// Logic Putaway — frontend-only (issue #7).
// - Receiving area: location (dalam scope sub warehouse) yang kode/namanya
//   mengandung "receiv" — tempat barang OK hasil GRN berada (From Location).
// - Outstanding: qty GRN per item dikurangi qty putaway dari dokumen putaway
//   lain (status non-CANCELED) dengan ref GRN yang sama.

import type { GrnDoc } from "@/modules/grn/grn-types";
import type { Location } from "@/types";
import type { PutawayDoc } from "./putaway-types";

/** Cari location receiving area dalam daftar location (scope 1 warehouse). */
export function findReceivingArea(
  locations: Pick<Location, "id" | "code" | "name">[]
): Pick<Location, "id" | "code" | "name"> | undefined {
  return locations.find((l) => /receiv/i.test(`${l.code} ${l.name}`));
}

/** Total qty per itemId dari lines GRN (duplikat item dijumlah). */
export function grnQtyByItem(grn: GrnDoc | undefined | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of grn?.lines ?? []) {
    if (!l.itemId) continue;
    const qty = Number(l.qty || 0);
    if (!Number.isFinite(qty)) continue;
    map.set(l.itemId, (map.get(l.itemId) ?? 0) + qty);
  }
  return map;
}

/** Total qty putaway per itemId dari dokumen lain dengan ref GRN yang sama. */
export function putawayQtyByItem(
  docs: PutawayDoc[],
  grnId: string,
  excludeDocId?: string
): Map<string, number> {
  const map = new Map<string, number>();
  if (!grnId) return map;
  for (const d of docs) {
    if (d.grnId !== grnId) continue;
    if (d.id === excludeDocId) continue;
    if (d.status === "CANCELED") continue;
    for (const l of d.lines ?? []) {
      if (!l.itemId) continue;
      const qty = Number(l.qty || 0);
      if (!Number.isFinite(qty)) continue;
      map.set(l.itemId, (map.get(l.itemId) ?? 0) + qty);
    }
  }
  return map;
}

/**
 * Sisa qty yang bisa di-putaway untuk satu item.
 * @returns null bila tidak ada acuan (tanpa ref GRN / item tidak ada di GRN).
 */
export function outstandingQty(
  grn: GrnDoc | undefined | null,
  docs: PutawayDoc[],
  grnId: string,
  itemId: string,
  excludeDocId?: string
): number | null {
  if (!grn || !grnId || !itemId) return null;
  const grnQty = grnQtyByItem(grn).get(itemId);
  if (grnQty == null) return null;
  const used = putawayQtyByItem(docs, grnId, excludeDocId).get(itemId) ?? 0;
  return grnQty - used;
}
