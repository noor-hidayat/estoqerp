// Detail GRN — workflow save transaksi (docs/workflow.md):
// Draft = form editable, tampilan sama seperti new page, judul = documentNo.
// Ada perubahan -> badge "Not save" -> wajib Save ulang -> Draft lagi.
// Submit -> Submitted = read-only; Print / Action / Create baru muncul.
// Frontend-only: baca/tulis store lokal, tanpa backend/API.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MoreVertical, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  useAllWarehouses,
  useCompanySettings,
  useItemsList,
  usePurchaseOrder,
  usePurchaseOrders,
  useSuppliers,
  useUoms,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId, formatNumber } from "@/lib/utils";
import { GrnItemTable } from "@/modules/grn/components/grn-item-table";
import { GrnPrintDoc } from "@/modules/grn/components/grn-print-doc";
import { emptyGrnLine, grnTotals, type GrnLineInput } from "@/modules/grn/grn-types";
import { getGrn, removeGrn, saveGrn } from "@/modules/grn/grn-store";

/** Tombol yang diaktifkan untuk dokumen GRN (docs/workflow.md §2.5).
 *  Print / menu "..." / Create hanya muncul saat Submitted DAN diaktifkan di sini.
 *  Ubah false untuk menyembunyikan tombol yang tidak dibutuhkan halaman ini. */
const DOC_ACTIONS = { print: true, menu: true, create: true } as const;

