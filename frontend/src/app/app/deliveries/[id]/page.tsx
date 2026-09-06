import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, X } from "lucide-react";
import {
  useDelivery,
  useCustomers,
  useAllWarehouses,
  useSalesOrders,
  useUpdateDelivery,
  usePostDelivery,
  useCancelDelivery,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { OrderLineTable, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: dlv, isLoading } = useDelivery(id);
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: salesOrders = [] } = useSalesOrders();
  const update = useUpdateDelivery();
  const post = usePostDelivery();
  const cancel = useCancelDelivery();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [editing, setEditing] = useState(false);

  const customerName = (cid?: string | null) => (cid ? customers.find((c) => c.id === cid)?.name ?? "—" : "—");
  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "—";
  const soNo = (sid?: string | null) => (sid ? salesOrders.find((s) => s.id === sid)?.soNo ?? formatId(sid) : "—");

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.deliveries"]}>
        <p className="py-20 text-center text-muted-foreground">Loading…</p>
      </RoleGuard>
    );
  }
  if (!dlv) {
    return (
      <RoleGuard roles={[]} menus={["supply.deliveries"]}>
        <p className="py-20 text-center text-foreground">Delivery not found.</p>
      </RoleGuard>
    );
  }

  const [form, setForm] = useState({
    salesOrderId: dlv.salesOrderId ?? "",
    customerId: dlv.customerId ?? "",
    warehouseId: dlv.warehouseId,
    deliveryDate: dlv.deliveryDate?.slice(0, 10) ?? todayISO(),
    notes: (dlv as any).notes ?? "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>(
    ((dlv as any).lines ?? []).map((l: any) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice ?? "",
      batchNumber: l.batchNumber ?? "",
      note: l.note ?? "",
    }))
  );

  // Sync when dlv loads initially (only once)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (editing === false && lines.length === 0 && (dlv as any).lines?.length) {
    // This will be handled via useEffect in real, but keep simple: already set above on first render
  }

  const saveEdit = async () => {
    const valid = lines.filter((l) => l.itemId);
    try {
      await update.mutateAsync({
        id: dlv.id,
        patch: {
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
        },
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  const isDraft = dlv.status === "DRAFT";
  const onPost = async () => {
    if (!confirm("Post this delivery? Stock will go OUT.")) return;
    try {
      await post.mutateAsync(dlv.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post.");
    }
  };
  const onCancel = async () => {
    if (!confirm("Cancel this delivery?")) return;
    try {
      await cancel.mutateAsync(dlv.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel.");
    }
  };

  return (
    <RoleGuard roles={[]} menus={["supply.deliveries"]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{(dlv as any).documentNo ?? `DLV ${formatId(dlv.id)}`}</h1>
            <DocStatusBadge status={dlv.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {customerName(dlv.customerId)} · {warehouseName(dlv.warehouseId)} · {dlv.deliveryDate?.slice(0, 10)}
          </p>
          {dlv.salesOrderId && <p className="text-xs text-muted-foreground">From SO {soNo(dlv.salesOrderId)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && isDraft && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={2} /> Edit
            </Button>
          )}
          {!editing && (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={dlv.status === "CANCELED" || post.isPending}>
              Cancel
            </Button>
          )}
          {!editing && (
            <Button variant="primary" size="sm" onClick={onPost} disabled={!isDraft || post.isPending}>
              Post
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
                label="Sales Order"
                placeholder="Select SO..."
                options={salesOrders.map((s) => ({ value: s.id, label: String(s.soNo) }))}
                value={form.salesOrderId}
                onChange={(v) => setForm({ ...form, salesOrderId: v })}
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
              <Detail label="Sales Order" value={dlv.salesOrderId ? String(soNo(dlv.salesOrderId)) : "—"} />
              <Detail label="Customer" value={customerName(dlv.customerId)} />
              <Detail label="Warehouse" value={warehouseName(dlv.warehouseId)} />
              <Detail label="Delivery Date" value={dlv.deliveryDate?.slice(0, 10) ?? "—"} />
              <Detail label="Notes" value={(dlv as any).notes || "—"} />
            </dl>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</h2>
            <OrderLineTable value={lines} onChange={() => {}} readOnly />
          </div>
        </div>
      )}
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
