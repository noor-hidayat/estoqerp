// Form Putaway baru — frontend-only (issue #7), simpan ke store lokal.
// Header: Ref No GRN | Sub Warehouse | Posting Date / Edit posting date time | (kosong) | Posting Time.
// Details: Get Item GRN (dari Ref No GRN) + Scan Barcode + Add Row.
// Qty Outstanding = qty GRN - qty putaway dokumen lain (non-cancel).
// Tidak auto-load item GRN saat halaman dibuka (hanya via tombol).

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import {
  useAllWarehouses,
  useItemsList,
  useLocations,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { Textarea } from "@/components/ui/textarea";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";
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
import { createPutawayId, nextPutawayNo, savePutaway, usePutawayDocs } from "@/modules/putaway/putaway-store";
import { formatNumber } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

let rowKey = 0;
function nextKey() {
  rowKey += 1;
  return `scan_${rowKey}_${Date.now()}`;
}

export default function NewPutawayPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: items = [] } = useItemsList();
  const { docs: putawayDocs } = usePutawayDocs();
  const [error, setError] = useState("");
  useErrorToast(error);

  const [grnId, setGrnId] = useState(searchParams.get("grnId") ?? "");
  const [postingDate, setPostingDate] = useState(todayISO());
  const [postingTime, setPostingTime] = useState(nowTime());
  const [allowEditPosting, setAllowEditPosting] = useState(false);
  const [subWarehouseId, setSubWarehouseId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PutawayLineInput[]>([emptyPutawayLine()]);
  const [scanHistory, setScanHistory] = useState<ScannedEntry[]>([]);
  const [tab, setTab] = useState<"details" | "scans">("details");
  const [saving, setSaving] = useState(false);

  const { data: locations = [] } = useLocations(subWarehouseId || undefined);

  const grns = listGrns();
  const grn = grnId ? getGrn(grnId) : undefined;
  const locationOptions = locations.map((l) => ({ value: l.id, label: `${l.code}: ${l.name}` }));
  const locationLabel = (id: string) => {
    const loc = locations.find((l) => l.id === id);
    return loc ? `${loc.code}: ${loc.name}` : "";
  };

  const getOutstanding = (itemId: string) =>
    outstandingQty(grn, putawayDocs, grnId, itemId);

  // Prefill sub warehouse dari GRN saat dibuka dari halaman GRN (tanpa isi item).
  const presetGrnId = searchParams.get("grnId") ?? "";

  const applyGrnRef = (id: string) => {
    setGrnId(id);
    const g = getGrn(id);
    setSubWarehouseId(g ? g.subWarehouseId || g.warehouseId || "" : "");
    setFromLocationId("");
    setToLocationId("");
    setLines((prev) => prev.map((r) => ({ ...r, fromLocationId: "", toLocationId: "" })));
  };

  useEffect(() => {
    if (!presetGrnId) return;
    applyGrnRef(presetGrnId);
  }, [presetGrnId]);

  // From Location default = receiving area (barang OK hasil GRN).
  useEffect(() => {
    if (!subWarehouseId || fromLocationId) return;
    const recv = findReceivingArea(locations);
    if (recv) setFromLocationId(recv.id);
  }, [subWarehouseId, locations, fromLocationId]);

  const handleSubChange = (v: string) => {
    setSubWarehouseId(v);
    setFromLocationId("");
    setToLocationId("");
    setLines((prev) => prev.map((r) => ({ ...r, fromLocationId: "", toLocationId: "" })));
  };

  /** Header From/To = bulk setter — terapkan ke semua baris, masih bisa dioverride per baris di tabel. */
  const handleHeaderFromChange = (v: string) => {
    setFromLocationId(v);
    setLines((prev) => prev.map((r) => ({ ...r, fromLocationId: v })));
  };

  const handleHeaderToChange = (v: string) => {
    setToLocationId(v);
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
            fromLocationId,
            toLocationId,
          },
        ]);
      }
    } else {
      setLines([
        ...lines.filter((r) => r.itemId || r.barcode || r.qty),
        { barcode, itemId: "", uomId: "", qty: "1", fromLocationId, toLocationId },
      ]);
    }
    setScanHistory((prev) => [...prev, { key: nextKey(), barcode, itemCode }]);
  };

  /** Ambil item dari GRN sesuai Ref No GRN di header (qty awal = sisa outstanding). */
  const handleGetItemGrn = () => {
    if (!grnId) return setError("Pilih Ref No GRN dulu.");
    const g = getGrn(grnId);
    if (!g || (g.lines ?? []).filter((l) => l.itemId).length === 0)
      return setError("GRN tidak punya item.");
    const seen = new Set(lines.map((l) => l.itemId).filter(Boolean));
    const appended: PutawayLineInput[] = [];
    for (const l of g.lines) {
      if (!l.itemId || seen.has(l.itemId)) continue;
      seen.add(l.itemId);
      const item = items.find((i) => i.id === l.itemId);
      const remain = outstandingQty(g, putawayDocs, grnId, l.itemId) ?? Number(l.qty || 0);
      appended.push({
        barcode: "",
        itemId: l.itemId,
        uomId: l.uomId || (item as any)?.uomId || "",
        qty: String(Math.max(0, remain)),
        fromLocationId,
        toLocationId,
      });
    }
    if (appended.length === 0) return setError("Semua item GRN sudah ada di Details.");
    setLines((prev) => [...prev.filter((r) => r.itemId || r.barcode || r.qty), ...appended]);
  };

  const validate = (candidate: PutawayLineInput[]): PutawayLineInput[] | null => {
    if (!grnId) {
      setError("Pilih Ref No GRN dulu.");
      return null;
    }
    if (!postingDate) {
      setError("Posting date wajib diisi.");
      return null;
    }
    if (!postingTime) {
      setError("Posting time wajib diisi.");
      return null;
    }
    if (!subWarehouseId) {
      setError("Sub Warehouse wajib diisi.");
      return null;
    }
    if (!fromLocationId) {
      setError("From Location wajib diisi.");
      return null;
    }
    if (!toLocationId) {
      setError("To Location wajib diisi.");
      return null;
    }
    if (fromLocationId === toLocationId) {
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
      fromLocationId: l.fromLocationId || fromLocationId,
      toLocationId: l.toLocationId || toLocationId,
    }));
    for (const l of filled) {
      const item = items.find((i) => i.id === l.itemId);
      if (!l.qty || Number(l.qty) <= 0)
        return (setError(`Qty Putaway ${item?.code ?? "item"} harus > 0.`), null);
      if (!l.fromLocationId)
        return (setError(`From Location baris ${item?.code ?? "item"} wajib diisi.`), null);
      if (!l.toLocationId)
        return (setError(`To Location baris ${item?.code ?? "item"} wajib diisi.`), null);
      if (l.fromLocationId === l.toLocationId)
        return (setError(`From dan To Location baris ${item?.code ?? "item"} tidak boleh sama.`), null);
      const remain = outstandingQty(grn, putawayDocs, grnId, l.itemId);
      if (remain != null && Number(l.qty) > remain)
        return (setError(`Qty Putaway ${item?.code ?? "item"} melebihi outstanding (${formatNumber(remain)}).`), null);
    }
    return filled;
  };

  const onSave = () => {
    if (saving) return;
    const valid = validate(lines);
    if (!valid) return;
    setSaving(true);
    try {
      const doc = savePutaway({
        id: createPutawayId(),
        documentNo: nextPutawayNo(),
        grnId,
        postingDate,
        postingTime,
        subWarehouseId,
        fromLocationId,
        toLocationId,
        notes: notes.trim(),
        lines: valid,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
      });
      navigate(`/app/putaway/${encodeURIComponent(doc.documentNo)}`, { replace: true });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [grnId, postingDate, postingTime, subWarehouseId, fromLocationId, toLocationId, notes, lines, saving]);

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
        title="New Putaway"
        titleBadge={<Badge tone="destructive">Not save</Badge>}
        tabs={tabs}
        actions={
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        }
      >
        {tab === "scans" ? (
          <PutawayScanHistoryTable history={scanHistory} />
        ) : (
          <>
            <FormSection>
              <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
                <SearchableSelect
                  label="Ref No GRN"
                  placeholder="Pilih GRN..."
                  options={grns.map((g) => ({
                    value: g.id,
                    label: `${g.documentNo} · ${g.status}`,
                  }))}
                  value={grnId}
                  onChange={(v) => applyGrnRef(v)}
                />
                <SearchableSelect
                  label="Sub Warehouse"
                  placeholder="Pilih sub gudang..."
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.code}: ${w.name}` }))}
                  value={subWarehouseId}
                  onChange={(v) => handleSubChange(v)}
                />
                <DatePicker label="Posting Date" value={postingDate} onChange={(v) => setPostingDate(v)} disabled={!allowEditPosting} />
                <div className="flex items-center">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <Checkbox checked={allowEditPosting} onCheckedChange={(v) => setAllowEditPosting(v === true)} />
                    Edit posting date time
                  </label>
                </div>
                <div aria-hidden="true" />
                <TimePicker label="Posting Time" value={postingTime} onChange={(v) => setPostingTime(v)} disabled={!allowEditPosting} />
              </div>
              <FormGrid className="mt-5">
                <SearchableSelect
                  label="From Location"
                  placeholder={subWarehouseId ? "Receiving area..." : "Pilih Sub Warehouse dulu..."}
                  options={locationOptions}
                  value={fromLocationId}
                  onChange={(v) => handleHeaderFromChange(v)}
                  disabled={!subWarehouseId}
                />
                <SearchableSelect
                  label="To Location"
                  placeholder={subWarehouseId ? "Pilih location tujuan..." : "Pilih Sub Warehouse dulu..."}
                  options={locationOptions.filter((o) => o.value !== fromLocationId)}
                  value={toLocationId}
                  onChange={(v) => handleHeaderToChange(v)}
                  disabled={!subWarehouseId}
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                  <Textarea
                    placeholder="Catatan putaway..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </FormGrid>
              {fromLocationId !== "" && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  From: {locationLabel(fromLocationId)} (receiving area)
                  {toLocationId !== "" && <> → To: {locationLabel(toLocationId)}</>}
                </p>
              )}
            </FormSection>

            <FormSection
              title="Details"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={handleGetItemGrn}
                >
                  <Download size={13} strokeWidth={2} />
                  Get Item GRN
                </Button>
              }
            >
              <PutawayScanBar onScan={handleScanned} history={scanHistory} />
              <PutawayItemTable
                value={lines}
                onChange={setLines}
                getOutstanding={getOutstanding}
                locationOptions={locationOptions}
                fromDefault={fromLocationId}
                toDefault={toLocationId}
              />
              <div className="mt-4 flex justify-end">
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-muted-foreground">Total Qty Putaway</span>
                  <span className="font-medium tabular-nums">{formatNumber(putawayTotalQty(lines))}</span>
                </div>
              </div>
            </FormSection>
          </>
        )}
      </FormPage>
    </RoleGuard>
  );
}
