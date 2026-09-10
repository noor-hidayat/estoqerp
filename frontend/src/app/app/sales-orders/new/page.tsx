import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCustomers,
  useAllWarehouses,
  useUoms,
  useCreateSalesOrder,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocMenu } from "@/components/ui/doc-menu";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function NewSalesOrderPage() {
  const navigate = useNavigate();
  const { data: customers = [], isLoading: customersLoading } = useCustomers();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { isLoading: uomsLoading } = useUoms();
  const create = useCreateSalesOrder();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [form, setForm] = useState({
    customerId: "",
    warehouseId: "",
    orderDate: todayISO(),
    expectedDate: "",
    notes: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([emptyOrderLine()]);

  const resetForm = () => {
    if (!confirm("Hapus semua isian form ini?")) return;
    setForm({ customerId: "", warehouseId: "", orderDate: todayISO(), expectedDate: "", notes: "" });
    setLines([emptyOrderLine()]);
  };

  const submit = async () => {
    if (!form.customerId) return setError("Customer is required.");
    if (!form.warehouseId) return setError("Warehouse is required.");
    if (!form.orderDate) return setError("Order date is required.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Add at least one line item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Every line must have a qty > 0.");
    }
    try {
      const res = await create.mutateAsync({
        customerId: form.customerId,
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
      navigate(`/app/sales-orders/${(res as any).id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create sales order.");
    }
  };

  if (customersLoading || warehousesLoading || uomsLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.salesOrders"]}>
        <FormSkeleton sections={[["half", "half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.salesOrders"]}>
      <FormPage
        title="New Sales Order"
        actions={
          <div className="flex items-center gap-2">
            <DocMenu onCancel={() => navigate("/app/sales-orders")} onDelete={resetForm} />
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <FormSection>
          <FormGrid>
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
      </FormPage>
    </RoleGuard>
  );
}