// Form GRN baru — frontend-only (issue #5), simpan ke store lokal.
// Header: Ref PO | Posting Date / Supplier | Posting Time (tepat di bawah
// Posting Date) / Warehouse | Sub Warehouse (baris di bawah area date/time).

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useAllWarehouses,
  usePurchaseOrder,
  usePurchaseOrders,
  useSuppliers,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId, formatNumber } from "@/lib/utils";
import { GrnItemTable } from "@/modules/grn/components/grn-item-table";
import { emptyGrnLine, grnTotals, type GrnLineInput } from "@/modules/grn/grn-types";
import { createGrnId, nextGrnNo, saveGrn } from "@/modules/grn/grn-store";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function NewGrnPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: pos = [] } = usePurchaseOrders();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useAllWarehouses();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [poId, setPoId] = useState(searchParams.get("purchaseOrderId") ?? "");
  const [postingDate, setPostingDate] = useState(todayISO());
  const [postingTime, setPostingTime] = useState(nowTime());
  const [allowEditPosting, setAllowEditPosting] = useState(false);
  const [putaway, setPutaway] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [subWarehouseId, setSubWarehouseId] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [driverName, setDriverName] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<GrnLineInput[]>([emptyGrnLine()]);
  const [saving, setSaving] = useState(false);

  const { data: poDetail } = usePurchaseOrder(poId || undefined);
  const supplierId =
    (poDetail as any)?.supplierId ?? pos.find((p) => p.id === poId)?.supplierId ?? "";
  const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? "";
  const subWarehouses = warehouseId ? warehouses.filter((w) => w.parentId === warehouseId) : [];
  const totals = grnTotals(lines);

  // Auto-fill warehouse + lines saat PO dipilih (item diambil dari PO).
  useEffect(() => {
    if (poDetail) {
      setWarehouseId(poDetail.warehouseId);
      setSubWarehouseId("");
      setLines(
        (poDetail.lines ?? []).map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: String(l.qty),
          unitPrice: (l.unitPrice as string | null) ?? "",
          discount: "",
        }))
      );
    }
  }, [poDetail]);

  useEffect(() => {
    setSubWarehouseId("");
  }, [warehouseId]);

  const onSave = () => {
    if (saving) return;
    if (!poId) return setError("Pilih Ref PO dulu.");
    if (!postingDate) return setError("Posting date wajib diisi.");
    if (!postingTime) return setError("Posting time wajib diisi.");
    if (!warehouseId) return setError("Warehouse wajib diisi.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Tambah minimal satu item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Setiap item harus punya qty > 0.");
    }
    setSaving(true);
    try {
      const doc = saveGrn({
        id: createGrnId(),
        documentNo: nextGrnNo(),
        purchaseOrderId: poId,
        supplierId,
        postingDate,
        postingTime,
        warehouseId,
        subWarehouseId,
        deliveryNote: deliveryNote.trim(),
        driverName: driverName.trim(),
        vehicleNo: vehicleNo.trim(),
        notes: notes.trim(),
        lines: valid,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        putaway,
      });
      navigate(`/app/grn/${encodeURIComponent(doc.documentNo)}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [poId, postingDate, postingTime, warehouseId, subWarehouseId, deliveryNote, driverName, vehicleNo, notes, lines, saving, putaway]);

  return (
    <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
      <FormPage
        title="New GRN"
        titleBadge={<Badge tone="destructive">Not save</Badge>}
        actions={
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        <FormSection>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
            <SearchableSelect
              label="Ref PO"
              placeholder="Pilih purchase order..."
              options={pos.map((p) => ({
                value: p.id,
                label: `${p.documentNo ?? p.poNo ?? formatId(p.id)} · ${p.status}`,
              }))}
              value={poId}
              onChange={(v) => setPoId(v)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Supplier</label>
              <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                {poId ? supplierName || "—" : "Pilih Ref PO dulu..."}
              </div>
            </div>
            <DatePicker label="Posting Date" value={postingDate} onChange={(v) => setPostingDate(v)} disabled={!allowEditPosting} />
            <div className="flex flex-col justify-center gap-2 py-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={allowEditPosting} onCheckedChange={(v) => setAllowEditPosting(v === true)} />
                Edit posting date time
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <Checkbox checked={putaway} onCheckedChange={(v) => setPutaway(v === true)} />
                Putaway
              </label>
            </div>
            <div aria-hidden="true" />
            <TimePicker label="Posting Time" value={postingTime} onChange={(v) => setPostingTime(v)} disabled={!allowEditPosting} />
          </div>
          <FormGrid className="mt-5">
            <SearchableSelect
              label="Warehouse"
              placeholder="Pilih gudang..."
              options={warehouses
                .filter((w) => !w.parentId)
                .map((w) => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v)}
            />
            <SearchableSelect
              label="Sub Warehouse"
              placeholder={warehouseId ? (subWarehouses.length > 0 ? "Pilih sub gudang..." : "Tidak ada sub gudang") : "Pilih Warehouse dulu..."}
              options={subWarehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={subWarehouseId}
              onChange={(v) => setSubWarehouseId(v)}
              disabled={!warehouseId || subWarehouses.length === 0}
            />
          </FormGrid>
        </FormSection>

        <FormSection title="Delivery Information">
          <FormGrid>
            <Input
              label="Supplier Delivery Note"
              placeholder="No. surat jalan supplier..."
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
            />
            <Input
              label="Driver Name"
              placeholder="Nama supir..."
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
            <Input
              label="Vehicle No"
              placeholder="No. kendaraan..."
              value={vehicleNo}
              onChange={(e) => setVehicleNo(e.target.value)}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea
                placeholder="Catatan pengiriman..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Item">
          <GrnItemTable value={lines} onChange={setLines} />
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[320px] space-y-2 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Qty</span>
                <span className="font-medium tabular-nums">{formatNumber(totals.totalQty)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">Rp {formatNumber(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium tabular-nums">- Rp {formatNumber(totals.discountTotal)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="font-semibold">Total</span>
                <span className="font-bold tabular-nums">Rp {formatNumber(totals.grandTotal)}</span>
              </div>
            </div>
          </div>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