export default function GrnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [version, setVersion] = useState(0);

  const doc = getGrn(id);

  const { data: pos = [] } = usePurchaseOrders();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
  const { data: company } = useCompanySettings();

  const po = pos.find((p) => p.id === doc?.purchaseOrderId);
  const { data: poDetail } = usePurchaseOrder(doc && !po ? doc.purchaseOrderId : undefined);
  const effectivePo: any = po ?? poDetail ?? null;

  const [form, setForm] = useState({
    postingDate: "",
    postingTime: "",
    warehouseId: "",
    subWarehouseId: "",
    deliveryNote: "",
    driverName: "",
    vehicleNo: "",
    notes: "",
    putaway: false,
  });
  const [allowEditPosting, setAllowEditPosting] = useState(false);
  const [lines, setLines] = useState<GrnLineInput[]>([]);
  const [snapshot, setSnapshot] = useState("");

  useEffect(() => {
    if (doc) {
      const nextForm = {
        postingDate: doc.postingDate,
        postingTime: doc.postingTime,
        warehouseId: doc.warehouseId,
        subWarehouseId: doc.subWarehouseId,
        deliveryNote: doc.deliveryNote,
        driverName: doc.driverName,
        vehicleNo: doc.vehicleNo,
        notes: doc.notes,
        putaway: doc.putaway ?? false,
      };
      const nextLines = doc.lines.length > 0 ? doc.lines : [emptyGrnLine()];
      setForm(nextForm);
      setLines(nextLines);
      setSnapshot(JSON.stringify({ form: nextForm, lines: nextLines }));
      setAllowEditPosting(false);
    }
  }, [id, version]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (doc?.status === "DRAFT") onSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [form, lines, doc?.status]);

  if (!doc) {
    return (
      <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
        <p className="py-20 text-center text-foreground">GRN not found.</p>
      </RoleGuard>
    );
  }

  const isDraft = doc.status === "DRAFT";
  const isSubmitted = doc.status === "SUBMITTED";
  const isCanceled = doc.status === "CANCELED";
  const dirty = isDraft && snapshot !== "" && JSON.stringify({ form, lines }) !== snapshot;

  const supplier =
    suppliers.find((s) => s.id === (doc.supplierId || effectivePo?.supplierId)) ??
    (effectivePo ? suppliers.find((s) => s.id === effectivePo.supplierId) : undefined);
  const supplierName = supplier?.name ?? "";
  const warehouseName = warehouses.find((w) => w.id === (isDraft ? form.warehouseId : doc.warehouseId))?.name ?? "";
  const subWarehouseName =
    warehouses.find((w) => w.id === (isDraft ? form.subWarehouseId : doc.subWarehouseId))?.name ?? "";
  const subWarehouses = (isDraft ? form.warehouseId : doc.warehouseId)
    ? warehouses.filter((w) => w.parentId === (isDraft ? form.warehouseId : doc.warehouseId))
    : [];
  const totals = grnTotals(isDraft ? lines : doc.lines);
  const poLabel =
    effectivePo?.documentNo ?? effectivePo?.poNo ?? (doc.purchaseOrderId ? formatId(doc.purchaseOrderId) : "");

  const validate = (candidate: GrnLineInput[]): GrnLineInput[] | null => {
    if (!form.postingDate) {
      setError("Posting date wajib diisi.");
      return null;
    }
    if (!form.postingTime) {
      setError("Posting time wajib diisi.");
      return null;
    }
    if (!form.warehouseId) {
      setError("Warehouse wajib diisi.");
      return null;
    }
    const valid = candidate.filter((l) => l.itemId);
    if (valid.length === 0) {
      setError("Tambah minimal satu item.");
      return null;
    }
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) {
        setError("Setiap item harus punya qty > 0.");
        return null;
      }
    }
    return valid;
  };

  const onSave = () => {
    const valid = validate(lines);
    if (!valid) return;
    saveGrn({
      ...doc,
      postingDate: form.postingDate,
      postingTime: form.postingTime,
      warehouseId: form.warehouseId,
      subWarehouseId: form.subWarehouseId,
      deliveryNote: form.deliveryNote.trim(),
      driverName: form.driverName.trim(),
      vehicleNo: form.vehicleNo.trim(),
      notes: form.notes.trim(),
      lines: valid,
      putaway: form.putaway,
    });
    setVersion((v) => v + 1);
  };

  const confirmSubmit = () =>
    new Promise<boolean>((resolve) => {
      const cleanup = (val: boolean) => {
        toast.dismiss(toastId);
        window.removeEventListener("keydown", handler);
        resolve(val);
      };
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
          e.preventDefault();
          cleanup(true);
        }
        if (e.key === "Escape") cleanup(false);
      };
      window.addEventListener("keydown", handler);
      const toastId = toast.custom(
        () => (
          <div className="bg-background border border-border rounded-lg shadow-lg p-3 w-[340px]">
            <div className="font-semibold text-xs">Submit GRN?</div>
            <div className="text-xs text-muted-foreground mt-1">
              Status akan menjadi Submitted dan dokumen terkunci.
            </div>
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

  const onSubmit = async () => {
    if (dirty) {
      setError("Simpan dulu perubahan (masih Not save) sebelum submit.");
      return;
    }
    if (!(await confirmSubmit())) return;
    saveGrn({ ...doc, status: "SUBMITTED" });
    setVersion((v) => v + 1);
  };

  const onDelete = () => {
    if (!confirm("Delete this GRN? Data lokal akan dihapus.")) return;
    removeGrn(doc.id);
    navigate("/app/grn");
  };

  const onCancel = () => {
    if (!confirm("Cancel GRN ini? Dokumen dibatalkan dan terkunci.")) return;
    saveGrn({ ...doc, status: "CANCELED" });
    setVersion((v) => v + 1);
  };

  const view = (label: string, value: string, multiline = false) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium leading-none">{label}</label>
      {multiline ? (
        <div className="flex min-h-[80px] w-full rounded-md border border-input bg-zinc-100 px-3 py-2 text-[13px] text-foreground whitespace-pre-wrap break-words">
          {value}
        </div>
      ) : (
        <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
          {value}
        </div>
      )}
    </div>
  );

  return (
    <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
      <div className="print:hidden">
        <FormPage
          title={doc.documentNo ?? formatId(doc.id)}
          titleBadge={dirty ? <Badge tone="destructive">Not save</Badge> : <DocStatusBadge status={doc.status} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {isDraft && dirty && (
                <Button size="sm" onClick={onSave}>
                  Save
                </Button>
              )}
              {isDraft && !dirty && (
                <Button variant="primary" size="sm" onClick={onSubmit}>
                  Submit
                </Button>
              )}
              {isSubmitted && DOC_ACTIONS.print && (
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Print GRN" onClick={() => window.print()}>
                  <Printer size={16} />
                </Button>
              )}
              {isSubmitted && DOC_ACTIONS.menu && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More actions">
                      <MoreVertical size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onClick={onCancel}>
                      Cancel
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {isCanceled && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More actions">
                      <MoreVertical size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {isSubmitted && DOC_ACTIONS.create && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-7 bg-black px-3 text-xs text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200" aria-label="Create">
                      Create
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => navigate("/app/putaway")}>
                      Putaway
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          }
        >
          <FormSection>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
              {view("Ref PO", String(poLabel))}
              {view("Supplier", supplierName)}
              {isDraft ? (
                <DatePicker label="Posting Date" value={form.postingDate} onChange={(v) => setForm({ ...form, postingDate: v })} disabled={!allowEditPosting} />
              ) : (
                view("Posting Date", doc.postingDate?.slice(0, 10) ?? "")
              )}
              {isDraft ? (
                <div className="flex flex-col justify-center gap-2 py-1">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox checked={allowEditPosting} onCheckedChange={(v) => setAllowEditPosting(v === true)} />
                    Edit posting date time
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox checked={form.putaway} onCheckedChange={(v) => setForm({ ...form, putaway: v === true })} />
                    Putaway
                  </label>
                </div>
              ) : (
                <div className="flex flex-col justify-center gap-2 py-1">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={allowEditPosting} disabled />
                    Edit posting date time
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox checked={!!doc.putaway} disabled />
                    Putaway
                  </label>
                </div>
              )}
              <div aria-hidden="true" />
              {isDraft ? (
                <TimePicker label="Posting Time" value={form.postingTime} onChange={(v) => setForm({ ...form, postingTime: v })} disabled={!allowEditPosting} />
              ) : (
                view("Posting Time", doc.postingTime ?? "")
              )}
            </div>
            <FormGrid className="mt-5">
              {isDraft ? (
                <SearchableSelect
                  label="Warehouse"
                  placeholder="Pilih gudang..."
                  options={warehouses.filter((w) => !w.parentId).map((w) => ({ value: w.id, label: w.name }))}
                  value={form.warehouseId}
                  onChange={(v) => setForm({ ...form, warehouseId: v, subWarehouseId: "" })}
                />
              ) : (
                view("Warehouse", warehouseName)
              )}
              {isDraft ? (
                <SearchableSelect
                  label="Sub Warehouse"
                  placeholder={subWarehouses.length > 0 ? "Pilih sub gudang..." : "Tidak ada sub gudang"}
                  options={subWarehouses.map((w) => ({ value: w.id, label: w.name }))}
                  value={form.subWarehouseId}
                  onChange={(v) => setForm({ ...form, subWarehouseId: v })}
                  disabled={subWarehouses.length === 0}
                />
              ) : (
                view("Sub Warehouse", subWarehouseName)
              )}
            </FormGrid>
          </FormSection>

          <FormSection title="Delivery Information">
            <FormGrid>
              {isDraft ? (
                <Input label="Supplier Delivery Note" value={form.deliveryNote} onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })} />
              ) : (
                view("Supplier Delivery Note", doc.deliveryNote)
              )}
              {isDraft ? (
                <Input label="Driver Name" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
              ) : (
                view("Driver Name", doc.driverName)
              )}
              {isDraft ? (
                <Input label="Vehicle No" value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} />
              ) : (
                view("Vehicle No", doc.vehicleNo)
              )}
              {isDraft ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              ) : (
                view("Notes", doc.notes, true)
              )}
            </FormGrid>
          </FormSection>

          <FormSection title="Item">
            <GrnItemTable value={isDraft ? lines : doc.lines} onChange={isDraft ? setLines : () => {}} readOnly={!isDraft} />
            <div className="mt-4 flex justify-end">
              <div className="w-full max-w-[320px] space-y-2 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Qty</span>
                  <span className="font-medium tabular-nums">{formatNumber(totals.totalQty)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums">Rp {formatNumber(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium tabular-nums">- Rp {formatNumber(totals.discountTotal)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold tabular-nums">Rp {formatNumber(totals.grandTotal)}</span>
                </div>
              </div>
            </div>
          </FormSection>
        </FormPage>
      </div>

      {isSubmitted && (
        <GrnPrintDoc
          doc={doc}
          supplier={supplier as any}
          purchaseOrder={effectivePo as any}
          warehouseName={warehouseName}
          subWarehouseName={subWarehouseName}
          items={items as any}
          uoms={uoms as any}
          company={company as any}
        />
      )}
    </RoleGuard>
  );
}
