import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, X, Printer } from "lucide-react";
import {
  useSalesOrder,
  useCustomers,
  useAllWarehouses,
  useUpdateSalesOrder,
  usePostSalesOrder,
  useCancelSalesOrder,
  useRemoveSalesOrder,
  useCreateDeliveryFromSo,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocMenu } from "@/components/ui/doc-menu";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { OrderLineTable, type OrderLineInput } from "@/components/supply/order-line-table";
import { FormSection } from "@/components/ui/form-page";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId } from "@/lib/utils";
import type { SalesOrder } from "@/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: so, isLoading } = useSalesOrder(id);
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useAllWarehouses();
  const update = useUpdateSalesOrder();
  const post = usePostSalesOrder();
  const cancel = useCancelSalesOrder();
  const remove = useRemoveSalesOrder();
  const createDelivery = useCreateDeliveryFromSo();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [editing, setEditing] = useState(false);

  const customerName = (cid?: string) => customers.find((c) => c.id === cid)?.name ?? "—";
  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "—";

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.salesOrders"]}>
        <p className="py-20 text-center text-muted-foreground">Loading…</p>
      </RoleGuard>
    );
  }
  if (!so) {
    return (
      <RoleGuard roles={[]} menus={["supply.salesOrders"]}>
        <p className="py-20 text-center text-foreground">Sales order not found.</p>
      </RoleGuard>
    );
  }

  const [form, setForm] = useState({
    customerId: so.customerId,
    warehouseId: so.warehouseId,
    orderDate: so.orderDate?.slice(0, 10) ?? todayISO(),
    expectedDate: so.expectedDate?.slice(0, 10) ?? "",
    notes: so.notes ?? "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>(
    (so.lines ?? []).map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice ?? "",
      batchNumber: l.batchNumber ?? "",
      note: l.note ?? "",
    }))
  );

  const saveEdit = async () => {
    const valid = lines.filter((l) => l.itemId);
    try {
      await update.mutateAsync({
        id: so.id,
        patch: {
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
        },
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  const isDraft = so.status === "DRAFT";
  const onPost = async () => {
    if (!confirm("Post this sales order? Stock will go OUT.")) return;
    try {
      await post.mutateAsync(so.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post.");
    }
  };
  const onCancel = async () => {
    if (!confirm("Cancel this sales order?")) return;
    try {
      await cancel.mutateAsync(so.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel.");
    }
  };
  const onDelete = async () => {
    if (!confirm("Delete this sales order? Data akan dihapus dari database.")) return;
    try {
      await remove.mutateAsync(so.id);
      navigate("/app/sales-orders");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };
  const onCreateDelivery = async () => {
    if (!confirm("Create delivery from this SO?")) return;
    try {
      const res = await createDelivery.mutateAsync({ id: so.id, deliveryDate: new Date().toISOString().slice(0, 10) });
      navigate(`/app/deliveries/${(res as any).id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create delivery.");
    }
  };

  return (
    <RoleGuard roles={[]} menus={["supply.salesOrders"]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              SO {(so as any).documentNo ?? (so as any).soNo ?? formatId(so.id)}
            </h1>
            <DocStatusBadge status={so.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {customerName(so.customerId)} · {warehouseName(so.warehouseId)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && (
            <Button variant="outline" size="sm" onClick={onCreateDelivery} disabled={createDelivery.isPending}>
              Create Delivery
            </Button>
          )}
          {!editing && isDraft && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={2} /> Edit
            </Button>
          )}
          {!editing && (
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Print" onClick={() => window.print()}>
              <Printer size={16} />
            </Button>
          )}
          {!editing && (
            <DocMenu
              onCancel={onCancel}
              onDelete={onDelete}
              cancelDisabled={so.status === "CANCELED" || post.isPending}
            />
          )}
          {!editing && isDraft && (
            <Button variant="primary" size="sm" onClick={onPost} disabled={post.isPending}>
              Submit
            </Button>
          )}
          {editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X size={14} strokeWidth={2} /> Discard
            </Button>
          )}
          {editing && (
            <Button variant="primary" size="sm" onClick={saveEdit} disabled={update.isPending}>
              Save
            </Button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
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
              <DatePicker label="Order Date" value={form.orderDate} onChange={(v) => setForm({ ...form, orderDate: v })} />
              <DatePicker label="Expected Date" value={form.expectedDate} onChange={(v) => setForm({ ...form, expectedDate: v })} />
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</h2>
            <OrderLineTable value={lines} onChange={setLines} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Customer" value={customerName(so.customerId)} />
              <Detail label="Warehouse" value={warehouseName(so.warehouseId)} />
              <Detail label="Order Date" value={so.orderDate?.slice(0, 10) ?? "—"} />
              <Detail label="Expected Date" value={so.expectedDate?.slice(0, 10) ?? "—"} />
              <Detail label="Notes" value={so.notes || "—"} />
            </dl>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</h2>
            <OrderLineTable value={lines} onChange={() => {}} readOnly />
          </div>
        </div>
      )}

      <FormSection title="Activity Log">
        <ActivityTimeline documentType="SO" documentId={so.id} />
      </FormSection>
    </RoleGuard>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}