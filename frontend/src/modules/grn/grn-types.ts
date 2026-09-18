// GRN (Good Receipt Note) — frontend-only types (issue #5).
// Disimpan via storage adapter (localStorage), tanpa backend/API/database.

export interface GrnLineInput {
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice: string;
  /** Diskon per baris dalam persen (0–100). */
  discount: string;
}

export function emptyGrnLine(): GrnLineInput {
  return { itemId: "", uomId: "", qty: "", unitPrice: "", discount: "" };
}

/** Amount per baris = qty * unitPrice * (1 - discount/100). */
export function grnLineAmount(line: GrnLineInput): number {
  const qty = Number(line.qty || 0);
  const price = Number(line.unitPrice || 0);
  const disc = Math.min(Math.max(Number(line.discount || 0), 0), 100);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return qty * price * (1 - disc / 100);
}

export function grnTotals(lines: GrnLineInput[]): {
  totalQty: number;
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
} {
  let totalQty = 0;
  let subtotal = 0;
  let grandTotal = 0;
  for (const l of lines) {
    const qty = Number(l.qty || 0);
    const price = Number(l.unitPrice || 0);
    if (Number.isFinite(qty)) totalQty += qty;
    if (Number.isFinite(qty) && Number.isFinite(price)) subtotal += qty * price;
    grandTotal += grnLineAmount(l);
  }
  return { totalQty, subtotal, discountTotal: subtotal - grandTotal, grandTotal };
}

export interface GrnDoc {
  id: string;
  documentNo: string;
  purchaseOrderId: string;
  supplierId: string;
  postingDate: string;
  postingTime: string;
  warehouseId: string;
  subWarehouseId: string;
  deliveryNote: string;
  driverName: string;
  vehicleNo: string;
  notes: string;
  lines: GrnLineInput[];
  status: "DRAFT" | "SUBMITTED" | "CANCELED";
  createdAt: string;
  /** Centang putaway — penanda proses lanjutan, frontend-only. */
  putaway: boolean;
}
