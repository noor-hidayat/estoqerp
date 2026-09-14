import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, Save, Award, FileText, Plus, Trash2, ShoppingCart } from "lucide-react";
import {
  useRfq,
  useAllWarehouses,
  useUoms,
  useItemsList,
  useSuppliers,
  useCompanySettings,
  useUpdateRfq,
  useSendRfq,
  useCancelRfq,
  useCloseRfq,
  useRemoveRfq,
  useCreateQuotation,
  useRfqCompare,
  useAwardRfq,
  useCreatePoFromRfq,
  useSubmitQuotation,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { Input } from "@/components/ui/input";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function SearchableSelectSimple({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : [];
  }, [options, q]);
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <input
        value={open ? q : selected?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => {
          setQ("");
          setOpen(false);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          setOpen(v.trim().length > 0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow">
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              className="w-full px-3 py-2 text-left text-xs hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.value);
                setQ("");
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rfq, isLoading } = useRfq(id);
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: uoms = [] } = useUoms();
  const { data: items = [] } = useItemsList();
  const { data: suppliers = [] } = useSuppliers();
  const { data: company } = useCompanySettings();
  const update = useUpdateRfq();
  const send = useSendRfq();
  const cancel = useCancelRfq();
  const close = useCloseRfq();
  const remove = useRemoveRfq();
  const createQuot = useCreateQuotation();
  const award = useAwardRfq();
  const createPo = useCreatePoFromRfq();
  const submitQuot = useSubmitQuotation();
  const { data: compare } = useRfqCompare(id);

  const [err, setErr] = useState("");
  useErrorToast(err);
  const [editing, setEditing] = useState(false);
  const [showQuotDialog, setShowQuotDialog] = useState<string | null>(null);
  const [quotForm, setQuotForm] = useState<any>({
    quotationNo: "",
    quotationDate: todayISO(),
    validUntil: "",
    currency: "IDR",
    notes: "",
    lines: [] as any[],
  });
  const [activeTab, setActiveTab] = useState<"items" | "quotations" | "compare">("items");

  const isDraft = rfq?.status === "DRAFT";
  const isSent = rfq?.status === "SENT";
  const isQuoted = rfq?.status === "QUOTED";
  const isAwarded = rfq?.status === "AWARDED";
  const canEdit = isDraft && editing;

  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? wid ?? "—";
  const uomName = (uid?: string) => uoms.find((u) => u.id === uid)?.name ?? "—";
  const itemLabel = (iid?: string) => {
    const it = (items as any[]).find((x) => x.id === iid);
    return it ? `${it.code}: ${it.name}` : iid ?? "—";
  };

  useEffect(() => {
    if (rfq && showQuotDialog) {
      const sup = (rfq.suppliers ?? []).find((s) => s.supplierId === showQuotDialog);
      const existingQuot = (rfq.quotations ?? []).find((q) => q.supplierId === showQuotDialog);
      if (existingQuot) {
        setQuotForm({
          quotationNo: existingQuot.quotationNo ?? "",
          quotationDate: existingQuot.quotationDate?.slice(0, 10) ?? todayISO(),
          validUntil: existingQuot.validUntil?.slice(0, 10) ?? "",
          currency: existingQuot.currency ?? rfq.currency ?? "IDR",
          notes: existingQuot.notes ?? "",
          deliveryLeadTime: (existingQuot as any).deliveryLeadTime ?? "",
          paymentTerm: (existingQuot as any).paymentTerm ?? "",
          lines: (existingQuot.lines ?? []).map((l: any) => ({
            itemId: l.itemId,
            uomId: l.uomId,
            qty: l.qty,
            unitPrice: l.unitPrice ?? "",
            discount: l.discount ?? "0",
            note: l.note ?? "",
          })),
        });
      } else {
        setQuotForm({
          quotationNo: "",
          quotationDate: todayISO(),
          validUntil: "",
          currency: rfq.currency ?? "IDR",
          notes: "",
          deliveryLeadTime: "",
          paymentTerm: "",
          lines: (rfq.lines ?? []).map((l) => ({
            itemId: l.itemId,
            uomId: l.uomId,
            qty: l.qty,
            unitPrice: "",
            discount: "0",
            note: "",
          })),
        });
      }
    }
  }, [showQuotDialog, rfq]);

  const [editForm, setEditForm] = useState<any>(null);
  const [editLines, setEditLines] = useState<any[]>([]);
  const [editSuppliers, setEditSuppliers] = useState<string[]>([]);

  useEffect(() => {
    if (rfq && editing) {
      setEditForm({
        warehouseId: rfq.warehouseId,
        requestDate: rfq.requestDate?.slice(0, 10) ?? todayISO(),
        quotationDeadline: rfq.quotationDeadline?.slice(0, 10) ?? "",
        expectedDate: rfq.expectedDate?.slice(0, 10) ?? "",
        notes: rfq.notes ?? "",
        currency: rfq.currency ?? "IDR",
      });
      setEditLines(rfq.lines ?? []);
      setEditSuppliers((rfq.suppliers ?? []).map((s) => s.supplierId));
    }
  }, [rfq, editing]);

  const handleSaveEdit = async () => {
    try {
      const validLines = editLines.filter((l: any) => l.itemId && l.uomId && l.qty);
      if (validLines.length === 0) return setErr("Minimal 1 line");
      await update.mutateAsync({
        id: rfq!.id,
        patch: {
          warehouseId: editForm.warehouseId,
          requestDate: editForm.requestDate,
          quotationDeadline: editForm.quotationDeadline || null,
          expectedDate: editForm.expectedDate || null,
          notes: editForm.notes || null,
          currency: editForm.currency,
          lines: validLines.map((l: any) => ({ itemId: l.itemId, uomId: l.uomId, qty: l.qty, note: l.note ?? null })),
          supplierIds: editSuppliers,
        },
      });
      setEditing(false);
      toast.success("RFQ updated");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed update");
    }
  };

  const handleSend = async () => {
    if (!confirm("Kirim RFQ ke supplier? (status jadi SENT, bisa Print)")) return;
    try {
      await send.mutateAsync(rfq!.id);
      toast.success("RFQ sent");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed send");
    }
  };
  const handleCancel = async () => {
    if (!confirm("Cancel RFQ?")) return;
    try {
      await cancel.mutateAsync(rfq!.id);
      toast.success("RFQ canceled");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed cancel");
    }
  };
  const handleClose = async () => {
    if (!confirm("Close RFQ?")) return;
    try {
      await close.mutateAsync(rfq!.id);
      toast.success("RFQ closed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed close");
    }
  };
  const handleDelete = async () => {
    if (!confirm("Delete RFQ?")) return;
    try {
      await remove.mutateAsync(rfq!.id);
      navigate("/app/rfq");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed delete");
    }
  };
  const handleSaveQuotation = async (submitAfter = false) => {
    const supId = showQuotDialog!;
    const validLines = quotForm.lines.filter((l: any) => l.itemId);
    if (validLines.length === 0) return setErr("Minimal 1 line");
    try {
      await createQuot.mutateAsync({
        rfqId: rfq!.id,
        body: {
          supplierId: supId,
          quotationNo: quotForm.quotationNo || null,
          quotationDate: quotForm.quotationDate,
          validUntil: quotForm.validUntil || null,
          currency: quotForm.currency || rfq!.currency,
          notes: quotForm.notes || null,
          deliveryLeadTime: quotForm.deliveryLeadTime || null,
          paymentTerm: quotForm.paymentTerm || null,
          lines: validLines.map((l: any) => ({
            itemId: l.itemId,
            uomId: l.uomId,
            qty: l.qty,
            unitPrice: l.unitPrice || null,
            discount: l.discount || "0",
            note: l.note || null,
          })),
          status: submitAfter ? "SUBMITTED" : "DRAFT",
        },
      });
      if (submitAfter) {
        // find quotation id to submit? Already submitted via status
        toast.success("Quotation submitted");
      } else toast.success("Quotation saved");
      setShowQuotDialog(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed save quotation");
    }
  };
  const handleAward = async (supplierId: string) => {
    if (!confirm(`Award ke supplier ini?`)) return;
    try {
      await award.mutateAsync({ id: rfq!.id, supplierId });
      toast.success("RFQ awarded");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed award");
    }
  };
  const handleCreatePO = async () => {
    if (!confirm("Buat PO dari pemenang?")) return;
    try {
      const res = await createPo.mutateAsync(rfq!.id);
      toast.success(`PO created: ${(res as any).documentNo}`);
      navigate(`/app/purchase-orders/${(res as any).id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed create PO");
    }
  };

  if (isLoading) return <div className="py-20 text-center">Loading...</div>;
  if (!rfq) return <div className="py-20 text-center">RFQ not found</div>;

  const canPrint = ["SENT", "QUOTED", "AWARDED", "CLOSED"].includes(rfq.status);
  const cheapestOverall = (compare as any)?.cheapestOverall as string | null;

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
      <div className="print:hidden">
        <FormPage
          title={`${rfq.documentNo ?? rfq.id}`}
          titleBadge={<DocStatusBadge status={rfq.status} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {canPrint && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.print()}>
                  <Printer size={16} />
                </Button>
              )}
              {isDraft && !editing && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              )}
              {isDraft && editing && (
                <>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveEdit} disabled={update.isPending}>
                    <Save size={15} /> Save
                  </Button>
                </>
              )}
              {isDraft && !editing && (
                <Button size="sm" className="h-7 text-xs" onClick={handleSend} disabled={send.isPending}>
                  Send
                </Button>
              )}
              {!isDraft && rfq.status !== "CANCELED" && rfq.status !== "CLOSED" && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleCancel}>
                  Cancel
                </Button>
              )}
              {rfq.status !== "CLOSED" && rfq.status !== "CANCELED" && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClose}>
                  Close
                </Button>
              )}
              {(isDraft || rfq.status === "CANCELED") && (
                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDelete}>
                  Delete
                </Button>
              )}
              {isAwarded && (
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleCreatePO} disabled={createPo.isPending}>
                  <ShoppingCart size={14} /> Create PO
                </Button>
              )}
            </div>
          }
        >
          <FormSection>
            {!editing ? (
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">PR Reference</label>
                  <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.purchaseRequestNo ?? rfq.purchaseRequestId ?? "—"}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Warehouse</label>
                  <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{warehouseName(rfq.warehouseId)}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Posting Date</label>
                  <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.requestDate?.slice(0, 10)}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Quotation Deadline</label>
                  <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.quotationDeadline?.slice(0, 10) ?? "—"}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Expected Delivery</label>
                  <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.expectedDate?.slice(0, 10) ?? "—"}</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Currency</label>
                  <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.currency}</div>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <div className="mt-1 rounded-md border bg-zinc-100 p-3 text-sm whitespace-pre-wrap">{rfq.notes ?? "—"}</div>
                </div>
                {rfq.awardedSupplierId && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Awarded Supplier</label>
                    <div className="flex h-8 items-center rounded-md border bg-amber-50 px-3 text-sm font-medium">{rfq.awardedSupplierName ?? rfq.awardedSupplierId}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Warehouse</label>
                  <Select value={editForm.warehouseId} onChange={(e) => setEditForm({ ...editForm, warehouseId: e.target.value })} className="h-8">
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <DatePicker label="Posting Date" value={editForm.requestDate} onChange={(v) => setEditForm({ ...editForm, requestDate: v })} />
                <DatePicker label="Quotation Deadline" value={editForm.quotationDeadline} onChange={(v) => setEditForm({ ...editForm, quotationDeadline: v })} />
                <DatePicker label="Expected Delivery" value={editForm.expectedDate} onChange={(v) => setEditForm({ ...editForm, expectedDate: v })} />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Currency</label>
                  <Select value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })} className="h-8">
                    <option value="IDR">IDR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="SGD">SGD</option>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Notes</label>
                  <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-sm font-medium">Suppliers</label>
                  <div className="rounded border p-3">
                    {(suppliers as any[]).map((s) => (
                      <label key={s.id} className="flex items-center gap-2 py-1 text-sm">
                        <input type="checkbox" checked={editSuppliers.includes(s.id)} onChange={(e) => setEditSuppliers((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))} />
                        {s.code}: {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </FormSection>

          <div className="flex gap-2 border-b">
            <button className={cn("px-4 py-2 text-sm", activeTab === "items" ? "border-b-2 border-black font-semibold" : "text-muted-foreground")} onClick={() => setActiveTab("items")}>
              Items
            </button>
            <button className={cn("px-4 py-2 text-sm", activeTab === "quotations" ? "border-b-2 border-black font-semibold" : "text-muted-foreground")} onClick={() => setActiveTab("quotations")}>
              Quotations ({rfq.quotations?.length ?? 0})
            </button>
            <button className={cn("px-4 py-2 text-sm", activeTab === "compare" ? "border-b-2 border-black font-semibold" : "text-muted-foreground")} onClick={() => setActiveTab("compare")}>
              Compare
            </button>
          </div>

          {activeTab === "items" && (
            <FormSection title="Items">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-zinc-100">
                    <TableRow>
                      <TableHead className="w-10 text-center">No</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="w-24">UOM</TableHead>
                      <TableHead className="w-28 text-right">Qty</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(canEdit ? editLines : rfq.lines ?? []).map((l: any, idx: number) => (
                      <TableRow key={idx}>
                        <TableCell className="text-center">{idx + 1}</TableCell>
                        <TableCell>{itemLabel(l.itemId)}</TableCell>
                        <TableCell>{uomName(l.uomId)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {canEdit ? <TableInput value={l.qty} onChange={(v) => setEditLines((prev) => prev.map((r, i) => (i === idx ? { ...r, qty: v } : r)))} isNumeric /> : formatNumber(l.qty)}
                        </TableCell>
                        <TableCell>{canEdit ? <TableInput value={l.note ?? ""} onChange={(v) => setEditLines((prev) => prev.map((r, i) => (i === idx ? { ...r, note: v } : r)))} /> : l.note ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {canEdit && (
                  <div className="border-t p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setEditLines((prev) => [...prev, { itemId: "", uomId: "", qty: "", note: "" }])}
                    >
                      <Plus size={14} /> Add Item
                    </Button>
                  </div>
                )}
              </div>
              {!canEdit && (
                <div className="mt-4 rounded-lg border p-3">
                  <div className="text-sm font-medium">Invited Suppliers</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(rfq.suppliers ?? []).map((s) => (
                      <Badge key={s.id} variant="secondary">
                        {s.supplierName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </FormSection>
          )}

          {activeTab === "quotations" && (
            <FormSection title="Quotations">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-zinc-100">
                    <TableRow>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Quotation No</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rfq.suppliers ?? []).map((s) => {
                      const q = (rfq.quotations ?? []).find((qq) => qq.supplierId === s.supplierId);
                      return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.supplierName}</TableCell>
                          <TableCell>{q?.quotationNo ?? "—"}</TableCell>
                          <TableCell>{q?.quotationDate?.slice(0, 10) ?? "—"}</TableCell>
                          <TableCell>{q?.validUntil?.slice(0, 10) ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{q ? `Rp ${formatNumber(q.totalAmount)}` : "—"}</TableCell>
                          <TableCell>{q ? <Badge>{q.status}</Badge> : <Badge variant="outline">Not quoted</Badge>}</TableCell>
                          <TableCell>
                            <Button size="sm" className="h-7 text-xs" onClick={() => setShowQuotDialog(s.supplierId)} disabled={rfq.status === "CANCELED" || rfq.status === "CLOSED"}>
                              {q ? "Edit" : "Record"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {showQuotDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                  <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white p-6 shadow-lg dark:bg-zinc-900">
                    <h3 className="text-sm font-semibold">Record Quotation - {(suppliers as any[]).find((x) => x.id === showQuotDialog)?.name}</h3>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <Input label="Quotation No" value={quotForm.quotationNo} onChange={(e) => setQuotForm({ ...quotForm, quotationNo: e.target.value })} placeholder="QT-SUP/001" />
                      <DatePicker label="Quotation Date" value={quotForm.quotationDate} onChange={(v) => setQuotForm({ ...quotForm, quotationDate: v })} />
                      <DatePicker label="Valid Until" value={quotForm.validUntil} onChange={(v) => setQuotForm({ ...quotForm, validUntil: v })} />
                      <Select label="Currency" value={quotForm.currency} onChange={(e) => setQuotForm({ ...quotForm, currency: e.target.value })} className="h-8">
                        <option value="IDR">IDR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </Select>
                      <Input label="Delivery Lead Time" value={quotForm.deliveryLeadTime} onChange={(e) => setQuotForm({ ...quotForm, deliveryLeadTime: e.target.value })} placeholder="3 days" />
                      <Input label="Payment Term" value={quotForm.paymentTerm} onChange={(e) => setQuotForm({ ...quotForm, paymentTerm: e.target.value })} placeholder="NET 30" />
                      <div className="sm:col-span-2">
                        <label className="text-sm font-medium">Notes</label>
                        <Textarea value={quotForm.notes} onChange={(e) => setQuotForm({ ...quotForm, notes: e.target.value })} />
                      </div>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader className="bg-zinc-100">
                          <TableRow>
                            <TableHead>No</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead className="w-32 text-right">Unit Price</TableHead>
                            <TableHead className="w-28 text-right">Discount</TableHead>
                            <TableHead className="w-32 text-right">Subtotal</TableHead>
                            <TableHead>Note</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {quotForm.lines.map((l: any, idx: number) => {
                            const subtotal = l.unitPrice ? Number(l.qty || 0) * Number(l.unitPrice || 0) - Number(l.discount || 0) : 0;
                            return (
                              <TableRow key={idx}>
                                <TableCell className="text-center">{idx + 1}</TableCell>
                                <TableCell className="text-xs">{itemLabel(l.itemId)}</TableCell>
                                <TableCell className="text-center">{l.qty}</TableCell>
                                <TableCell className="p-0">
                                  <TableInput value={l.unitPrice} onChange={(v) => setQuotForm({ ...quotForm, lines: quotForm.lines.map((x: any, i: number) => (i === idx ? { ...x, unitPrice: v } : x)) })} isNumeric />
                                </TableCell>
                                <TableCell className="p-0">
                                  <TableInput value={l.discount} onChange={(v) => setQuotForm({ ...quotForm, lines: quotForm.lines.map((x: any, i: number) => (i === idx ? { ...x, discount: v } : x)) })} isNumeric />
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{subtotal ? `Rp ${formatNumber(subtotal)}` : "—"}</TableCell>
                                <TableCell className="p-0">
                                  <TableInput value={l.note} onChange={(v) => setQuotForm({ ...quotForm, lines: quotForm.lines.map((x: any, i: number) => (i === idx ? { ...x, note: v } : x)) })} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowQuotDialog(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => handleSaveQuotation(false)} disabled={createQuot.isPending}>
                        Save Draft
                      </Button>
                      <Button size="sm" className="bg-black text-white" onClick={() => handleSaveQuotation(true)} disabled={createQuot.isPending}>
                        Save & Submit
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </FormSection>
          )}

          {activeTab === "compare" && (
            <FormSection title="Compare">
              {!compare ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading compare...</div>
              ) : (compare as any).lines?.length === 0 ? (
                <div className="py-10 text-center text-sm">No data</div>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader className="bg-zinc-100">
                        <TableRow>
                          <TableHead className="w-10 text-center">No</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead className="w-20 text-right">Qty</TableHead>
                          {(compare as any).totals?.map((t: any) => (
                            <TableHead key={t.supplierId} className="text-right min-w-[140px]">
                              <div className={cn("font-semibold", cheapestOverall === t.supplierId && "text-green-600")}>{t.supplierName}</div>
                              <div className="text-xs font-normal">Total Rp {formatNumber(t.total)}</div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(compare as any).lines.map((l: any, idx: number) => (
                          <TableRow key={idx}>
                            <TableCell className="text-center">{idx + 1}</TableCell>
                            <TableCell className="text-xs">
                              <div className="font-medium">{l.itemName}</div>
                              <div className="text-muted-foreground">{l.itemCode}</div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(l.qty)}</TableCell>
                            {l.perSupplier.map((ps: any) => {
                              const isCheapest = l.cheapestSupplierId === ps.supplierId;
                              return (
                                <TableCell key={ps.supplierId} className={cn("text-right tabular-nums", isCheapest && "bg-green-50 font-semibold")}>
                                  {ps.unitPrice ? (
                                    <div>
                                      <div>Rp {formatNumber(ps.unitPrice)}</div>
                                      <div className="text-xs text-muted-foreground">Sub: Rp {formatNumber(ps.subtotal ?? 0)}</div>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                        <TableRow className="bg-zinc-50 font-semibold">
                          <TableCell colSpan={3} className="text-right">
                            Grand Total
                          </TableCell>
                          {(compare as any).totals?.map((t: any) => (
                            <TableCell key={t.supplierId} className={cn("text-right", cheapestOverall === t.supplierId && "bg-green-100 text-green-700")}>
                              Rp {formatNumber(t.total)}
                            </TableCell>
                          ))}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(compare as any).ranking?.map((r: any) => (
                      <div key={r.supplierId} className={cn("rounded border px-3 py-2 text-xs", r.rank === 1 && "border-green-300 bg-green-50")}>
                        <span className="font-semibold">
                          #{r.rank} {r.supplierName}
                        </span>{" "}
                        — Rp {formatNumber(r.total)}
                        {rfq.status !== "AWARDED" && rfq.status !== "CLOSED" && rfq.status !== "CANCELED" && (
                          <Button size="sm" className="ml-2 h-6 text-xs" onClick={() => handleAward(r.supplierId)} disabled={award.isPending}>
                            <Award size={12} /> Award
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Highlight hijau = termurah per item & total. Purchasing bebas pilih pemenang bukan termurah.</p>
                </>
              )}
            </FormSection>
          )}
        </FormPage>
      </div>

      <style>{`@media print { @page { size: A4; margin: 0; } html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body * { visibility: hidden; } .print-doc, .print-doc * { visibility: visible; } .print-doc { position: absolute; left: 0; top: 0; width: 100%; height: auto; } header, nav, aside { display: none !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } }`}</style>
      <div className="hidden print:block print-doc bg-white text-black print:absolute print:inset-0 print:p-0">
        {(rfq.suppliers ?? []).length === 0 ? (
          <div className="mx-auto w-[190mm] p-[10mm]">No supplier to print</div>
        ) : (
          (rfq.suppliers ?? []).map((sup) => (
            <div key={sup.id} className="mx-auto w-[190mm] max-w-[190mm] bg-white p-[10mm] text-black break-after-page last:break-after-auto">
              <div className="flex items-start justify-between gap-6 border-b border-zinc-900 pb-3">
                <div className="flex items-start gap-3">
                  {(company as any)?.logo ? (
                    <img src={(company as any).logo} alt="Logo" className="h-10 w-10 object-contain" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center border border-black text-[10px] font-bold">LOGO</div>
                  )}
                  <div className="leading-tight">
                    <div className="text-[15px] font-bold tracking-tight">{(company as any)?.companyName ?? "PT CONTOH"}</div>
                    <div className="mt-0.5 max-w-[360px] whitespace-pre-wrap break-words text-[10px] leading-snug text-zinc-600">{(company as any)?.address ?? "-"}</div>
                    <div className="mt-1 text-[10px] text-zinc-600">{(company as any)?.phone ?? ""} · {(company as any)?.email ?? ""}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-bold tracking-[0.15em]">REQUEST FOR QUOTATION</div>
                  <div className="text-[10px] text-zinc-600">{rfq.documentNo}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-24 text-zinc-600">No. RFQ</span>
                    <span>{rfq.documentNo}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-zinc-600">Request Date</span>
                    <span>{rfq.requestDate?.slice(0, 10)}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-zinc-600">Deadline</span>
                    <span>{rfq.quotationDeadline?.slice(0, 10) ?? "-"}</span>
                  </div>
                  {rfq.purchaseRequestNo && (
                    <div className="flex">
                      <span className="w-24 text-zinc-600">PR Ref</span>
                      <span>{rfq.purchaseRequestNo}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <div className="flex">
                    <span className="w-24 text-zinc-600">Currency</span>
                    <span>{rfq.currency}</span>
                  </div>
                  <div className="flex">
                    <span className="w-24 text-zinc-600">Expected Delivery</span>
                    <span>{rfq.expectedDate?.slice(0, 10) ?? "-"}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 border-t border-zinc-200 pt-4 text-[11px]">
                <div className="text-[10px] font-semibold uppercase tracking-wide">TO</div>
                <div className="mt-2 font-medium">{sup.supplierName}</div>
                <div className="mt-1 text-zinc-600">Mohon penawaran harga untuk item berikut:</div>
              </div>
              <table className="mt-4 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-y bg-zinc-50">
                    <th className="px-2 py-2 text-center font-medium w-8">No</th>
                    <th className="px-2 py-2 text-left font-medium">Item Name</th>
                    <th className="px-2 py-2 text-center font-medium w-16">Qty</th>
                    <th className="px-2 py-2 text-center font-medium w-16">UOM</th>
                    <th className="px-2 py-2 text-left font-medium">Note</th>
                  </tr>
                </thead>
                <tbody className="text-[10px]">
                  {(rfq.lines ?? []).map((l: any, idx: number) => (
                    <tr key={idx}>
                      <td className="px-2 py-2 text-center">{idx + 1}</td>
                      <td className="px-2 py-2">{itemLabel(l.itemId)}</td>
                      <td className="px-2 py-2 text-center">{formatNumber(l.qty)}</td>
                      <td className="px-2 py-2 text-center">{uomName(l.uomId)}</td>
                      <td className="px-2 py-2">{l.note ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-[11px]">Notes: {rfq.notes ?? "-"}</div>
              <div className="mt-10 grid grid-cols-2 gap-8 text-center text-[11px]">
                <div>
                  <div className="font-semibold">Prepared By</div>
                  <div className="mt-12 h-px bg-zinc-900 w-[180px] mx-auto" />
                  <div className="mt-2">Purchasing</div>
                </div>
                <div>
                  <div className="font-semibold">Supplier</div>
                  <div className="mt-12 h-px bg-zinc-900 w-[180px] mx-auto" />
                  <div className="mt-2">{sup.supplierName}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </RoleGuard>
  );
}
