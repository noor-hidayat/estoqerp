import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useCustomers, useAllWarehouses, useUoms, useCreateDelivery, useSalesOrders } from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid, FormActions } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewDeliveryPage() {
  const navigate = useNavigate();
  const { data: customers = [], isLoading: customersLoading } = useCustomers();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { data: salesOrders = [], isLoading: soLoading } = useSalesOrders();
  const { isLoading: uomsLoading } = useUoms();
  const create = useCreateDelivery();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [form, setForm] = useState({
    salesOrderId: "",
    customerId: "",
    warehouseId: "",
    deliveryDate: todayISO(),
    notes: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([emptyOrderLine()]);

  const handleSoChange = (soId: string) => {
    setForm((prev) => ({ ...prev, salesOrderId: soId }));
    const so = salesOrders.find((s) => s.id === soId);
    if (so) {
      setForm((prev) => ({ ...prev, customerId: so.customerId, warehouseId: so.warehouseId }));
      // optionally load lines from SO detail via API — simplified: keep empty for now, user fills
    }
  };

  const submit = async () => {
    if (!form.warehouseId) return setError("Warehouse is required.");
    if (!form.deliveryDate) return setError("Delivery date is required.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Add at least one line item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Every line must have a qty > 0.");
    }
    try {
      const res = await create.mutateAsync({
        salesOrderId: form.salesOrderId || null,
        customerId: form.customerId || null,
        warehouseId: form.warehouseId,
        deliveryDate: form.deliveryDate,
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
      navigate(`/app/deliveries/${(res as any).documentNo ?? res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create delivery.");
    }
  };

  if (customersLoading || warehousesLoading || uomsLoading || soLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.deliveries"]}>
        <FormSkeleton sections={[["half", "half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.deliveries"]}>
      <FormPage title="New Delivery">
        <FormSection>
          <FormGrid>
            <SearchableSelect
              label="Sales Order (optional)"
              placeholder="Select SO to copy..."
              options={salesOrders.map((s) => ({ value: s.id, label: `${s.soNo} - ${s.id.slice(0, 8)}` }))}
              value={form.salesOrderId}
              onChange={handleSoChange}
            />
            <SearchableSelect
              label="Customer"
              placeholder="Select customer..."
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              value={form.customerId}
              onChange={(v) => setForm({ ...form, customerId: v })}
            />
            <SearchableSelect
              label="Warehouse"
              placeholder="Select warehouse..."
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={form.warehouseId}
              onChange={(v) => setForm({ ...form, warehouseId: v })}
            />
            <DatePicker label="Delivery Date" value={form.deliveryDate} onChange={(v) => setForm({ ...form, deliveryDate: v })} />
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Lines">
          <OrderLineTable value={lines} onChange={setLines} />
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/deliveries")}>
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
