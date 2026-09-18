// Detail Putaway — workflow save transaksi (docs/workflow.md):
// Draft = form editable, tampilan sama seperti new page, judul = documentNo.
// Ada perubahan -> badge "Not save" -> wajib Save ulang -> Draft lagi.
// Submit -> Submitted = read-only; Cancel/Delete via menu "...".
// Frontend-only: baca/tulis store lokal, tanpa backend/API.

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MoreVertical, Download } from "lucide-react";
import { toast } from "sonner";
import {
  useAllWarehouses,
  useItemsList,
  useLocations,
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatNumber } from "@/lib/utils";
import { getGrn, listGrns } from "@/modules/grn/grn-store";
import { PutawayItemTable } from "@/modules/putaway/components/putaway-item-table";
import {
  PutawayScanBar,
  PutawayScanHistoryTable,
  type ScannedEntry,
} from "@/modules/putaway/components/putaway-scan";
import {
  emptyPutawayLine,
  putawayTotalQty,
  type PutawayLineInput,
} from "@/modules/putaway/putaway-types";
import {
  findReceivingArea,
  outstandingQty,
} from "@/modules/putaway/putaway-utils";
import { getPutaway, removePutaway, savePutaway, usePutawayDocs } from "@/modules/putaway/putaway-store";

let rowKey = 0;
function nextKey() {
  rowKey += 1;
  return `scan_${rowKey}_${Date.now()}`;
}

