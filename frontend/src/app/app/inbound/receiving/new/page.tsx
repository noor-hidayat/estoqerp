import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import {
  useAllWarehouses,
  useCreateReceiving,
  usePurchaseOrder,
  usePurchaseOrders,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid, FormActions } from "@/components/ui/form-page";
import { OrderLineTable, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function NewReceivingPage() {
  const navigate = useNavigate();
  const { data: pos = [], isLoading: posLoading } = usePurchaseOrders();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const create = useCreateReceiving();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [poId, setPoId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [postingDate, setPostingDate] = useState(todayISO());
  const [postingTime, setPostingTime] = useState(nowTime());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineInput[]>([]);

  const { data: poDetail } = usePurchaseOrder(poId || undefined);

  // Auto-fill gudang + lines dari PO yang dipilih (editable setelahnya).
  useEffect(() => {
    if (poDetail) {
      setWarehouseId(poDetail.warehouseId);
      setLines(
        (poDetail.lines ?? []).map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: String(l.qty),
          unitPrice: l.unitPrice ?? "",
          batchNumber: l.batchNumber ?? "",
          note: l.note ?? "",
        }))
      );
    }
  }, [poDetail]);

  const submit = async () => {
    if (!poId) return setError("Pilih No PO dulu.");
    if (!warehouseId) return setError("Gudang simpan wajib diisi.");
    if (!postingDate) return setError("Posting date wajib diisi.");
    if (!postingTime) return setError("Posting time wajib diisi.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Tambah minimal satu item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Setiap item harus punya qty > 0.");
    }
    try {
      // receipt_date di DB bertipe DATE — jam (postingTime) tampil dari waktu simpan (created_at).
      const res = await create.mutateAsync({
        purchaseOrderId: poId,
        warehouseId,
        receiptDate: postingDate,
        notes: notes.trim() || null,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: l.qty,
          unitPrice: l.unitPrice || null,
          batchNumber: l.batchNumber || null,
          note: l.note || null,
        })),
      });
      navigate(`/app/inbound/receiving/${res.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan receiving.");
    }
  };

  if (posLoading || warehousesLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
        <FormSkeleton sections={[["half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <FormPage title="New Receiving">
        <FormSection>
          <FormGrid>
            <SearchableSelect
              label="No PO"
              placeholder="Pilih purchase order..."
              options={pos.map((p) => ({
                value: p.id,
                label: `${p.documentNo ?? p.poNo ?? formatId(p.id)} · ${p.status}`,
              }))}
              value={poId}
              onChange={(v) => setPoId(v)}
            />
            <SearchableSelect
              label="Gudang Simpan"
              placeholder="Pilih gudang..."
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v)}
            />
            <DatePicker label="Posting Date" value={postingDate} onChange={(v) => setPostingDate(v)} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Posting Time</label>
              <input
                type="time"
                value={postingTime}
                onChange={(e) => setPostingTime(e.target.value)}
                className="h-8 w-full rounded-md border border-input bg-zinc-200/60 px-3 text-[13px] shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea
                placeholder="Catatan opsional..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Item dari PO">
          <OrderLineTable value={lines} onChange={setLines} />
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/inbound/receiving")}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            <Save size={15} strokeWidth={2} />
            {create.isPending ? "Menyimpan…" : "Save"}
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
