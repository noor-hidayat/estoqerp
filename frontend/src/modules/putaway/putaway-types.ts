// Putaway — frontend-only types (issue #7).
// Disimpan via storage adapter (localStorage), tanpa backend/API/database.
//
// Alur: GRN yang di-submit mentransfer barang OK ke sub warehouse dengan
// location "receiving area" -> Putaway memindahkan barang dari From Location
// (receiving area) ke To Location (tujuan, satu dokumen satu tujuan).
// Qty Outstanding per item = qty GRN - qty putaway (dokumen lain, non-cancel).

export interface PutawayLineInput {
  /** Barcode hasil scan — boleh kosong untuk baris dari GRN / manual. */
  barcode: string;
  itemId: string;
  uomId: string;
  /** Qty yang di-putaway pada dokumen ini. */
  qty: string;
  /** Lokasi asal per baris — fallback ke header fromLocationId bila kosong (dok lama). */
  fromLocationId?: string;
  /** Lokasi tujuan per baris — fallback ke header toLocationId bila kosong (dok lama). */
  toLocationId?: string;
}

export function emptyPutawayLine(defaults?: { fromLocationId?: string; toLocationId?: string }): PutawayLineInput {
  return {
    barcode: "",
    itemId: "",
    uomId: "",
    qty: "",
    fromLocationId: defaults?.fromLocationId ?? "",
    toLocationId: defaults?.toLocationId ?? "",
  };
}

export function putawayTotalQty(lines: PutawayLineInput[]): number {
  let total = 0;
  for (const l of lines) {
    const qty = Number(l.qty || 0);
    if (Number.isFinite(qty)) total += qty;
  }
  return total;
}

export interface PutawayDoc {
  id: string;
  documentNo: string;
  /** Ref GRN (grnDocs.id) — wajib, sumber qty outstanding. */
  grnId: string;
  postingDate: string;
  postingTime: string;
  /** Gudang tujuan (diisi dari GRN, bisa diubah). */
  subWarehouseId: string;
  /** Lokasi asal — default receiving area (barang OK hasil GRN). */
  fromLocationId: string;
  /** Lokasi tujuan penempatan. */
  toLocationId: string;
  notes: string;
  lines: PutawayLineInput[];
  status: "DRAFT" | "SUBMITTED" | "CANCELED";
  createdAt: string;
}
