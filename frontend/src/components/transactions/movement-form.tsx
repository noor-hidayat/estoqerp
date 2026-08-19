"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Columns3,
  Plus,
  ScanBarcode,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useMovementTypes,
  useItemsList,
  useAllWarehouses,
  useBarcodeFormats,
  useItemGroups,
} from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { parseBarcode } from "@/lib/barcode/parser";
import { getAll, syncMasterCache } from "@/lib/local-cache";
import { CameraScanner } from "@/components/barcode/camera-scanner";
import type {
  BarcodeFormat,
  ItemGroup,
  Item,
  MovementInput,
  StockMovementDetailFull,
} from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";

interface DetailDraft {
  key: string;
  itemId: string;
  batchNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  qty: string;
  uomId: string;
}

let rowKey = 0;
function nextKey() {
  rowKey += 1;
  return `row_${rowKey}_${Date.now()}`;
}

const SCAN_TABLE_COLUMNS = [
  { id: "source", label: "Source Warehouse" },
  { id: "target", label: "Target Warehouse" },
  { id: "itemCode", label: "Item Code" },
  { id: "qty", label: "Qty" },
  { id: "batch", label: "Batch" },
] as const;

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function nowTime(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function toTimeInput(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

interface LookupResponse {
  found: boolean;
  item?: Item;
  values?: Record<string, string>;
}

function TableSearchSelect({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setQuery("");
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "h-8 w-full min-w-[130px] truncate rounded px-1 text-left text-xs transition-colors hover:bg-muted/60 focus:outline-none",
            selected ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {selected ? selected.label : placeholder}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search
              size={14}
              strokeWidth={2}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              autoFocus
              className="h-8 pl-8 pr-2 text-xs shadow-none focus-visible:ring-1"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground">No results</p>
          ) : (
            filtered.map((o) => (
              <DropdownMenuItem
                key={o.value}
                onSelect={() => onChange(o.value)}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && (
                  <Check size={13} strokeWidth={2.5} className="shrink-0 text-primary" />
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MovementForm({
  title,
  initial,
  submitLabel,
  onSubmit,
}: {
  title: string;
  initial?: StockMovementDetailFull | null;
  submitLabel: string;
  onSubmit: (input: MovementInput) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    typeId: initial?.typeId ?? "",
    movementDate: initial?.movementDate ? initial.movementDate.slice(0, 10) : todayISO(),
    movementTime: initial?.movementDate ? toTimeInput(initial.movementDate) : nowTime(),
    description: initial?.description ?? "",
  });
  const [editPostingDate, setEditPostingDate] = useState(
    Boolean(initial?.movementDate)
  );
  const [fromDefault, setFromDefault] = useState(
    initial?.details?.[0]?.fromWarehouseId ?? ""
  );
  const [toDefault, setToDefault] = useState(
    initial?.details?.[0]?.toWarehouseId ?? ""
  );
  const [rows, setRows] = useState<DetailDraft[]>(
    initial?.details?.length
      ? initial.details.map((d) => ({
          key: nextKey(),
          itemId: d.itemId,
          batchNumber: d.batchNumber ?? "",
          fromWarehouseId: d.fromWarehouseId ?? "",
          toWarehouseId: d.toWarehouseId ?? "",
          qty: String(d.qty),
          uomId: d.uomId ?? "",
        }))
      : []
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    source: true,
    target: true,
    itemCode: true,
    qty: true,
    batch: false,
  });

  // Scan state
  const [scanInput, setScanInput] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanError, setScanError] = useState("");
  const [lastScan, setLastScan] = useState<{
    code: string;
    name: string;
    batch: string;
  } | null>(null);
  const lastBarcodeRef = useRef<{ barcode: string; at: number } | null>(null);

  const { data: types = [], isLoading: typesLoading } = useMovementTypes();
  const { data: items = [] } = useItemsList();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: formats = [] } = useBarcodeFormats();
  const { data: itemGroups = [] } = useItemGroups();

  // Isi cache lokal supaya scan bisa resolve item offline.
  useEffect(() => {
    if (formats.length && items.length && itemGroups.length) {
      void syncMasterCache({ items, itemGroups, barcodeFormats: formats });
    }
  }, [formats, items, itemGroups]);

  const setRow = (key: string, patch: Partial<DetailDraft>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const addRow = (row: Omit<DetailDraft, "key">) => {
    setRows((prev) => [...prev, { ...row, key: nextKey() }]);
  };

  /** Resolve barcode → item + batch (segmen BATCH bila ada). */
  const resolveBarcode = async (
    barcode: string
  ): Promise<{ item: Item; batchNumber: string } | null> => {
    try {
      const cachedItems = await getAll<Item>("items");
      const cachedItemGroups = await getAll<ItemGroup>("itemGroups");
      const cachedFormats = await getAll<BarcodeFormat>("barcodeFormats");
      if (cachedItems.length > 0 && cachedFormats.length > 0) {
        const parsed = parseBarcode(barcode, cachedFormats, {
          items: cachedItems,
          itemGroups: cachedItemGroups,
        });
        if (parsed?.item) {
          return {
            item: parsed.item,
            batchNumber: (parsed.values.BATCH ?? "").trim(),
          };
        }
      }
    } catch {
      // lanjut ke lookup server
    }
    const res = await api.get<LookupResponse>(
      `/items/lookup?barcode=${encodeURIComponent(barcode)}`
    );
    if (res.found && res.item) {
      return {
        item: res.item,
        batchNumber: ((res.values ?? {}).BATCH ?? "").trim(),
      };
    }
    return null;
  };

  const handleScanned = async (rawBarcode: string) => {
    const barcode = rawBarcode.trim().replace(/\s+/g, "");
    if (!barcode || scanBusy) return;
    const now = Date.now();
    if (
      lastBarcodeRef.current &&
      lastBarcodeRef.current.barcode === barcode &&
      now - lastBarcodeRef.current.at < 1500
    ) {
      return;
    }
    lastBarcodeRef.current = { barcode, at: now };
    setScanBusy(true);
    setScanError("");
    try {
      const resolved = await resolveBarcode(barcode);
      if (!resolved) {
        setScanError(`Barcode tidak dikenali: ${barcode}`);
        return;
      }
      const from = kind === "RECEIPT" ? "" : fromDefault;
      const to = kind === "ISSUE" ? "" : toDefault;
      const existing = rows.find(
        (r) =>
          r.itemId === resolved.item.id &&
          (r.batchNumber ?? "") === resolved.batchNumber &&
          r.fromWarehouseId === from &&
          r.toWarehouseId === to
      );
      if (existing) {
        setRow(existing.key, { qty: String(Number(existing.qty || 0) + 1) });
      } else {
        addRow({
          itemId: resolved.item.id,
          batchNumber: resolved.batchNumber,
          fromWarehouseId: from,
          toWarehouseId: to,
          qty: "1",
          uomId: resolved.item.uomId ?? "",
        });
      }
      setLastScan({
        code: resolved.item.code,
        name: resolved.item.name,
        batch: resolved.batchNumber,
      });
    } catch {
      setScanError("Gagal memproses barcode.");
    } finally {
      setScanBusy(false);
      setScanInput("");
    }
  };

  const save = async () => {
    setError("");
    if (!form.typeId) {
      setError("Transaction type is required.");
      return;
    }
    if (editPostingDate && !form.movementDate) {
      setError("Date is required.");
      return;
    }
    const details = rows
      .map((r) => ({
        itemId: r.itemId,
        fromWarehouseId: r.fromWarehouseId || null,
        toWarehouseId: r.toWarehouseId || null,
        qty: Number(r.qty),
        uomId: r.uomId || null,
        batchNumber: r.batchNumber.trim() || null,
      }))
      .filter((d) => d.itemId);
    if (details.length === 0) {
      setError("Scan atau tambahkan minimal 1 baris item.");
      return;
    }
    for (const d of details) {
      if (!Number.isFinite(d.qty) || d.qty <= 0) {
        setError("Qty must be greater than 0 on every row.");
        return;
      }
      if (!d.fromWarehouseId && !d.toWarehouseId) {
        setError("Every row needs a source or destination warehouse.");
        return;
      }
      if (d.fromWarehouseId && d.toWarehouseId && d.fromWarehouseId === d.toWarehouseId) {
        setError("Source and destination warehouse cannot be the same.");
        return;
      }
    }
    const movementDate = editPostingDate
      ? `${form.movementDate}T${form.movementTime}`
      : `${todayISO()}T${nowTime()}`;
    setSaving(true);
    try {
      await onSubmit({
        typeId: form.typeId,
        movementDate,
        status: "DRAFT",
        referenceType: null,
        referenceId: null,
        description: form.description || null,
        details,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  const itemOf = (id: string) => items.find((i) => i.id === id);
  const selectedType = types.find((t) => t.id === form.typeId);
  const kind = selectedType?.kind;

  const handleTypeChange = (typeId: string) => {
    setForm((prev) => ({ ...prev, typeId }));
    const nextKind = types.find((t) => t.id === typeId)?.kind;
    if (nextKind === "RECEIPT") {
      setFromDefault("");
      setToDefault((prev) => prev);
    } else if (nextKind === "ISSUE") {
      setToDefault("");
      setFromDefault((prev) => prev);
    }
  };

  return (
    <FormPage title={title}>
      <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <FormSection className="pb-0">
          <FormGrid>
            <Select
              label="Transaction type"
              value={form.typeId}
              onChange={(e) => handleTypeChange(e.target.value)}
              disabled={typesLoading}
            >
              <option value="">Select type...</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
            <div className="sm:col-start-2">
              <Input
                label="Date"
                type="date"
                value={form.movementDate}
                disabled={!editPostingDate}
                onChange={(e) => setForm({ ...form, movementDate: e.target.value })}
              />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground">
                <Checkbox
                  checked={editPostingDate}
                  onCheckedChange={(v) => setEditPostingDate(v === true)}
                />
                Edit posting date
              </label>
            </div>
            <div className="sm:col-start-2">
              <Input
                label="Time"
                type="time"
                value={form.movementTime}
                disabled={!editPostingDate}
                onChange={(e) => setForm({ ...form, movementTime: e.target.value })}
              />
            </div>
            <div className={cn(kind === "RECEIPT" && "hidden")}>
              <Select
                label="Default warehouse"
                value={fromDefault}
                onChange={(e) => setFromDefault(e.target.value)}
              >
                <option value="">— none —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className={cn("sm:col-start-2", kind === "ISSUE" && "hidden")}>
              <Select
                label="Target warehouse"
                value={toDefault}
                onChange={(e) => setToDefault(e.target.value)}
              >
                <option value="">— none —</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="movement-description">Description</Label>
                <Textarea
                  id="movement-description"
                  rows={4}
                  placeholder="Optional note"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
          </FormGrid>
        </FormSection>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <FormSection className="pb-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px]">
            <ScanBarcode
              size={15}
              strokeWidth={2}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleScanned(scanInput);
              }}
              placeholder="Scan barcode lalu Enter..."
              className="h-10 pl-9 pr-3 font-mono text-[13px] shadow-none focus-visible:ring-1"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 px-3 text-xs"
            onClick={() => setCameraOpen(true)}
          >
            <Camera size={15} strokeWidth={2} />
            Camera
          </Button>
        </div>

        {scanError && (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-[12.5px] text-destructive">
            {scanError}
          </p>
        )}
        {lastScan && (
          <div className="mb-4 flex items-center gap-2.5 rounded-md border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
            <CheckCircle2 size={15} strokeWidth={2} className="shrink-0" />
            <span className="font-mono text-xs">{lastScan.code}</span>
            <span className="min-w-0 flex-1 truncate font-medium">{lastScan.name}</span>
            {lastScan.batch && (
              <span className="shrink-0 rounded bg-white/60 px-1.5 py-0.5 font-mono text-[11px] dark:bg-black/30">
                batch {lastScan.batch}
              </span>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              {rows.length} item{rows.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs"
                onClick={() =>
                  addRow({
                    itemId: "",
                    batchNumber: "",
                    fromWarehouseId: kind === "RECEIPT" ? "" : fromDefault,
                    toWarehouseId: kind === "ISSUE" ? "" : toDefault,
                    qty: "1",
                    uomId: "",
                  })
                }
              >
                <Plus size={13} strokeWidth={2} />
                Add row
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 px-2.5 text-xs shadow-none"
                  >
                    <Columns3 size={13} strokeWidth={2} />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    Show columns
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {SCAN_TABLE_COLUMNS.map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={visibleCols[col.id]}
                      onCheckedChange={(v) =>
                        setVisibleCols((prev) => ({ ...prev, [col.id]: v === true }))
                      }
                      className="text-xs"
                    >
                      {col.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <ScanBarcode size={26} strokeWidth={1.6} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-[13px] font-medium text-foreground">Belum ada item</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Scan barcode pertama untuk memulai, atau tambah baris manual.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border/60 [&_td]:border-r [&_td]:border-border/60 [&_th]:last:border-r-0 [&_td]:last:border-r-0">
                <TableHeader className="bg-muted/40 [&_tr]:border-border">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10 px-3">No.</TableHead>
                    {visibleCols.source && kind !== "RECEIPT" && (
                      <TableHead>Source Warehouse</TableHead>
                    )}
                    {visibleCols.target && kind !== "ISSUE" && (
                      <TableHead>Target Warehouse</TableHead>
                    )}
                    {visibleCols.itemCode && <TableHead>Item Code</TableHead>}
                    {visibleCols.qty && <TableHead className="text-right">Qty</TableHead>}
                    {visibleCols.batch && <TableHead>Batch</TableHead>}
                    <TableHead className="w-10 px-2" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={r.key} className="border-border/70">
                      <TableCell className="px-3 font-mono text-xs text-muted-foreground">
                        {idx + 1}
                      </TableCell>
                      {visibleCols.source && kind !== "RECEIPT" && (
                        <TableCell>
                          <TableSearchSelect
                            value={r.fromWarehouseId}
                            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                            placeholder="— none —"
                            onChange={(v) => setRow(r.key, { fromWarehouseId: v })}
                          />
                        </TableCell>
                      )}
                      {visibleCols.target && kind !== "ISSUE" && (
                        <TableCell>
                          <TableSearchSelect
                            value={r.toWarehouseId}
                            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                            placeholder="— none —"
                            onChange={(v) => setRow(r.key, { toWarehouseId: v })}
                          />
                        </TableCell>
                      )}
                      {visibleCols.itemCode && (
                        <TableCell>
                          <TableSearchSelect
                            value={r.itemId}
                            options={items.map((i) => ({
                              value: i.id,
                              label: `${i.code} — ${i.name}`,
                            }))}
                            placeholder="Select item..."
                            onChange={(v) => {
                              const item = itemOf(v);
                              setRow(r.key, { itemId: v, uomId: item?.uomId ?? "" });
                            }}
                          />
                        </TableCell>
                      )}
                      {visibleCols.qty && (
                        <TableCell className="text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.001"
                            value={r.qty}
                            onChange={(e) => setRow(r.key, { qty: e.target.value })}
                            className="h-8 w-24 border-none bg-transparent px-1 text-right font-mono text-xs text-foreground focus:outline-none focus:ring-0"
                          />
                        </TableCell>
                      )}
                      {visibleCols.batch && (
                        <TableCell>
                          <input
                            type="text"
                            value={r.batchNumber}
                            placeholder="—"
                            onChange={(e) => setRow(r.key, { batchNumber: e.target.value })}
                            className="h-8 w-full min-w-[120px] border-none bg-transparent px-1 font-mono text-xs text-foreground focus:outline-none focus:ring-0"
                          />
                        </TableCell>
                      )}
                      <TableCell className="px-2 text-right">
                        <button
                          type="button"
                          aria-label="Remove row"
                          onClick={() =>
                            setRows((prev) => prev.filter((x) => x.key !== r.key))
                          }
                          className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <Trash2 size={14} strokeWidth={2} />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
            {error}
          </p>
        )}
        </FormSection>
      </div>
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium text-white">
              Scan barcode item
            </span>
            <button
              type="button"
              onClick={() => setCameraOpen(false)}
              className="rounded-md p-1.5 text-white/80 hover:bg-white/10"
              aria-label="Close camera"
            >
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl">
            <CameraScanner
              onScan={(text) => {
                setCameraOpen(false);
                void handleScanned(text);
              }}
              onClose={() => setCameraOpen(false)}
            />
          </div>
        </div>
      )}

      <FormActions>
        <Button variant="ghost" onClick={() => navigate("/app/transaction")}>
          <ArrowLeft size={15} strokeWidth={2} />
          Back
        </Button>
        <Button variant="primary" onClick={save} disabled={saving}>
          <Plus size={15} strokeWidth={2} />
          {saving ? "Saving..." : submitLabel}
        </Button>
      </FormActions>
    </FormPage>
  );
}
