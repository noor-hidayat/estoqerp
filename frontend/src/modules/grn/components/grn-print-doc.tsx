// Dokumen cetak GRN — layout A4 formal (kop perusahaan, info supplier /
// dokumen, tabel item, total, tanda tangan). Bukan screenshot layar aplikasi.
// Pola cetak mengikuti dokumen PO (.print-doc + @media print A4).

import { formatNumber } from "@/lib/utils";
import { grnLineAmount, grnTotals, type GrnDoc } from "../grn-types";

function formatDateId(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("id-ID").replace(/\//g, "-");
}

export function GrnPrintDoc({
  doc,
  supplier,
  purchaseOrder,
  warehouseName,
  subWarehouseName,
  items,
  uoms,
  company,
}: {
  doc: GrnDoc;
  supplier?: { name?: string; address?: string | null; phone?: string | null; email?: string | null } | null;
  purchaseOrder?: { documentNo?: string | null; poNo?: string | number; orderDate?: string; paymentTerms?: string | null } | null;
  warehouseName: string;
  subWarehouseName: string;
  items: { id: string; code: string; name: string }[];
  uoms: { id: string; name: string }[];
  company?: { companyName?: string; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; logo?: string | null } | null;
}) {
  const totals = grnTotals(doc.lines);
  const poNo = purchaseOrder?.documentNo ?? (purchaseOrder?.poNo != null ? `PO/${purchaseOrder.poNo}` : "");
  const companyContacts = [
    company?.phone ? `Telp. ${company.phone}` : null,
    company?.email ?? null,
    company?.website ? String(company.website).replace(/^https?:\/\//, "") : null,
  ].filter(Boolean);

  return (
    <>
      <style>{`@media print { @page { size: A4; margin: 0; } html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body * { visibility: hidden; } .print-doc, .print-doc * { visibility: visible; } .print-doc { position: absolute; left: 0; top: 0; width: 100%; height: auto; } header, nav, aside { display: none !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } }`}</style>
      <div className="hidden print:block print-doc bg-white text-black print:absolute print:inset-0 print:p-0">
        <div className="mx-auto w-[190mm] max-w-[190mm] bg-white p-[10mm] text-black">
          {/* Kop perusahaan */}
          <div className="flex items-start justify-between gap-6 border-b border-zinc-900 pb-3">
            <div className="flex items-start gap-3">
              {company?.logo ? (
                <img src={company.logo} alt="Logo" className="h-10 w-10 object-contain" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center border border-black text-[10px] font-bold text-black">
                  LOGO
                </div>
              )}
              <div className="leading-tight">
                <div className="text-[15px] font-bold tracking-tight text-black">
                  {company?.companyName ?? ""}
                </div>
                <div className="mt-0.5 max-w-[360px] whitespace-pre-wrap break-words text-[10px] leading-snug text-zinc-600">
                  {company?.address ?? ""}
                </div>
                {companyContacts.length > 0 && (
                  <div className="mt-1 text-[10px] text-zinc-600">{companyContacts.join(" · ")}</div>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-base font-bold tracking-[0.15em] text-black">GOOD RECEIPT NOTE</div>
            </div>
          </div>

          {/* Info dokumen */}
          <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
            <div className="space-y-1">
              <div className="flex"><span className="w-24 shrink-0 text-zinc-600">No. GRN</span><span className="font-medium text-black">{doc.documentNo}</span></div>
              <div className="flex"><span className="w-24 shrink-0 text-zinc-600">Our PO No.</span><span className="text-black">{poNo}</span></div>
              <div className="flex"><span className="w-24 shrink-0 text-zinc-600">Terms</span><span className="text-black">{purchaseOrder?.paymentTerms ?? ""}</span></div>
            </div>
            <div className="space-y-1">
              <div className="flex"><span className="w-24 shrink-0 text-zinc-600">Date</span><span className="text-black">{formatDateId(doc.postingDate)}</span></div>
              <div className="flex"><span className="w-24 shrink-0 text-zinc-600">Our PO Date</span><span className="text-black">{formatDateId(purchaseOrder?.orderDate)}</span></div>
              <div className="flex"><span className="w-24 shrink-0 text-zinc-600">Warehouse</span><span className="text-black">{[warehouseName, subWarehouseName].filter(Boolean).join(" / ")}</span></div>
            </div>
          </div>

          {/* Info supplier */}
          <div className="mt-4 border-t border-zinc-200 pt-4 text-[11px]">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-black">SUPPLIER</div>
            <div className="mt-2 font-medium text-black">{supplier?.name ?? ""}</div>
            {supplier?.address && <div className="mt-1 leading-snug text-zinc-600">{supplier.address}</div>}
            <div className="mt-2 space-y-0.5 text-zinc-600">
              {supplier?.phone && <div>Telp : {supplier.phone}</div>}
              {supplier?.email && <div>Email : {supplier.email}</div>}
            </div>
          </div>

          {/* Info pengiriman */}
          <div className="mt-4 grid grid-cols-3 gap-4 border-t border-zinc-200 pt-4 text-[11px]">
            <div className="flex"><span className="w-28 shrink-0 text-zinc-600">Delivery Note</span><span className="text-black">{doc.deliveryNote}</span></div>
            <div className="flex"><span className="w-20 shrink-0 text-zinc-600">Driver</span><span className="text-black">{doc.driverName}</span></div>
            <div className="flex"><span className="w-20 shrink-0 text-zinc-600">Vehicle No</span><span className="text-black">{doc.vehicleNo}</span></div>
          </div>

          {/* Tabel item */}
          <table className="mt-6 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-50">
                <th className="w-8 px-2 py-2 text-center font-medium text-zinc-600">No</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-600">Item Code</th>
                <th className="w-16 px-2 py-2 text-center font-medium text-zinc-600">UOM</th>
                <th className="w-28 px-2 py-2 text-right font-medium text-zinc-600">Unit Price</th>
                <th className="w-16 px-2 py-2 text-right font-medium text-zinc-600">Disc.</th>
                <th className="w-32 px-2 py-2 text-right font-medium text-zinc-600">Amount</th>
              </tr>
            </thead>
            <tbody className="text-[10px] text-black">
              {doc.lines.map((l, idx) => {
                const item = items.find((x) => x.id === l.itemId);
                const uom = uoms.find((x) => x.id === l.uomId);
                return (
                  <tr key={idx} className="border-b border-zinc-100">
                    <td className="px-2 py-2 text-center tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-2">{item ? `${item.code}: ${item.name}` : ""}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{uom?.name ?? ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums">Rp {formatNumber(l.unitPrice || 0)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.discount ? `${formatNumber(l.discount)}%` : "0%"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">Rp {formatNumber(grnLineAmount(l))}</td>
                  </tr>
                );
              })}
              {doc.lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-zinc-500">No items.</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Total */}
          <div className="mt-4 flex justify-end">
            <div className="w-[280px] space-y-0 text-[11px]">
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Total Qty</span><span className="font-medium tabular-nums text-black">{formatNumber(totals.totalQty)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Subtotal</span><span className="font-medium tabular-nums text-black">Rp {formatNumber(totals.subtotal)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Discount</span><span className="font-medium tabular-nums text-black">- Rp {formatNumber(totals.discountTotal)}</span></div>
              <div className="flex justify-between border-t border-zinc-900 px-2 py-2 font-semibold text-black"><span>Total</span><span className="tabular-nums">Rp {formatNumber(totals.grandTotal)}</span></div>
            </div>
          </div>

          {/* Catatan */}
          {doc.notes?.trim() && (
            <div className="mt-6 border-t border-zinc-200 pt-3 text-[11px]">
              <div className="font-bold uppercase tracking-wide">Notes</div>
              <div className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-700">{doc.notes}</div>
            </div>
          )}

          {/* Tanda tangan */}
          <div className="mt-10 grid grid-cols-3 gap-8 text-center text-[11px]">
            {["Received By", "Checked By", "Approved By"].map((label) => (
              <div key={label} className="flex flex-col items-center">
                <div className="font-semibold tracking-wide text-black">{label}</div>
                <div className="mt-3 flex h-[64px] w-[160px] items-center justify-center" />
                <div className="h-px w-[160px] bg-zinc-900" />
                <div className="mt-2 text-[10px] text-zinc-600">( Name / Signature )</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