export default function PutawayDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [version, setVersion] = useState(0);

  const doc = getPutaway(id);

  const { data: warehouses = [] } = useAllWarehouses();
  const { data: items = [] } = useItemsList();
  const { docs: putawayDocs } = usePutawayDocs();

  const [form, setForm] = useState({
    grnId: "",
    postingDate: "",
    postingTime: "",
    subWarehouseId: "",
    fromLocationId: "",
    toLocationId: "",
    notes: "",
  });
  const [allowEditPosting, setAllowEditPosting] = useState(false);
  const [lines, setLines] = useState<PutawayLineInput[]>([]);
  const [scanHistory, setScanHistory] = useState<ScannedEntry[]>([]);
  const [tab, setTab] = useState<"details" | "scans">("details");
  const [snapshot, setSnapshot] = useState("");

  const grns = listGrns();
  const isDraft = doc?.status === "DRAFT";
  const scopeSub = isDraft ? form.subWarehouseId : doc?.subWarehouseId;
  const { data: locations = [] } = useLocations(scopeSub || undefined);
  const locationOptions = locations.map((l) => ({ value: l.id, label: `${l.code}: ${l.name}` }));

  const grn = (isDraft ? form.grnId : doc?.grnId) ? getGrn(isDraft ? form.grnId : doc?.grnId) : undefined;
  const getOutstanding = (itemId: string) =>
    outstandingQty(grn, putawayDocs, isDraft ? form.grnId : doc?.grnId ?? "", itemId, doc?.id);

  useEffect(() => {
    if (doc) {
      const nextForm = {
        grnId: doc.grnId,
        postingDate: doc.postingDate,
        postingTime: doc.postingTime,
        // Kompatibel dengan dokumen lama (sebelum revisi header).
        subWarehouseId: doc.subWarehouseId || (doc as any).warehouseId || "",
        fromLocationId: doc.fromLocationId || "",
        toLocationId: doc.toLocationId || "",
        notes: doc.notes,
      };
      const nextLines = doc.lines.length > 0 ? doc.lines : [emptyPutawayLine()];
      setForm(nextForm);
      setLines(nextLines);
      setSnapshot(JSON.stringify({ form: nextForm, lines: nextLines }));
      setAllowEditPosting(false);
    }
  }, [id, version]);

  // From Location default = receiving area (barang OK hasil GRN).
  useEffect(() => {
    if (!isDraft || !form.subWarehouseId || form.fromLocationId) return;
    const recv = findReceivingArea(locations);
    if (recv) setForm((f) => (f.fromLocationId ? f : { ...f, fromLocationId: recv.id }));
  }, [isDraft, form.subWarehouseId, form.fromLocationId, locations]);

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
        <p className="py-20 text-center text-foreground">Putaway not found.</p>
      </RoleGuard>
    );
  }

  const isSubmitted = doc.status === "SUBMITTED";
  const isCanceled = doc.status === "CANCELED";
  const dirty = isDraft && snapshot !== "" && JSON.stringify({ form, lines }) !== snapshot;

  const totals = putawayTotalQty(isDraft ? lines : doc.lines);
  const grnNo = doc.grnId ? getGrn(doc.grnId)?.documentNo ?? "" : "";
  const subWarehouseName = warehouses.find((w) => w.id === doc.subWarehouseId)?.name ?? "";
  const locationName = (locId: string) => {
    const loc = locations.find((l) => l.id === locId);
    return loc ? `${loc.code}: ${loc.name}` : "";
  };

  const applyGrnRef = (grnRefId: string) => {
    const g = getGrn(grnRefId);
    setForm({
      ...form,
      grnId: grnRefId,
      subWarehouseId: g ? g.subWarehouseId || g.warehouseId || "" : "",
      fromLocationId: "",
      toLocationId: "",
    });
    setLines((prev) => prev.map((r) => ({ ...r, fromLocationId: "", toLocationId: "" })));
  };

  /** Header From/To = bulk setter — terapkan ke semua baris, masih bisa dioverride per baris di tabel. */
  const handleHeaderFromChange = (v: string) => {
    setForm({ ...form, fromLocationId: v });
    setLines((prev) => prev.map((r) => ({ ...r, fromLocationId: v })));
  };

  const handleHeaderToChange = (v: string) => {
    setForm({ ...form, toLocationId: v });
    setLines((prev) => prev.map((r) => ({ ...r, toLocationId: v })));
  };

  const findItem = (barcode: string) => {
    const lower = barcode.toLowerCase();
    const exact = items.find(
      (i) => i.code.toLowerCase() === lower || i.alternativeCode?.toLowerCase() === lower
    );
    if (exact) return exact;
    return items.find((i) => lower.includes(i.code.toLowerCase())) ?? null;
  };

  const handleScanned = (raw: string) => {
    const barcode = raw.trim().replace(/\s+/g, "");
    if (!barcode) return;
    const found = findItem(barcode);
    const itemCode = found?.code ?? "";
    if (found) {
      const existingIdx = lines.findIndex((r) => r.itemId === found.id);
      if (existingIdx !== -1) {
        setLines(
          lines.map((r, i) =>
            i === existingIdx
              ? { ...r, barcode: r.barcode || barcode, qty: String(Number(r.qty || 0) + 1) }
              : r
          )
        );
      } else {
        setLines([
          ...lines.filter((r) => r.itemId || r.barcode || r.qty),
          {
            barcode,
            itemId: found.id,
            uomId: (found as any).uomId ?? "",
            qty: "1",
            fromLocationId: form.fromLocationId,
            toLocationId: form.toLocationId,
          },
        ]);
      }
    } else {
      setLines([
        ...lines.filter((r) => r.itemId || r.barcode || r.qty),
        { barcode, itemId: "", uomId: "", qty: "1", fromLocationId: form.fromLocationId, toLocationId: form.toLocationId },
      ]);
    }
    setScanHistory((prev) => [...prev, { key: nextKey(), barcode, itemCode }]);
  };

  const handleGetItemGrn = () => {
    if (!form.grnId) return setError("Pilih Ref No GRN dulu.");
    const g = getGrn(form.grnId);
    if (!g || (g.lines ?? []).filter((l) => l.itemId).length === 0)
      return setError("GRN tidak punya item.");
    const seen = new Set(lines.map((l) => l.itemId).filter(Boolean));
    const appended: PutawayLineInput[] = [];
    for (const l of g.lines) {
      if (!l.itemId || seen.has(l.itemId)) continue;
      seen.add(l.itemId);
      const item = items.find((i) => i.id === l.itemId);
      const remain = outstandingQty(g, putawayDocs, form.grnId, l.itemId, doc.id) ?? Number(l.qty || 0);
      appended.push({
        barcode: "",
        itemId: l.itemId,
        uomId: l.uomId || (item as any)?.uomId || "",
        qty: String(Math.max(0, remain)),
        fromLocationId: form.fromLocationId,
        toLocationId: form.toLocationId,
      });
    }
    if (appended.length === 0) return setError("Semua item GRN sudah ada di Details.");
    setLines((prev) => [...prev.filter((r) => r.itemId || r.barcode || r.qty), ...appended]);
  };

  const validate = (candidate: PutawayLineInput[]): PutawayLineInput[] | null => {
    if (!form.grnId) {
      setError("Pilih Ref No GRN dulu.");
      return null;
    }
    if (!form.postingDate) {
      setError("Posting date wajib diisi.");
      return null;
    }
    if (!form.postingTime) {
      setError("Posting time wajib diisi.");
      return null;
    }
    if (!form.subWarehouseId) {
      setError("Sub Warehouse wajib diisi.");
      return null;
    }
    if (!form.fromLocationId) {
      setError("From Location wajib diisi.");
      return null;
    }
    if (!form.toLocationId) {
      setError("To Location wajib diisi.");
      return null;
    }
    if (form.fromLocationId === form.toLocationId) {
      setError("From dan To Location tidak boleh sama.");
      return null;
    }
    const dangling = candidate.find((l) => !l.itemId && (l.barcode || l.qty));
    if (dangling) {
      setError(`Pilih Item Code untuk barcode ${dangling.barcode || "(tanpa barcode)"}.`);
      return null;
    }
    const valid = candidate.filter((l) => l.itemId);
    if (valid.length === 0) {
      setError("Tambah minimal satu item.");
      return null;
    }
    const filled = valid.map((l) => ({
      ...l,
      fromLocationId: l.fromLocationId || form.fromLocationId,
      toLocationId: l.toLocationId || form.toLocationId,
    }));
    for (const l of filled) {
      const item = items.find((i) => i.id === l.itemId);
      if (!l.qty || Number(l.qty) <= 0) {
        setError(`Qty Putaway ${item?.code ?? "item"} harus > 0.`);
        return null;
      }
      if (!l.fromLocationId) {
        setError(`From Location baris ${item?.code ?? "item"} wajib diisi.`);
        return null;
      }
      if (!l.toLocationId) {
        setError(`To Location baris ${item?.code ?? "item"} wajib diisi.`);
        return null;
      }
      if (l.fromLocationId === l.toLocationId) {
        setError(`From dan To Location baris ${item?.code ?? "item"} tidak boleh sama.`);
        return null;
      }
      const remain = outstandingQty(grn, putawayDocs, form.grnId, l.itemId, doc.id);
      if (remain != null && Number(l.qty) > remain) {
        setError(`Qty Putaway ${item?.code ?? "item"} melebihi outstanding (${formatNumber(remain)}).`);
        return null;
      }
    }
    return filled;
  };

  const onSave = () => {
    const valid = validate(lines);
    if (!valid) return;
    savePutaway({
      ...doc,
      grnId: form.grnId,
      postingDate: form.postingDate,
      postingTime: form.postingTime,
      subWarehouseId: form.subWarehouseId,
      fromLocationId: form.fromLocationId,
      toLocationId: form.toLocationId,
      notes: form.notes.trim(),
      lines: valid,
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
            <div className="font-semibold text-xs">Submit Putaway?</div>
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
    savePutaway({ ...doc, status: "SUBMITTED" });
    setVersion((v) => v + 1);
  };

  const onDelete = () => {
    if (!confirm("Delete this Putaway? Data lokal akan dihapus.")) return;
    removePutaway(doc.id);
    navigate("/app/putaway");
  };

  const onCancel = () => {
    if (!confirm("Cancel Putaway ini? Dokumen dibatalkan dan terkunci.")) return;
    savePutaway({ ...doc, status: "CANCELED" });
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

  const tabs = (
    <div className="flex items-center gap-1 border-b border-border">
      <button
        onClick={() => setTab("details")}
        className={
          tab === "details"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Details
      </button>
      <button
        onClick={() => setTab("scans")}
        className={
          tab === "scans"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Scan History{scanHistory.length > 0 ? ` (${scanHistory.length})` : ""}
      </button>
    </div>
  );

  return (
    <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
      <FormPage
        title={doc.documentNo}
        titleBadge={dirty ? <Badge tone="destructive">Not save</Badge> : <DocStatusBadge status={doc.status} />}
        tabs={tabs}
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
            {(isSubmitted || isCanceled) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More actions">
                    <MoreVertical size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {isSubmitted && (
                    <DropdownMenuItem onClick={onCancel}>
                      Cancel
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
      >
        {tab === "scans" ? (
          <PutawayScanHistoryTable history={scanHistory} />
        ) : (
          <>
            <FormSection>
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
                {isDraft ? (
                  <SearchableSelect
                    label="Ref No GRN"
                    placeholder="Pilih GRN..."
                    options={grns.map((g) => ({
                      value: g.id,
                      label: `${g.documentNo} · ${g.status}`,
                    }))}
                    value={form.grnId}
                    onChange={(v) => applyGrnRef(v)}
                  />
                ) : (
                  view("Ref No GRN", grnNo || "—")
                )}
                {isDraft ? (
                  <SearchableSelect
                    label="Sub Warehouse"
                    placeholder="Pilih sub gudang..."
                    options={warehouses.map((w) => ({ value: w.id, label: `${w.code}: ${w.name}` }))}
                    value={form.subWarehouseId}
                    onChange={(v) =>
                      setForm({ ...form, subWarehouseId: v, fromLocationId: "", toLocationId: "" })
                    }
                  />
                ) : (
                  view("Sub Warehouse", subWarehouseName)
                )}
                {isDraft ? (
                  <DatePicker label="Posting Date" value={form.postingDate} onChange={(v) => setForm({ ...form, postingDate: v })} disabled={!allowEditPosting} />
                ) : (
                  view("Posting Date", doc.postingDate?.slice(0, 10) ?? "")
                )}
                {isDraft ? (
                  <div className="flex items-center">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <Checkbox checked={allowEditPosting} onCheckedChange={(v) => setAllowEditPosting(v === true)} />
                      Edit posting date time
                    </label>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center gap-2 py-1">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Checkbox checked={false} disabled />
                      Edit posting date time
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
                    label="From Location"
                    placeholder={form.subWarehouseId ? "Receiving area..." : "Pilih Sub Warehouse dulu..."}
                    options={locationOptions}
                    value={form.fromLocationId}
                    onChange={(v) => handleHeaderFromChange(v)}
                    disabled={!form.subWarehouseId}
                  />
                ) : (
                  view("From Location", locationName(doc.fromLocationId))
                )}
                {isDraft ? (
                  <SearchableSelect
                    label="To Location"
                    placeholder={form.subWarehouseId ? "Pilih location tujuan..." : "Pilih Sub Warehouse dulu..."}
                    options={locationOptions.filter((o) => o.value !== form.fromLocationId)}
                    value={form.toLocationId}
                    onChange={(v) => handleHeaderToChange(v)}
                    disabled={!form.subWarehouseId}
                  />
                ) : (
                  view("To Location", locationName(doc.toLocationId))
                )}
                {isDraft ? (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                    <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Catatan putaway..." />
                  </div>
                ) : (
                  view("Notes", doc.notes, true)
                )}
              </FormGrid>
            </FormSection>

            <FormSection
              title="Details"
              actions={
                isDraft ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={handleGetItemGrn}
                  >
                    <Download size={13} strokeWidth={2} />
                    Get Item GRN
                  </Button>
                ) : undefined
              }
            >
              {isDraft && <PutawayScanBar onScan={handleScanned} history={scanHistory} />}
              <PutawayItemTable
                value={isDraft ? lines : doc.lines}
                onChange={isDraft ? setLines : () => {}}
                getOutstanding={getOutstanding}
                readOnly={!isDraft}
                locationOptions={locationOptions}
                fromDefault={isDraft ? form.fromLocationId : doc.fromLocationId}
                toDefault={isDraft ? form.toLocationId : doc.toLocationId}
              />
              <div className="mt-4 flex justify-end">
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-muted-foreground">Total Qty Putaway</span>
                  <span className="font-medium tabular-nums">{formatNumber(totals)}</span>
                </div>
              </div>
            </FormSection>
          </>
        )}
      </FormPage>
    </RoleGuard>
  );
}
