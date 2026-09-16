import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, Save, Award, ShoppingCart, Plus, Trash2 } from "lucide-react";
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
import { DocMenu } from "@/components/ui/doc-menu";
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { DatePicker } from "@/components/ui/date-picker";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect as TableSearchableSelect } from "@/components/ui/searchable-select";
import { OrderLineTable, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatNumber } from "@/lib/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

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
    tax: "",
    lines: [] as any[],
  });
  const [activeTab, setActiveTab] = useState<"items" | "quotations" | "compare">("items");
  const [selectedQuotRows, setSelectedQuotRows] = useState<Set<number>>(new Set());
  const [selectedCompareRows, setSelectedCompareRows] = useState<Set<number>>(new Set());
  const [selectedInvitedRows, setSelectedInvitedRows] = useState<Set<number>>(new Set());
  const [selectedCompareSupplier, setSelectedCompareSupplier] = useState<string | null>(null);
  useEffect(() => {
    if (rfq?.awardedSupplierId && !selectedCompareSupplier) {
      setSelectedCompareSupplier(rfq.awardedSupplierId);
    }
  }, [rfq?.awardedSupplierId]);

  const isDraft = rfq?.status === "DRAFT";
  const isSent = rfq?.status === "SENT";
  const isQuoted = rfq?.status === "QUOTED" || rfq?.status === "QUOTATION_RECEIVED";
  const isQuotationReceived = rfq?.status === "QUOTATION_RECEIVED" || rfq?.status === "QUOTED";
  const isEvaluation = rfq?.status === "EVALUATION";
  const isAwarded = rfq?.status === "AWARDED";
  const isPoCreated = rfq?.status === "PO_CREATED" || rfq?.status === "CLOSED";
  const canEdit = isDraft && editing;

  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? wid ?? "";
  const uomName = (uid?: string) => uoms.find((u) => u.id === uid)?.name ?? "";
  const itemLabel = (iid?: string) => {
    const it = (items as any[]).find((x) => x.id === iid);
    return it ? `${it.code}: ${it.name}` : iid ?? "";
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
          tax: (existingQuot as any).tax ?? "",
          lines: (existingQuot.lines ?? []).map((l: any) => {
            const qty = Number(l.qty || 0);
            const price = l.unitPrice ? Number(l.unitPrice) : 0;
            const discAmt = l.discount ? Number(l.discount) : 0;
            const discPct = price && qty ? (discAmt / (qty * price)) * 100 : 0;
            return {
              itemId: l.itemId,
              uomId: l.uomId,
              qty: l.qty,
              unitPrice: l.unitPrice ?? "",
              discount: discPct ? String(Number(discPct.toFixed(2))) : "0",
            };
          }),
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
          tax: "",
          lines: (rfq.lines ?? []).map((l) => ({
            itemId: l.itemId,
            uomId: l.uomId,
            qty: l.qty,
            unitPrice: "",
            discount: "0",
          })),
        });
      }
    }
  }, [showQuotDialog, rfq]);

  const [editForm, setEditForm] = useState<any>(null);
  const [editLines, setEditLines] = useState<OrderLineInput[]>([]);
  // Supplier rows: same UX as Items table — default 1 empty row, typeable inside table cell
  const [editSupplierRows, setEditSupplierRows] = useState<string[]>([""]);
  const [editSelectedSupplierRows, setEditSelectedSupplierRows] = useState<Set<number>>(new Set());

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
      setEditLines(
        (rfq.lines ?? []).map((l: any) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: String(l.qty ?? ""),
          unitPrice: (l as any).unitPrice ?? "",
          discount: (l as any).discount ?? "",
          batchNumber: (l as any).batchNumber ?? "",
          note: l.note ?? "",
          deliveryDate: (l as any).deliveryDate ?? "",
        }))
      );
      const supIds = (rfq.suppliers ?? []).map((s: any) => s.supplierId);
      setEditSupplierRows(supIds.length ? supIds : [""]);
      setEditSelectedSupplierRows(new Set());
    }
  }, [rfq, editing]);

  const handleSaveEdit = async () => {
    try {
      const validLines = (editLines as any[]).filter((l: any) => l.itemId && l.qty);
      if (validLines.length === 0) return setErr("Minimal 1 line");
      const validSuppliers = editSupplierRows.map((s) => String(s).trim()).filter(Boolean);
      const uniqueSuppliers = [...new Set(validSuppliers)];
      if (validSuppliers.length === 0) return setErr("Pilih minimal 1 supplier.");
      if (uniqueSuppliers.length !== validSuppliers.length) return setErr("Supplier duplikat tidak diizinkan.");
      await update.mutateAsync({
        id: rfq!.id,
        patch: {
          warehouseId: editForm.warehouseId,
          requestDate: editForm.requestDate,
          quotationDeadline: editForm.quotationDeadline || null,
          expectedDate: editForm.expectedDate || null,
          notes: editForm.notes || null,
          currency: editForm.currency,
          lines: validLines.map((l: any) => ({ itemId: l.itemId, uomId: l.uomId, qty: l.qty, specification: (l as any).specification ?? null, note: l.note ?? null })),
          supplierIds: uniqueSuppliers,
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
          quotationNo: null,
          quotationDate: quotForm.quotationDate,
          validUntil: quotForm.validUntil || null,
          currency: quotForm.currency || rfq!.currency,
          notes: quotForm.notes || null,
          deliveryLeadTime: quotForm.deliveryLeadTime || null,
          paymentTerm: quotForm.paymentTerm || null,
          lines: validLines.map((l: any) => {
            const qty = Number(l.qty || 0);
            const price = l.unitPrice ? Number(l.unitPrice) : 0;
            const discPct = l.discount ? Number(l.discount) : 0;
            const discountAmt = price ? qty * price * discPct / 100 : 0;
            return {
              itemId: l.itemId,
              uomId: l.uomId,
              qty: l.qty,
              unitPrice: l.unitPrice || null,
              discount: String(discountAmt),
              note: null,
            };
          }),
          tax: (quotForm as any).tax || "0",
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

  const canPrint = ["SENT", "QUOTED", "QUOTATION_RECEIVED", "EVALUATION", "AWARDED", "PO_CREATED", "CLOSED"].includes(rfq.status);
  const cheapestOverall = (compare as any)?.cheapestOverall as string | null;

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
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
              <DocMenu
                onCancel={handleCancel}
                onDelete={handleDelete}
                cancelDisabled={rfq.status === "CANCELED" || rfq.status === "CLOSED" || rfq.status === "PO_CREATED"}
                deleteDisabled={!(isDraft || rfq.status === "CANCELED")}
              />
            </div>
          }
        >
          <FormSection>
            {!editing ? (
              <>
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">PR Reference</label>
                    <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.purchaseRequestNo ?? rfq.purchaseRequestId ?? ""}</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Posting Date</label>
                    <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.requestDate?.slice(0, 10)}</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Expected Delivery</label>
                    <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.expectedDate?.slice(0, 10) ?? ""}</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Quotation Deadline</label>
                    <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.quotationDeadline?.slice(0, 10) ?? ""}</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Currency</label>
                    <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{rfq.currency}</div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Warehouse</label>
                    <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{warehouseName(rfq.warehouseId)}</div>
                  </div>
                </div>
                <div className="mt-6">
                  <label className="mb-1.5 block text-sm font-medium">Notes</label>
                  <div className="min-h-[80px] w-full rounded-md border bg-zinc-100 px-3 py-2 text-sm whitespace-pre-wrap">{rfq.notes ?? ""}</div>
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  <DatePicker label="Posting Date" value={editForm.requestDate} onChange={(v) => setEditForm({ ...editForm, requestDate: v })} />
                  <DatePicker label="Expected Delivery" value={editForm.expectedDate} onChange={(v) => setEditForm({ ...editForm, expectedDate: v })} />
                  <DatePicker label="Quotation Deadline" value={editForm.quotationDeadline} onChange={(v) => setEditForm({ ...editForm, quotationDeadline: v })} />
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium">Currency</label>
                    <Select value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })} className="h-8">
                      <option value="IDR">IDR</option>
                      <option value="USD">USD</option>
                      <option value="EUR">EUR</option>
                      <option value="SGD">SGD</option>
                    </Select>
                  </div>
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
                </div>
              <div className="mt-6">
                <label className="mb-1.5 block text-sm font-medium">Notes</label>
                <Textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </div>
              <div className="mt-6">
                <label className="text-sm font-medium">Suppliers (min 1)</label>
                  {(() => {
                    const supplierOptions = (suppliers as any[])
                      .filter((s: any) => s.isActive !== false)
                      .map((s: any) => ({
                        value: s.id,
                        label: s.code ? `${s.code} — ${s.name}` : s.name,
                      }));
                    const allCheckedEdit = editSupplierRows.length > 0 && editSelectedSupplierRows.size === editSupplierRows.length;
                    const someCheckedEdit = editSelectedSupplierRows.size > 0 && editSelectedSupplierRows.size < editSupplierRows.length;
                    return (
                      <div className="overflow-hidden rounded-lg border border-border">
                        <Table className="table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th]:last:border-r-0 [&_td]:last:border-r-0">
                          <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                            <TableRow className="border-border hover:bg-transparent">
                              <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">
                                <Checkbox
                                  checked={allCheckedEdit ? true : someCheckedEdit ? "indeterminate" : false}
                                  onCheckedChange={(v) => {
                                    if (v) setEditSelectedSupplierRows(new Set(editSupplierRows.map((_, i) => i)));
                                    else setEditSelectedSupplierRows(new Set());
                                  }}
                                  aria-label="select all suppliers"
                                />
                              </TableHead>
                              <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">No</TableHead>
                              <TableHead className="px-3">Supplier</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody className="[&_tr]:border-border/70">
                            {editSupplierRows.map((sid, idx) => {
                              const rowOptions = supplierOptions.filter((o) => !editSupplierRows.includes(o.value) || o.value === sid);
                              return (
                                <TableRow key={idx} className="border-border/70 hover:bg-transparent data-[state=selected]:bg-muted" data-state={editSelectedSupplierRows.has(idx) ? "selected" : undefined}>
                                  <TableCell className="px-2 text-center">
                                    <Checkbox
                                      checked={editSelectedSupplierRows.has(idx)}
                                      onCheckedChange={(v) => {
                                        const next = new Set(editSelectedSupplierRows);
                                        if (v) next.add(idx);
                                        else next.delete(idx);
                                        setEditSelectedSupplierRows(next);
                                      }}
                                      aria-label={`select supplier row ${idx + 1}`}
                                    />
                                  </TableCell>
                                  <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                                  <TableCell className="p-0">
                                    <TableSearchableSelect table value={sid} onChange={(v) => setEditSupplierRows((prev) => prev.map((val, i) => (i === idx ? v : val)))} options={rowOptions} placeholder="Select Supplier" columnTitle="Supplier" />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        <div className="border-t border-border p-3">
                          {editSelectedSupplierRows.size > 0 ? (
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-7 gap-1 px-2.5 text-xs"
                              onClick={() => {
                                const next = editSupplierRows.filter((_, i) => !editSelectedSupplierRows.has(i));
                                setEditSupplierRows(next.length ? next : [""]);
                                setEditSelectedSupplierRows(new Set());
                              }}
                            >
                              <Trash2 size={13} strokeWidth={2} /> Delete
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => setEditSupplierRows((prev) => [...prev, ""])}>
                              <Plus size={13} strokeWidth={2} /> Add Row
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <p className="mt-1.5 text-xs text-muted-foreground">Ketik di kolom Supplier untuk mencari — sama seperti kolom Item.</p>
                </div>
              </>
            )}
          </FormSection>

          <div className="flex gap-2 border-b mb-6">
            <button className={cn("px-4 py-2 text-sm", activeTab === "items" ? "border-b-2 border-black font-semibold" : "text-muted-foreground")} onClick={() => setActiveTab("items")}>
              Detail
            </button>
            <button className={cn("px-4 py-2 text-sm", activeTab === "quotations" ? "border-b-2 border-black font-semibold" : "text-muted-foreground")} onClick={() => setActiveTab("quotations")}>
              Quotations ({rfq.quotations?.length ?? 0})
            </button>
            <button className={cn("px-4 py-2 text-sm", activeTab === "compare" ? "border-b-2 border-black font-semibold" : "text-muted-foreground")} onClick={() => setActiveTab("compare")}>
              Compare
            </button>
          </div>

          {activeTab === "items" && (
            <FormSection>
              <div className="mb-3">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Items</h3>
              </div>
              <OrderLineTable
                value={
                  canEdit
                    ? editLines
                    : (rfq.lines ?? []).map((l: any) => ({
                        itemId: l.itemId,
                        uomId: l.uomId,
                        qty: String(l.qty ?? ""),
                        unitPrice: (l as any).unitPrice ?? "",
                        discount: (l as any).discount ?? "",
                        batchNumber: (l as any).batchNumber ?? "",
                        note: l.note ?? "",
                        deliveryDate: (l as any).deliveryDate ?? "",
                      }))
                }
                onChange={canEdit ? setEditLines : () => {}}
                readOnly={!canEdit}
                currency={(canEdit ? editForm?.currency : rfq.currency) ?? "IDR"}
                baseCurrency={(company as any)?.baseCurrency ?? "IDR"}
                variant="rfq"
              />
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Input
                  label="Total Quantity"
                  value={formatNumber(
                    (canEdit ? editLines : (rfq.lines ?? [])).reduce((s: number, l: any) => s + Number(l.qty || 0), 0)
                  )}
                  disabled
                  className="h-8 bg-zinc-100 text-sm"
                />
              </div>
              {!canEdit && (
                <div className="mt-6">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">Supplier</h3>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    <Table className="table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th]:last:border-r-0 [&_td]:last:border-r-0">
                      <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">
                            <Checkbox
                              checked={selectedInvitedRows.size === (rfq.suppliers?.length ?? 0) && (rfq.suppliers?.length ?? 0) > 0}
                              onCheckedChange={(v) => {
                                if (v) setSelectedInvitedRows(new Set((rfq.suppliers ?? []).map((_, i) => i)));
                                else setSelectedInvitedRows(new Set());
                              }}
                              aria-label="select all invited"
                            />
                          </TableHead>
                          <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">No</TableHead>
                          <TableHead className="px-3">Supplier</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_tr]:border-border/70">
                        {(rfq.suppliers ?? []).length === 0 ? (
                          <TableRow className="border-border/70 hover:bg-transparent">
                            <TableCell colSpan={2} className="px-3 py-6 text-center text-muted-foreground">
                              Belum ada supplier.
                            </TableCell>
                          </TableRow>
                        ) : (
                          (rfq.suppliers ?? []).map((s, idx) => (
                            <TableRow key={s.id} data-state={selectedInvitedRows.has(idx) ? "selected" : undefined} className="border-border/70 hover:bg-transparent data-[state=selected]:bg-muted">
                              <TableCell className="px-2 text-center">
                                <Checkbox
                                  checked={selectedInvitedRows.has(idx)}
                                  onCheckedChange={(v) => {
                                    const next = new Set(selectedInvitedRows);
                                    if (v) next.add(idx);
                                    else next.delete(idx);
                                    setSelectedInvitedRows(next);
                                  }}
                                  aria-label={`select invited ${idx + 1}`}
                                />
                              </TableCell>
                              <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="px-3 font-semibold text-foreground">{s.supplierName}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </FormSection>
          )}

          {activeTab === "quotations" && (
            <FormSection>
              <div className="mb-3">
                <h3 className="text-sm font-semibold tracking-tight text-foreground">Supplier</h3>
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <Table className="text-[13px]">
                  <TableHeader className="bg-zinc-100">
                    <TableRow>
                      <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">
                        <Checkbox
                          checked={selectedQuotRows.size === (rfq.suppliers?.length ?? 0) && (rfq.suppliers?.length ?? 0) > 0}
                          onCheckedChange={(v) => {
                            if (v) setSelectedQuotRows(new Set((rfq.suppliers ?? []).map((_, i) => i)));
                            else setSelectedQuotRows(new Set());
                          }}
                          aria-label="select all quotations"
                        />
                      </TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Valid Until</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(rfq.suppliers ?? []).map((s, idx) => {
                      const q = (rfq.quotations ?? []).find((qq) => qq.supplierId === s.supplierId);
                      return (
                        <TableRow key={s.id} data-state={selectedQuotRows.has(idx) ? "selected" : undefined} className="data-[state=selected]:bg-muted">
                          <TableCell className="px-2 text-center">
                            <Checkbox
                              checked={selectedQuotRows.has(idx)}
                              onCheckedChange={(v) => {
                                const next = new Set(selectedQuotRows);
                                if (v) next.add(idx);
                                else next.delete(idx);
                                setSelectedQuotRows(next);
                              }}
                              aria-label={`select quotation ${idx + 1}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{s.supplierName}</TableCell>
                          <TableCell>{q?.quotationDate?.slice(0, 10) ?? ""}</TableCell>
                          <TableCell>{q?.validUntil?.slice(0, 10) ?? ""}</TableCell>
                          <TableCell className="text-right tabular-nums">{q ? `Rp ${formatNumber(q.totalAmount)}` : ""}</TableCell>
                          <TableCell>{q ? <Badge tone="success">Received</Badge> : <Badge variant="outline" tone="neutral">Waiting</Badge>}</TableCell>
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
              <Dialog open={!!showQuotDialog} onOpenChange={(o) => !o && setShowQuotDialog(null)}>
                <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
                  <DialogHeader className="px-6 pt-6 pb-4">
                    <DialogTitle className="text-[15px] font-semibold">Record Quotation</DialogTitle>
                    <DialogDescription className="text-xs">
                      {`RFQ ${rfq.documentNo ?? rfq.id} \u2022 Supplier ${((suppliers as any[]).find((x) => x.id === showQuotDialog)?.name ?? showQuotDialog ?? "") || "Input harga penawaran supplier"}`}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto">
                    <div className="px-6 py-5 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <DatePicker label="Quotation Date" value={quotForm.quotationDate} onChange={(v) => setQuotForm({ ...quotForm, quotationDate: v })} />
                        <DatePicker label="Valid Until" value={quotForm.validUntil} onChange={(v) => setQuotForm({ ...quotForm, validUntil: v })} />
                        <Select
                          label="Currency"
                          value={quotForm.currency}
                          onChange={(e) => setQuotForm({ ...quotForm, currency: e.target.value })}
                          className="h-8"
                        >
                          <option value="IDR">IDR</option>
                          <option value="USD">USD</option>
                          <option value="EUR">EUR</option>
                        </Select>
                        <Input
                          label="Lead Time (days)"
                          type="number"
                          value={quotForm.deliveryLeadTime}
                          onChange={(e) => setQuotForm({ ...quotForm, deliveryLeadTime: e.target.value.replace(/[^0-9]/g, "") })}
                          placeholder="3"
                        />
                        <Input
                          label="Payment Term"
                          value={quotForm.paymentTerm}
                          onChange={(e) => setQuotForm({ ...quotForm, paymentTerm: e.target.value })}
                          placeholder="NET 30"
                        />
                        <Input
                          label="Tax %"
                          value={(quotForm as any).tax ?? ""}
                          onChange={(e) => setQuotForm({ ...quotForm, tax: e.target.value } as any)}
                          placeholder="0"
                        />
                        <div className="sm:col-span-2">
                          <label className="text-sm font-medium">Notes</label>
                          <Textarea value={quotForm.notes} onChange={(e) => setQuotForm({ ...quotForm, notes: e.target.value })} />
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-lg border">
                        <Table className="text-[13px]">
                          <TableHeader className="bg-zinc-100">
                            <TableRow>
                              <TableHead>No</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead>Qty</TableHead>
                              <TableHead className="w-32 text-right">Unit Price</TableHead>
                              <TableHead className="w-28 text-right">Discount %</TableHead>
                              <TableHead className="w-32 text-right">Subtotal</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {quotForm.lines.map((l: any, idx: number) => {
                              const qty = Number(l.qty || 0);
                              const price = l.unitPrice ? Number(l.unitPrice) : 0;
                              const discPct = l.discount ? Number(l.discount) : 0;
                              const discountAmt = price ? qty * price * discPct / 100 : 0;
                              const subtotal = l.unitPrice ? qty * price - discountAmt : 0;
                              return (
                                <TableRow key={idx}>
                                  <TableCell className="text-center">{idx + 1}</TableCell>
                                  <TableCell className="text-xs">{itemLabel(l.itemId)}</TableCell>
                                  <TableCell className="text-center">{l.qty}</TableCell>
                                  <TableCell className="p-0">
                                    <TableInput
                                      value={l.unitPrice}
                                      onChange={(v) =>
                                        setQuotForm({
                                          ...quotForm,
                                          lines: quotForm.lines.map((x: any, i: number) => (i === idx ? { ...x, unitPrice: v } : x)),
                                        })
                                      }
                                      isNumeric
                                    />
                                  </TableCell>
                                  <TableCell className="p-0">
                                    <TableInput
                                      value={l.discount}
                                      onChange={(v) =>
                                        setQuotForm({
                                          ...quotForm,
                                          lines: quotForm.lines.map((x: any, i: number) => (i === idx ? { ...x, discount: v } : x)),
                                        })
                                      }
                                      isNumeric
                                      placeholder="0"
                                    />
                                  </TableCell>
                                  <TableCell className="text-right tabular-nums">{subtotal ? `Rp ${formatNumber(subtotal)}` : ""}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </div>
                  <DialogFooter className="px-6 py-4">
                    <Button variant="ghost" size="sm" onClick={() => setShowQuotDialog(null)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => handleSaveQuotation(false)} disabled={createQuot.isPending}>
                      Save Draft
                    </Button>
                    <Button size="sm" className="bg-black text-white" onClick={() => handleSaveQuotation(true)} disabled={createQuot.isPending}>
                      Save & Submit
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </FormSection>
          )}

                    {activeTab === "compare" && (
            <FormSection>
              {!compare ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading compare...</div>
              ) : (compare as any).lines?.length === 0 ? (
                <div className="py-10 text-center text-sm">No data</div>
              ) : (
                <>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold tracking-tight text-foreground">Items</h3>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table className="table-fixed text-[13px]">
                      <TableHeader className="bg-zinc-100">
                        <TableRow>
                          <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">
                            <Checkbox
                              checked={selectedCompareRows.size === ((compare as any)?.lines?.length ?? 0) && ((compare as any)?.lines?.length ?? 0) > 0}
                              onCheckedChange={(v) => {
                                if (v) setSelectedCompareRows(new Set(((compare as any)?.lines ?? []).map((_: any, i: number) => i)));
                                else setSelectedCompareRows(new Set());
                              }}
                              aria-label="select all items"
                            />
                          </TableHead>
                          <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">No</TableHead>
                          <TableHead className="w-[300px] min-w-[300px] max-w-[300px]">Item</TableHead>
                          <TableHead className="w-20 text-right">Qty</TableHead>
                          {(compare as any).totals?.map((t: any) => (
                            <TableHead key={t.supplierId} className="text-right min-w-[180px]">
                              <div className="font-semibold">{t.supplierName}</div>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(compare as any).lines.map((l: any, idx: number) => (
                          <TableRow key={idx} data-state={selectedCompareRows.has(idx) ? "selected" : undefined} className="data-[state=selected]:bg-muted">
                            <TableCell className="px-1 text-center">
                              <Checkbox
                                checked={selectedCompareRows.has(idx)}
                                onCheckedChange={(v) => {
                                  const next = new Set(selectedCompareRows);
                                  if (v) next.add(idx);
                                  else next.delete(idx);
                                  setSelectedCompareRows(next);
                                }}
                                aria-label={`select item ${idx + 1}`}
                              />
                            </TableCell>
                            <TableCell className="px-1 text-center w-8">{idx + 1}</TableCell>
                            <TableCell className="text-xs max-w-[300px] truncate">
                              <span className="font-medium truncate" title={`${l.itemCode}: ${l.itemName}`}>{l.itemCode}: {l.itemName}</span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatNumber(l.qty)}</TableCell>
                            {l.perSupplier.map((ps: any) => {
                              return (
                                <TableCell key={ps.supplierId} className="text-right tabular-nums">
                                  {ps.subtotal ? <span>Rp {formatNumber(ps.subtotal)}</span> : ps.unitPrice ? <span>Rp {formatNumber(Number(ps.unitPrice) * Number(ps.qty ?? l.qty ?? 0))}</span> : <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                        <TableRow className="bg-zinc-50 font-semibold border-t">
                          <TableCell className="px-1 text-center"></TableCell>
                          <TableCell colSpan={2} className="text-right">Grand Total</TableCell>
                          <TableCell className="text-right tabular-nums">{formatNumber((compare as any).lines.reduce((s: number, l: any) => s + Number(l.qty || 0), 0))}</TableCell>
                          {(compare as any).totals?.map((t: any) => {
                            const perSupGrand = (compare as any).lines.reduce((sum: number, l: any) => {
                              const ps = l.perSupplier.find((x: any) => x.supplierId === t.supplierId);
                              if (!ps?.subtotal && !ps?.unitPrice) return sum;
                              const sub = ps?.subtotal ? Number(ps.subtotal) : (ps?.unitPrice ? Number(ps.unitPrice) * Number(ps.qty ?? l.qty ?? 0) : 0);
                              return sum + sub;
                            }, 0);
                            return (
                              <TableCell key={t.supplierId} className="text-right tabular-nums">
                                Rp{formatNumber(perSupGrand)}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  {(() => {
                    const totals = (compare as any).totals as any[] ?? [];
                    const quotBySupplier = new Map<string, any>();
                    (rfq.quotations ?? []).forEach((q: any) => quotBySupplier.set(q.supplierId, q));
                    const perSup = totals.map((t) => {
                      const q = quotBySupplier.get(t.supplierId);
                      let subtotal = 0;
                      let discount = 0;
                      if (q?.lines) {
                        q.lines.forEach((ql: any) => {
                          const qty = Number(ql.qty || 0);
                          const price = ql.unitPrice ? Number(ql.unitPrice) : 0;
                          subtotal += qty * price;
                          discount += ql.discount ? Number(ql.discount) : 0;
                        });
                      } else {
                        subtotal = t.total;
                      }
                      const taxPct = q?.tax != null && String(q.tax).trim() !== "" ? Number(q.tax) : 0;
                      const tax = (subtotal - discount) * taxPct / 100;
                      const grand = q ? subtotal - discount + tax : t.total;
                      const delivery = q?.deliveryLeadTime ?? "";
                      const payment = q?.paymentTerm ?? "";
                      const valid = q?.validUntil ? new Date(q.validUntil).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : "";
                      return { ...t, subtotal, discount, tax, grand, delivery, payment, valid, q };
                    });
                    return (
                      <>
                        <div className="mt-6">
                          <h3 className="mb-3 text-sm font-semibold tracking-tight text-foreground">Summary</h3>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <Table className="table-fixed text-[13px]">
                            <TableHeader className="bg-zinc-100">
                              <TableRow>
                                <TableHead className="w-[160px]"></TableHead>
                                {perSup.map((p) => (
                                  <TableHead key={p.supplierId} className="text-right min-w-[180px] font-semibold">
                                    {p.supplierName}
                                  </TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                          <TableBody>
                            <TableRow>
                              <TableCell className="font-medium">Subtotal</TableCell>
                              {perSup.map((p) => (
                                <TableCell key={p.supplierId} className="text-right tabular-nums">
                                  Rp{formatNumber(p.subtotal)}
                                </TableCell>
                              ))}
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Discount</TableCell>
                              {perSup.map((p) => (
                                <TableCell key={p.supplierId} className="text-right tabular-nums">
                                  Rp{formatNumber(p.discount)}
                                </TableCell>
                              ))}
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Tax</TableCell>
                              {perSup.map((p) => (
                                <TableCell key={p.supplierId} className="text-right tabular-nums">
                                  Rp{formatNumber(p.tax)}
                                </TableCell>
                              ))}
                            </TableRow>
                            <TableRow className="bg-zinc-50 font-semibold">
                              <TableCell>Grand Total</TableCell>
                              {perSup.map((p) => (
                                <TableCell key={p.supplierId} className="text-right tabular-nums">
                                  Rp{formatNumber(p.grand)}
                                </TableCell>
                              ))}
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Delivery</TableCell>
                              {perSup.map((p) => (
                                <TableCell key={p.supplierId} className="text-right">
                                  {p.delivery || <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              ))}
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Payment Terms</TableCell>
                              {perSup.map((p) => (
                                <TableCell key={p.supplierId} className="text-right">
                                  {p.payment || <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              ))}
                            </TableRow>
                            <TableRow>
                              <TableCell className="font-medium">Valid Until</TableCell>
                              {perSup.map((p) => (
                                <TableCell key={p.supplierId} className="text-right">
                                  {p.valid || <span className="text-muted-foreground">—</span>}
                                </TableCell>
                              ))}
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                      <div className="mt-4 max-w-sm">
                        <Select
                          label="Select Supplier"
                          value={selectedCompareSupplier ?? ""}
                          onChange={(e) => setSelectedCompareSupplier(e.target.value)}
                          className="h-8"
                          disabled={!["EVALUATION", "AWARDED"].includes(rfq.status) || ["PO_CREATED", "CLOSED", "CANCELED"].includes(rfq.status) || award.isPending || createPo.isPending}
                        >
                          <option value="">Select supplier...</option>
                          {perSup.map((p) => (
                            <option key={p.supplierId} value={p.supplierId}>
                              {p.supplierName}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <Button
                          size="sm"
                          className="h-7 gap-1.5"
                          disabled={!selectedCompareSupplier || !["EVALUATION", "AWARDED"].includes(rfq.status) || ["PO_CREATED", "CLOSED", "CANCELED"].includes(rfq.status) || award.isPending || createPo.isPending}
                          onClick={async () => {
                            if (!selectedCompareSupplier) return;
                            try {
                              if (rfq.awardedSupplierId !== selectedCompareSupplier) {
                                await award.mutateAsync({ id: rfq.id, supplierId: selectedCompareSupplier });
                              }
                              const res = await createPo.mutateAsync(rfq.id);
                              toast.success(`PO ${(res as any).documentNo} created`);
                              navigate(`/app/purchase-orders/${(res as any).id}`);
                            } catch (e) {
                              setErr(e instanceof Error ? e.message : "Failed create PO");
                            }
                          }}
                        >
                          <ShoppingCart size={14} /> Create PO
                        </Button>
                      </div>
                      </>
                    );
                  })()}
                </>
              )}
            </FormSection>
          )}

          
<FormSection>
            <h3 className="mb-4 text-sm font-bold">Activity Log</h3>
            <ActivityTimeline documentType="RFQ" documentId={rfq.id} />
          </FormSection>
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
                    <div className="mt-0.5 max-w-[360px] whitespace-pre-wrap break-words text-[10px] leading-snug text-zinc-600">{(company as any)?.address ?? ""}</div>
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
                    <span>{rfq.quotationDeadline?.slice(0, 10) ?? ""}</span>
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
                    <span>{rfq.expectedDate?.slice(0, 10) ?? ""}</span>
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
                      <td className="px-2 py-2">{l.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-[11px]">Notes: {rfq.notes ?? ""}</div>
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
