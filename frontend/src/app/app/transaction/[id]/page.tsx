import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, X } from "lucide-react";
import {
  useAllWarehouses,
  useStockMovement,
  useUpdateMovement,
  usePostMovement,
  useUnpostMovement,
  useAmendMovement,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { OrderLineTable, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatTime } from "@/lib/utils";

const MENU = "inventory.transactions";
const LIST_HREF = "/app/transaction";

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: movement, isLoading, error: fetchError, isError } = useStockMovement(id) as any;
  const { data: warehouses = [] } = useAllWarehouses();
  const update = useUpdateMovement();
  const post = usePostMovement();
  const unpost = useUnpostMovement();
  const amend = useAmendMovement();
  const [error, setError] = useState("");
  useErrorToast(error);
  useEffect(() => { if (isError) console.error("[TransactionDetail] fetchError", id, fetchError); }, [isError, fetchError, id]);
  const [editing, setEditing] = useState(false);

  const warehouseName = (wid?: string | null) => warehouses.find((w) => w.id === wid)?.name ?? "—";

  const [form, setForm] = useState({ warehouseId: "", movementDate: "", description: "" });
  const [lines, setLines] = useState<OrderLineInput[]>([]);

  useEffect(() => {
    if (movement) {
      const first = movement.details?.[0];
      setForm({
        warehouseId: first?.toWarehouseId ?? first?.fromWarehouseId ?? "",
        movementDate: movement.movementDate?.slice(0, 10) ?? "",
        description: movement.description ?? "",
      });
      setLines(
        (movement.details ?? []).map((d: any) => ({
          itemId: d.itemId,
          uomId: d.uomId,
          qty: String(d.qty),
          unitPrice: d.incomingRate ?? d.unitPrice ?? "",
          batchNumber: d.batchNumber ?? d.batchId ?? "",
          note: d.note ?? "",
        }))
      );
    }
  }, [movement]);

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={[MENU]}>
        <p className="py-20 text-center text-muted-foreground">Loading… {id}</p>
      </RoleGuard>
    );
  }
  if (isError) {
    return (
      <RoleGuard roles={[]} menus={[MENU]}>
        <p className="py-20 text-center text-red-500">Gagal load: {String((fetchError as any)?.message ?? fetchError)} (id={id})</p>
      </RoleGuard>
    );
  }
  if (!movement) {
    return (
      <RoleGuard roles={[]} menus={[MENU]}>
        <p className="py-20 text-center text-foreground">Transaksi tidak ditemukan. (id={id})</p>
      </RoleGuard>
    );
  }

  const docNo = (movement as any).documentNo ?? movement.id;
  const isDraft = movement.status === "DRAFT";

  const saveEdit = async () => {
    const valid = lines.filter((l) => l.itemId);
    try {
      await update.mutateAsync({
        id: movement.id,
        body: {
          typeId: movement.typeId,
          movementDate: form.movementDate || null,
          status: "DRAFT",
          description: form.description.trim() || null,
          details: valid.map((l) => ({
            itemId: l.itemId,
            fromWarehouseId: null,
            toWarehouseId: form.warehouseId || null,
            qty: Number(l.qty),
            uomId: l.uomId || null,
            batchNumber: l.batchNumber || null,
            incomingRate: l.unitPrice ? Number(l.unitPrice) : null,
          })),
        } as any,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    }
  };

  const onPost = async () => {
    if (!confirm(`Posting transaksi ${docNo}?`)) return;
    try { await post.mutateAsync(movement.id); } catch (e) { setError(e instanceof Error ? e.message : "Gagal posting."); }
  };
  const onCancel = async () => {
    if (!confirm(`Batalkan transaksi ${docNo}?`)) return;
    try { await unpost.mutateAsync(movement.id); } catch (e) { setError(e instanceof Error ? e.message : "Gagal membatalkan."); }
  };
  const onAmend = async () => {
    if (!confirm(`Amend ${docNo}?`)) return;
    try { await amend.mutateAsync(movement.id); } catch (e) { setError(e instanceof Error ? e.message : "Gagal amend."); }
  };

  return (
    <RoleGuard roles={[]} menus={[MENU]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" className="mb-2 h-7 px-2 text-xs" onClick={() => navigate(LIST_HREF)}>
            <ArrowLeft size={14} strokeWidth={2} /> Transaction
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{docNo}</h1>
            <DocStatusBadge status={movement.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {movement.typeName ?? movement.typeCode ?? "—"} · {warehouseName(form.warehouseId)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!editing && isDraft && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil size={14} strokeWidth={2} /> Edit
            </Button>
          )}
          {!editing && movement.status === "POSTED" && (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={post.isPending}>
              Cancel
            </Button>
          )}
          {!editing && isDraft && (
            <Button variant="primary" size="sm" onClick={onPost} disabled={post.isPending}>
              Post
            </Button>
          )}
          {movement.status === "CANCELED" && !editing && (
            <Button variant="outline" size="sm" onClick={onAmend}>
              Amend
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
                label="Gudang Tujuan"
                placeholder="Pilih gudang..."
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                value={form.warehouseId}
                onChange={(v) => setForm({ ...form, warehouseId: v })}
              />
              <DatePicker label="Posting Date" value={form.movementDate} onChange={(v) => setForm({ ...form, movementDate: v })} />
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium leading-none">Description</label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Item</h2>
            <OrderLineTable value={lines} onChange={setLines} />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Gudang" value={warehouseName(movement.details?.[0]?.toWarehouseId ?? movement.details?.[0]?.fromWarehouseId)} />
              <Detail label="Posting Date" value={movement.movementDate?.slice(0, 10) ?? "—"} />
              <Detail label="Posting Time" value={movement.createdAt ? formatTime(movement.createdAt) : "—"} />
              <div className="sm:col-span-2">
                <Detail label="Description" value={movement.description || "—"} />
              </div>
            </dl>
          </div>
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Item</h2>
            <OrderLineTable value={lines} onChange={() => {}} readOnly />
          </div>
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              <Detail label="Type" value={movement.typeName ?? movement.typeCode ?? "—"} />
              <Detail label="Status" value={movement.status} />
            </dl>
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
