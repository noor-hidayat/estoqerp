import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, X, Printer } from "lucide-react";
import {
  useGoodsReceipt,
  useAllWarehouses,
  useUpdateGoodsReceipt,
  usePostGoodsReceipt,
  useCancelGoodsReceipt,
  useRemoveGoodsReceipt,
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
import type { GoodsReceipt } from "@/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: gr, isLoading } = useGoodsReceipt(id);
  const { data: warehouses = [] } = useAllWarehouses();
  const update = useUpdateGoodsReceipt();
  const post = usePostGoodsReceipt();
  const cancel = useCancelGoodsReceipt();
  const remove = useRemoveGoodsReceipt();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [editing, setEditing] = useState(false);

  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "";

  const [form, setForm] = useState({
    warehouseId: "",
    receiptDate: todayISO(),
    notes: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([]);

  useEffect(() => {
    if (gr) {
      setForm({
        warehouseId: gr.warehouseId,
        receiptDate: gr.receiptDate?.slice(0, 10) ?? todayISO(),
        notes: gr.notes ?? "",
      });
      setLines(
        (gr.lines ?? []).map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: String(l.qty),
          unitPrice: l.unitPrice ?? "",
          batchNumber: l.batchNumber ?? "",
          note: l.note ?? "",
        }))
      );
    }
  }, [gr]);

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
        <p className="py-20 text-center text-muted-foreground">Loading…</p>
      </RoleGuard>
    );
  }
  if (!gr) {
    return (
      <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
        <p className="py-20 text-center text-foreground">Goods receipt not found.</p>
      </RoleGuard>
    );
  }

  const saveEdit = async () => {
    const valid = lines.filter((l) => l.itemId);
    try {
      await update.mutateAsync({
        id: gr.id,
        patch: {
          warehouseId: form.warehouseId,
          receiptDate: form.receiptDate,
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

  const isDraft = gr.status === "DRAFT";
  const onPost = async () => {
    if (!confirm("Post this goods receipt? Stock will come IN.")) return;
    try {
      await post.mutateAsync(gr.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post.");
    }
  };
  const onCancel = async () => {
    if (!confirm("Cancel this goods receipt?")) return;
    try {
      await cancel.mutateAsync(gr.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel.");
    }
  };
  const onDelete = async () => {
    if (!confirm("Delete this goods receipt? Data akan dihapus dari database.")) return;
    try {
      await remove.mutateAsync(gr.id);
      navigate("/app/goods-receipts");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
    }
  };

  return (
    <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              GR {(gr as any).documentNo ?? (gr as any).grNo ?? formatId(gr.id)}
            </h1>
            <DocStatusBadge status={gr.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            PO {formatId(gr.purchaseOrderId)} · {warehouseName(gr.warehouseId)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
              cancelDisabled={gr.status === "CANCELED" || post.isPending}
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
                label="Warehouse"
                placeholder="Select warehouse..."
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                value={form.warehouseId}
                onChange={(v) => setForm({ ...form, warehouseId: v })}
              />
              <DatePicker label="Receipt Date" value={form.receiptDate} onChange={(v) => setForm({ ...form, receiptDate: v })} />
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
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Purchase Order</dt>
                <dd className="mt-1 text-sm">
                  <Link to={`/app/purchase-orders/${gr.purchaseOrderId}`} className="font-medium text-primary hover:text-primary/80">
                    PO {formatId(gr.purchaseOrderId)}
                  </Link>
                </dd>
              </div>
              <Detail label="Warehouse" value={warehouseName(gr.warehouseId)} />
              <Detail label="Receipt Date" value={gr.receiptDate?.slice(0, 10) ?? ""} />
              <Detail label="Notes" value={gr.notes || ""} />
            </dl>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Lines</h2>
            <OrderLineTable value={lines} onChange={() => {}} readOnly />
          </div>
        </div>
      )}

      <FormSection title="Activity Log">
        <ActivityTimeline documentType="GR" documentId={gr.id} />
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