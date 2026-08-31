import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import {
  useSuppliers,
  useAllWarehouses,
  useUoms,
  useCreatePurchaseOrder,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid, FormActions } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewPurchaseOrderPage() {
  const navigate = useNavigate();
  const { data: suppliers = [], isLoading: suppliersLoading } = useSuppliers();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { isLoading: uomsLoading } = useUoms();
  const create = useCreatePurchaseOrder();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [form, setForm] = useState({
    supplierId: "",
    warehouseId: "",
    orderDate: todayISO(),
    expectedDate: "",
    notes: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([emptyOrderLine()]);

  const submit = async () => {
    if (!form.supplierId) return setError("Supplier is required.");
    if (!form.warehouseId) return setError("Warehouse is required.");
    if (!form.orderDate) return setError("Order date is required.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Add at least one line item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Every line must have a qty > 0.");
    }
    try {
      const res = await create.mutateAsync({
        supplierId: form.supplierId,
        warehouseId: form.warehouseId,
        orderDate: form.orderDate,
        expectedDate: form.expectedDate || null,
        notes: form.notes.trim() || null,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: l.qty,
          unitPrice: l.unitPrice || null,
          batchNumber: l.batchNumber || null,
          note: l.note || null,
        })),
      });
      navigate(`/app/purchase-orders/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase order.");
    }
  };

  if (suppliersLoading || warehousesLoading || uomsLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
        <FormSkeleton sections={[["half", "half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <FormPage title="New Purchase Order">
        <FormSection>
          <FormGrid>
            <SearchableSelect
              label="Supplier"
              placeholder="Select supplier..."
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={form.supplierId}
              onChange={(v) => setForm({ ...form, supplierId: v })}
            />
            <SearchableSelect
              label="Warehouse"
              placeholder="Select warehouse..."
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={form.warehouseId}
              onChange={(v) => setForm({ ...form, warehouseId: v })}
            />
            <DatePicker
              label="Order Date"
              value={form.orderDate}
              onChange={(v) => setForm({ ...form, orderDate: v })}
            />
            <DatePicker
              label="Expected Date"
              value={form.expectedDate}
              onChange={(v) => setForm({ ...form, expectedDate: v })}
            />
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea
                placeholder="Optional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Lines">
          <OrderLineTable value={lines} onChange={setLines} />
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/purchase-orders")}>
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