import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, Save, X, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  useAllWarehouses,
  useCancelReceiving,
  useReceiving,
  usePostReceiving,
  useUpdateReceiving,
  useSubmitReceiving,
  useRemoveReceiving,
  usePurchaseOrders,
  usePurchaseOrder,
  useSuppliers,
  useItemsList,
  useQcInspections,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocMenu } from "@/components/ui/doc-menu";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { type OrderLineInput } from "@/components/supply/order-line-table";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableInput } from "@/components/ui/table-input";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId, formatNumber } from "@/lib/utils";

const MENU = "supply.receivings";
const LIST_HREF = "/app/receiving";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function toTimeStr(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function ReceivingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: gr, isLoading, error: fetchError, isError } = useReceiving(id) as any;
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: pos = [] } = usePurchaseOrders();
  const { data: suppliers = [] } = useSuppliers();
  const { data: items = [] } = useItemsList();
  const { data: poDetail } = usePurchaseOrder((gr as any)?.purchaseOrderId);
  const { data: qcHistory = [] } = useQcInspections(gr?.id ? { receivingId: gr.id } : undefined) as any;
  const update = useUpdateReceiving();
  const post = usePostReceiving();
  const submit = useSubmitReceiving();
  const cancel = useCancelReceiving();
  const remove = useRemoveReceiving();
  // qc via separate QC Inspection document (new page)
  const [error, setError] = useState("");
  useErrorToast(error);
  useEffect(() => { if (isError) console.error("[ReceivingDetail] fetchError", id, fetchError); }, [isError, fetchError, id]);
  const [editing, setEditing] = useState(false);

  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "—";
  const supplierName = (sid?: string) => suppliers.find((s) => s.id === sid)?.name ?? "—";
  const poLabel = (pid?: string) => {
    const p = pos.find((x) => x.id === pid);
    return p ? `${p.documentNo ?? p.poNo ?? formatId(p.id)} · ${p.status}` : formatId(pid);
  };
  const supplierIdForGr = (() => {
    const fromGr = (gr as any)?.supplierId as string | undefined;
    if (fromGr) return fromGr;
    const po = pos.find((p) => p.id === (gr as any)?.purchaseOrderId);
    return po?.supplierId;
  })();

  const [form, setForm] = useState({
    purchaseOrderId: "",
    warehouseId: "",
    receiptDate: todayISO(),
    notes: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([]);

  useEffect(() => {
    if (gr) {
      setForm({
        purchaseOrderId: (gr as any).purchaseOrderId ?? "",
        warehouseId: gr.warehouseId,
        receiptDate: gr.receiptDate?.slice(0, 10) ?? todayISO(),
        notes: gr.notes ?? "",
      });
      setLines(
        (gr.lines ?? []).map((l: any) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: String(l.qty),
          unitPrice: l.unitPrice ?? "",
          batchNumber: l.batchNumber ?? "",
          note: l.note ?? "",
          qtyAccepted: l.qtyAccepted ?? null,
          qtyRejected: l.qtyRejected ?? null,
          rejectReason: l.rejectReason ?? null,
        } as any))
      );
    }
  }, [gr]);

  const saveEdit = async () => {
    if (!gr) return;
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
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    }
  };

  const isDraft = gr?.status === "DRAFT";
  const isPendingQc = gr?.status === "PENDING_QC";
  const isCompleted = gr?.status === "COMPLETED" || gr?.status === "POSTED";
  const isCanceled = gr?.status === "CANCELED";
  const onSubmit = async () => {
    if (!gr) return;
    const confirmed = await new Promise<boolean>((resolve) => {
      let toastId: string | number | undefined;
      const cleanup = (val: boolean) => {
        if (toastId !== undefined) toast.dismiss(toastId);
        else toast.dismiss();
        window.removeEventListener("keydown", handler);
        resolve(val);
      };
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); cleanup(true); }
        if (e.key === "Escape") { cleanup(false); }
      };
      window.addEventListener("keydown", handler);
      toastId = toast.custom(
        () => (
          <div className="bg-background border border-border rounded-lg shadow-lg p-3 w-[340px]">
            <div className="font-semibold text-xs">Submit Receiving?</div>
            <div className="text-xs text-muted-foreground mt-1">Status akan menjadi Pending for QC Inspection.</div>
            <div className="flex justify-end gap-1.5 mt-3">
              <Button variant="ghost" size="sm" className="h-6 px-2.5 text-xs" onClick={() => cleanup(false)}>
                No
              </Button>
              <Button size="sm" className="h-6 px-2.5 text-xs" autoFocus onClick={() => cleanup(true)}>
                Yes
              </Button>
            </div>
          </div>
        ),
        { duration: Infinity }
      ) as unknown as string;
    });
    if (!confirmed) return;
    try {
      await submit.mutateAsync(gr.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal submit.");
    }
  };
  const onPost = async () => {
    if (!gr) return;
    if (isDraft) return onSubmit();
    if (isPendingQc) {
      if (!confirm("Posting langsung ke COMPLETED tanpa QC detail?")) return;
      try {
        await post.mutateAsync(gr.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal posting.");
      }
      return;
    }
  };
  const onCancel = async () => {
    if (!gr) return;
    if (!confirm("Batalkan receiving ini?")) return;
    try {
      await cancel.mutateAsync(gr.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membatalkan.");
    }
  };
  const onDelete = async () => {
    if (!gr) return;
    if (!confirm("Hapus receiving ini? Data akan dihapus dari database.")) return;
    try {
      await remove.mutateAsync(gr.id);
      navigate(LIST_HREF);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus.");
    }
  };
  const onCreateGnr = () => {
    if (!gr) return;
    navigate(`/app/goods-receipts/new?purchaseOrderId=${gr.purchaseOrderId}&receivingId=${gr.id}`);
  };
  const onCreateInspection = () => {
    if (!gr) return;
    navigate(`/app/qc/new?receivingId=${gr.id}`);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (editing) saveEdit();
        else if (isDraft) onSubmit();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [editing, isDraft, form, lines, gr?.id]);

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
        <p className="py-20 text-center text-red-500">Gagal load: {String((fetchError as any)?.message ?? fetchError ?? "unknown")} (id={id})</p>
      </RoleGuard>
    );
  }
  if (!gr) {
    return (
      <RoleGuard roles={[]} menus={[MENU]}>
        <p className="py-20 text-center text-foreground">Receiving tidak ditemukan. (id={id})</p>
      </RoleGuard>
    );
  }

  const rcvNo = (gr as unknown as { documentNo?: string; rcvNo?: string }).documentNo
    ?? (gr as unknown as { rcvNo?: string }).rcvNo
    ?? formatId(gr.id);

  return (
    <RoleGuard roles={[]} menus={[MENU]}>
      <FormPage
        title={rcvNo}
        titleBadge={<DocStatusBadge status={gr.status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X size={14} strokeWidth={2} /> Discard
                </Button>
                <Button variant="primary" size="sm" onClick={saveEdit} disabled={update.isPending}>
                  <Save size={15} strokeWidth={2} /> Save
                </Button>
              </>
            ) : (
              <>
                {isDraft && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil size={14} strokeWidth={2} /> Edit
                  </Button>
                )}
                {isDraft && (
                  <Button variant="primary" size="sm" onClick={onSubmit} disabled={submit.isPending}>
                    Submit
                  </Button>
                )}
                {isPendingQc && (
                  <Button variant="primary" size="sm" onClick={onCreateInspection}>
                    Create Inspection
                  </Button>
                )}
                {isCompleted && (
                  <Button variant="primary" size="sm" onClick={onCreateGnr}>
                    Create GNR
                  </Button>
                )}
                {!isCanceled && !isCompleted && (
                  <DocMenu
                    onCancel={onCancel}
                    onDelete={onDelete}
                    cancelDisabled={cancel.isPending}
                  />
                )}
                {isDraft && (
                  <Button variant="ghost" size="sm" className="hidden" onClick={onPost} disabled>
                    Post (legacy)
                  </Button>
                )}
              </>
            )}
          </div>
        }
      >
        {editing ? (
          <>
            <FormSection>
              <FormGrid>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Document</label>
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">{(() => { const pid = form.purchaseOrderId ?? (gr as any).purchaseOrderId; const p = pos.find((x) => x.id === pid); if (p?.documentNo) return String(p.documentNo); if ((p as any)?.poNo) return String((p as any).poNo); if (pid && /[A-Z]+\//.test(pid)) return pid; return p ? formatId(p.id) : "—"; })()}</div>
              </div>
              <DatePicker label="Posting Date" value={form.receiptDate} onChange={(v) => setForm({ ...form, receiptDate: v })} />
              <div aria-hidden="true" />
              <TimePicker label="Posting Time" value={toTimeStr(gr.createdAt)} onChange={() => {}} disabled />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Supplier Name</label>
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">{supplierIdForGr ? suppliers.find((s) => s.id === supplierIdForGr)?.name ?? "—" : "—"}</div>
              </div>
              <SearchableSelect
                label="Target Warehouse"
                placeholder="Pilih gudang..."
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                value={form.warehouseId}
                onChange={(v) => setForm({ ...form, warehouseId: v })}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </FormGrid>
          </FormSection>
          <FormSection title="Item">
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <Table className="min-w-[800px] table-fixed border border-border border border-border text-left text-[13px]">
                  <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-10 px-3 text-center">No.</TableHead>
                      <TableHead className="min-w-[220px] px-3">Item</TableHead>
                      <TableHead className="w-[90px] px-3 text-right">Qty PO</TableHead>
                      <TableHead className="w-[110px] px-3 text-right">Qty Received</TableHead>
                      <TableHead className="w-[110px] px-3 text-right">Rate</TableHead>
                      <TableHead className="w-[130px] px-3 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-border/70">
                    {lines.map((r, idx) => {
                      const item = items.find((i) => i.id === r.itemId);
                      const poLine = (poDetail as any)?.lines?.[idx] as { qty?: string } | undefined;
                      const qtyPo = poLine?.qty ?? "—";
                      const rate = r.unitPrice ?? "";
                      const amount = Number(r.qty || 0) * Number(rate || 0);
                      return (
                        <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                          <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="px-3 font-medium text-foreground">{item ? `${item.code}: ${item.name}` : r.itemId || "—"}</TableCell>
                          <TableCell className="px-3 text-right tabular-nums text-muted-foreground">{qtyPo !== "—" ? formatNumber(qtyPo) : "0"}</TableCell>
                          <TableCell className="px-3">
                            <TableInput value={r.qty} onChange={(v) => setLines(prev => prev.map((line, i) => (i === idx ? { ...line, qty: v } : line)))} columnTitle="Qty Received" isNumeric />
                          </TableCell>
                          <TableCell className="p-0">
                            <div className="flex items-center justify-between gap-2 px-3">
                              <span className="text-sm font-medium tracking-wide text-muted-foreground">Rp</span>
                              <span className="tabular-nums text-right">{rate ? formatNumber(rate) : "0"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-0">
                            <div className="flex items-center justify-between gap-2 px-3">
                              <span className="text-sm font-medium tracking-wide text-muted-foreground">Rp</span>
                              <span className="tabular-nums text-right font-medium">{formatNumber(amount)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">Hanya Qty Received yang dapat diubah.</div>
            </div>
          </FormSection>
        </>
      ) : (
        <>
          <FormSection>
            <FormGrid>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Document</label>
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">{(() => { const p = pos.find((x) => x.id === gr.purchaseOrderId); if (p?.documentNo) return String(p.documentNo); if ((p as any)?.poNo) return String((p as any).poNo); if (gr.purchaseOrderId && /[A-Z]+\//.test(gr.purchaseOrderId)) return gr.purchaseOrderId; return p ? formatId(p.id) : "—"; })()}</div>
              </div>
              <DatePicker label="Posting Date" value={gr.receiptDate?.slice(0, 10) ?? ""} onChange={() => {}} disabled />
              <div aria-hidden="true" />
              <TimePicker label="Posting Time" value={toTimeStr(gr.createdAt)} onChange={() => {}} disabled />
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Supplier Name</label>
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">{supplierIdForGr ? suppliers.find((s) => s.id === supplierIdForGr)?.name ?? "—" : "—"}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Target Warehouse</label>
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">{warehouses.find((w) => w.id === gr.warehouseId)?.name ?? "—"}</div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                <Textarea value={gr.notes ?? ""} onChange={() => {}} disabled placeholder="—" />
              </div>
              {(gr as any).qcNotes && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium leading-none">QC Notes</label>
                  <Textarea value={(gr as any).qcNotes ?? ""} disabled placeholder="—" />
                </div>
              )}
            </FormGrid>
          </FormSection>
          <FormSection title={`Item ${isCompleted ? "— QC Completed (Qty Accepted / Reject)" : isPendingQc ? "— Pending QC Inspection" : ""}`}>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <Table className={`${isCompleted || isPendingQc ? "min-w-[1100px]" : "min-w-[900px]"} table-fixed text-left text-[13px]`}>
                  <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-10 px-3 text-center">No.</TableHead>
                      <TableHead className="min-w-[200px] px-3">Item</TableHead>
                      <TableHead className="w-[80px] px-3 text-right">Qty PO</TableHead>
                      <TableHead className="w-[95px] px-3 text-right">Qty Received</TableHead>
                      {(isCompleted || isPendingQc) && <TableHead className="w-[95px] px-3 text-right">Qty Accepted</TableHead>}
                      {(isCompleted || isPendingQc) && <TableHead className="w-[95px] px-3 text-right">Qty Reject</TableHead>}
                      <TableHead className="w-[100px] px-3 text-right">Rate</TableHead>
                      <TableHead className="w-[130px] px-3 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-border/70">
                    {lines.map((r: any, idx) => {
                      const item = items.find((i) => i.id === r.itemId);
                      const poLine = (poDetail as any)?.lines?.[idx] as { qty?: string } | undefined;
                      const qtyPo = poLine?.qty ?? "—";
                      const rate = r.unitPrice ?? "";
                      const qtyReceived = Number(r.qty || 0);
                      const qtyRejected = r.qtyRejected != null ? Number(r.qtyRejected) : isCompleted || isPendingQc ? 0 : null;
                      const qtyAccepted = r.qtyAccepted != null ? Number(r.qtyAccepted) : qtyRejected != null ? qtyReceived - qtyRejected : null;
                      const amount = qtyReceived * Number(rate || 0);
                      return (
                        <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                          <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="px-3 font-medium text-foreground">{item ? `${item.code}: ${item.name}` : r.itemId || "—"}</TableCell>
                          <TableCell className="px-3 text-right tabular-nums text-muted-foreground">{qtyPo !== "—" ? formatNumber(qtyPo) : "0"}</TableCell>
                          <TableCell className="px-3 text-right tabular-nums text-foreground">{r.qty ? formatNumber(r.qty) : "0"}</TableCell>
                          {(isCompleted || isPendingQc) && <TableCell className="px-3 text-right font-medium tabular-nums text-emerald-700">{qtyAccepted != null ? formatNumber(qtyAccepted) : "0"}</TableCell>}
                          {(isCompleted || isPendingQc) && <TableCell className="px-3 text-right tabular-nums text-destructive">{qtyRejected != null ? formatNumber(qtyRejected) : "0"}</TableCell>}
                          <TableCell className="p-0">
                            <div className="flex items-center justify-between gap-2 px-3">
                              <span className="text-sm font-medium tracking-wide text-muted-foreground">Rp</span>
                              <span className="tabular-nums text-right">{rate ? formatNumber(rate) : "0"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-0">
                            <div className="flex items-center justify-between gap-2 px-3">
                              <span className="text-sm font-medium tracking-wide text-muted-foreground">Rp</span>
                              <span className="tabular-nums text-right font-medium">{formatNumber(amount)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {isCompleted && <div className="border-t border-border bg-emerald-50/50 px-3 py-2 text-[11px] text-emerald-800">QC Completed — gudang dapat membuat GNR (stock masuk gudang).</div>}
              {isPendingQc && <div className="border-t border-border bg-amber-50/50 px-3 py-2 text-[11px] text-amber-800">Pending for QC Inspection — buat QC Inspection via tombol di atas. Setelah QC Completed baru bisa buat GNR.</div>}
            </div>
          </FormSection>
          {qcHistory.length > 0 && (
            <div>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">QC Inspection History</h2>
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <Table className="min-w-[600px] table-fixed text-left text-[13px]">
                    <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                      <TableRow className="border-border hover:bg-transparent">
                        <TableHead className="w-10 px-3 text-center">No.</TableHead>
                        <TableHead className="px-3">QC No</TableHead>
                        <TableHead className="px-3">Inspection Date</TableHead>
                        <TableHead className="px-3">Status</TableHead>
                        <TableHead className="w-10 px-3"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr]:border-border/70">
                      {qcHistory.map((q: any, idx: number) => (
                        <TableRow key={q.id} className="border-border/70 hover:bg-transparent">
                          <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="px-3 font-medium text-foreground">{q.documentNo ?? formatId(q.id)}</TableCell>
                          <TableCell className="px-3 text-muted-foreground">{q.inspectionDate?.slice(0, 10) ?? "—"}</TableCell>
                          <TableCell className="px-3"><DocStatusBadge status={q.status} /></TableCell>
                          <TableCell className="px-3 text-right"><Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => navigate(`/app/qc/${encodeURIComponent(q.documentNo ?? q.id)}`)}>View</Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </>
          )}
        <FormSection title="Activity Log">
          <ActivityTimeline documentType="RCV" documentId={gr.id} />
        </FormSection>
      </FormPage>
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
