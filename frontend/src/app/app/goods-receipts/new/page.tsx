"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import {
  usePurchaseOrders,
  usePurchaseOrder,
  useAllWarehouses,
  useUoms,
  useCreateGoodsReceipt,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid, FormActions } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewGoodsReceiptPage() {
  const navigate = useNavigate();
  const { data: pos = [], isLoading: posLoading } = usePurchaseOrders();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { isLoading: uomsLoading } = useUoms();
  const create = useCreateGoodsReceipt();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [poId, setPoId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineInput[]>([]);

  const { data: poDetail } = usePurchaseOrder(poId || undefined);

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
      navigate(`/app/goods-receipts/${res.id}`);
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
      <FormPage title="New Goods Receipt">
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

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/goods-receipts")}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button variant="primary" onClick={submit} disabled={create.isPending}>
            <Save size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
