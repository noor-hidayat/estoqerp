import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  usePurchaseOrders,
  usePurchaseOrder,
  useAllWarehouses,
  useUoms,
  useCreateGoodsReceipt,
  useReceivings,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewGoodsReceiptPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: pos = [], isLoading: posLoading } = usePurchaseOrders();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { isLoading: uomsLoading } = useUoms();
  const create = useCreateGoodsReceipt();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [poId, setPoId] = useState(searchParams.get("purchaseOrderId") ?? "");
  const [warehouseId, setWarehouseId] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineInput[]>([]);
  const { data: allReceivings = [] } = useReceivings();

  const { data: poDetail } = usePurchaseOrder(poId || undefined);
  const receivingsForPo = poId ? (allReceivings as any[]).filter((r) => r.purchaseOrderId === poId) : [];
  const hasPendingQc = receivingsForPo.some((r) => r.status === "PENDING_QC" || r.status === "DRAFT");
  const hasCompleted = receivingsForPo.some((r) => r.status === "COMPLETED" || r.status === "POSTED");
  const gnrBlocked = receivingsForPo.length > 0 && (hasPendingQc || !hasCompleted);
  const gnrBlockReason = hasPendingQc
    ? "Receiving untuk PO ini masih Pending QC / Draft — selesaikan QC hingga COMPLETED dulu sebelum buat GNR (stock masuk gudang)."
    : receivingsForPo.length > 0 && !hasCompleted
      ? "Receiving belum COMPLETED — selesaikan QC dulu."
      : null;

  // Auto-fill warehouse + lines when a PO is chosen.
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
    if (!poId) return setError("Select a Purchase Order first.");
    if (!warehouseId) return setError("Warehouse is required.");
    if (!receiptDate) return setError("Receipt date is required.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Add at least one line item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Every line must have a qty > 0.");
    }
    try {
      const res = await create.mutateAsync({
        purchaseOrderId: poId,
        warehouseId,
        receiptDate,
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
      navigate(`/app/goods-receipts/${(res as any).documentNo ?? res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create goods receipt.");
    }
  };

  if (posLoading || warehousesLoading || uomsLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
        <FormSkeleton sections={[["half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
      <FormPage
        title="New Goods Receipt"
        actions={
          <Button size="sm" onClick={submit} disabled={create.isPending || !!gnrBlocked}>
            {create.isPending ? "Saving..." : "Save"}
          </Button>
        }
      >
        {gnrBlocked && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <strong>QC belum completed:</strong> {gnrBlockReason} GNR tidak akan menggerakkan stock.
          </div>
        )}
        <FormSection>
          <FormGrid>
            <SearchableSelect
              label="Purchase Order"
              placeholder="Select purchase order..."
              options={pos.map((p) => ({ value: p.id, label: `PO ${formatId(p.id)} · ${p.status}` }))}
              value={poId}
              onChange={(v) => setPoId(v)}
            />
            <SearchableSelect
              label="Warehouse"
              placeholder="Select warehouse..."
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v)}
            />
            <DatePicker
              label="Receipt Date"
              value={receiptDate}
              onChange={(v) => setReceiptDate(v)}
            />
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea
                placeholder="Optional notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Lines (copied from PO — editable)">
          <OrderLineTable value={lines} onChange={setLines} />
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}