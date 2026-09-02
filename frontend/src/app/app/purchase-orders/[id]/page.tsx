import { useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, X } from "lucide-react";
import {
  usePurchaseOrder,
  useSuppliers,
  useAllWarehouses,
  useUoms,
  useUpdatePurchaseOrder,
  usePostPurchaseOrder,
  useCancelPurchaseOrder,
  useCreateReceiptFromPo,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: uoms = [] } = useUoms();
  const update = useUpdatePurchaseOrder();
  const post = usePostPurchaseOrder();
  const cancel = useCancelPurchaseOrder();
  const createReceipt = useCreateReceiptFromPo();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [editing, setEditing] = useState(false);

  const lines = po?.lines ?? [];
  const supplierName = (sid?: string) => suppliers.find((s) => s.id === sid)?.name ?? "—";
  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "—";

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
        <p className="py-20 text-center text-muted-foreground">Loading…</p>
      </RoleGuard>
    );
  }
  if (!po) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
        <p className="py-20 text-center text-foreground">Purchase order not found.</p>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <POBody
        po={po}
        editing={editing}
        setEditing={setEditing}
        supplierName={supplierName}
        warehouseName={warehouseName}
        suppliers={suppliers}
        warehouses={warehouses}
        uoms={uoms}
        update={update}
        post={post}
        cancel={cancel}
        createReceipt={createReceipt}
        navigate={navigate}
      />
    </RoleGuard>
  );
}

function POBody({
  po,
  editing,
  setEditing,
  supplierName,
  warehouseName,
  suppliers,
  warehouses,
  uoms,
  update,
  post,
  cancel,
  createReceipt,
  navigate,
}: {
  po: PurchaseOrder;
  editing: boolean;
  setEditing: (v: boolean) => void;
  supplierName: (id?: string) => string;
  warehouseName: (id?: string) => string;
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  uoms: { id: string; name: string }[];
  update: ReturnType<typeof useUpdatePurchaseOrder>;
  post: ReturnType<typeof usePostPurchaseOrder>;
  cancel: ReturnType<typeof useCancelPurchaseOrder>;
  createReceipt: ReturnType<typeof useCreateReceiptFromPo>;
  navigate: (to: string) => void;
}) {
  const [err, setErr] = useState("");
  useErrorToast(err);
  const [form, setForm] = useState({
    supplierId: po.supplierId,
    warehouseId: po.warehouseId,
    orderDate: po.orderDate?.slice(0, 10) ?? todayISO(),
    expectedDate: po.expectedDate?.slice(0, 10) ?? "",
    notes: po.notes ?? "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>(
    (po.lines ?? []).map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice ?? "",
      batchNumber: l.batchNumber ?? "",
      note: l.note ?? "",
      deliveryDate: (l as unknown as { deliveryDate?: string | null }).deliveryDate ?? "",
    }))
  );

  const saveEdit = async () => {
    const valid = lines.filter((l) => l.itemId);
    try {
      await update.mutateAsync({
        id: po.id,
        patch: {
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
            deliveryDate: (l.deliveryDate || form.expectedDate) || null,
          })),
        },
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  const onPost = async () => {
    if (!confirm("Post this purchase order?")) return;
    try {
      await post.mutateAsync(po.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to post.");
    }
  };
  const onCancel = async () => {
    if (!confirm("Cancel this purchase order?")) return;
    try {
      await cancel.mutateAsync(po.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to cancel.");
    }
  };
  const onReceipt = async () => {
    if (!confirm("Create a Goods Receipt from this PO?")) return;
    try {
      const res = await createReceipt.mutateAsync({ id: po.id, receiptDate: todayISO() });
      navigate(`/app/goods-receipts/${res.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create receipt.");
    }
  };

  const isDraft = po.status === "DRAFT";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              PO {formatId(po.id)}
            </h1>
            <DocStatusBadge status={po.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {supplierName(po.supplierId)} · {warehouseName(po.warehouseId)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && isDraft && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={2} /> Edit
            </Button>
          )}
          {!editing && (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={po.status === "CANCELED" || post.isPending}>
              Cancel
            </Button>
          )}
          {!editing && (
            <Button variant="primary" size="sm" onClick={onPost} disabled={!isDraft || post.isPending}>
              Post
            </Button>
          )}
          {!editing && (
            <Button variant="default" size="sm" onClick={onReceipt} disabled={po.status !== "DRAFT" && po.status !== "POSTED" || createReceipt.isPending}>
              <Plus size={14} strokeWidth={2} /> Buat Penerimaan
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
              <Input label="Purchaser" value={(po as unknown as { createdByName?: string }).createdByName ?? "—"} disabled />
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
              <DatePicker label="Order Date" value={form.orderDate} onChange={(v) => setForm({ ...form, orderDate: v })} />
              <DatePicker label="Tgl Kirim (Expected Date)" value={form.expectedDate} onChange={(v) => setForm({ ...form, expectedDate: v })} />
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</h2>
            <OrderLineTable value={lines} onChange={setLines} headerDeliveryDate={form.expectedDate} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Purchaser" value={(po as unknown as { createdByName?: string }).createdByName ?? "—"} />
              <Detail label="Supplier" value={supplierName(po.supplierId)} />
              <Detail label="Warehouse" value={warehouseName(po.warehouseId)} />
              <Detail label="Order Date" value={po.orderDate?.slice(0, 10) ?? "—"} />
              <Detail label="Tgl Kirim" value={po.expectedDate?.slice(0, 10) ?? "—"} />
              <Detail label="Notes" value={po.notes || "—"} />
            </dl>
          </div>

          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</h2>
            <OrderLineTable value={lines} onChange={() => {}} readOnly headerDeliveryDate={po.expectedDate ?? undefined} />
          </div>

          {po.receipts && po.receipts.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Linked Goods Receipts
                </h2>
              </div>
              <div className="divide-y divide-border">
                {po.receipts.map((r) => (
                  <Link
                    key={r.id}
                    to={`/app/goods-receipts/${r.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-muted/60"
                  >
                    <span className="font-mono text-[13px] font-semibold">GR {formatId(r.id)}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">{r.receiptDate?.slice(0, 10)}</span>
                      <DocStatusBadge status={r.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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