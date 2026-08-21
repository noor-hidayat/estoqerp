"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Check,
  CheckCircle2,
  Columns3,
  Plus,
  ScanBarcode,
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
import { QtyCalculator } from "@/components/transactions/qty-calculator";
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
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
  disabled,
  onTab,
  registerRef,
}: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  onTab?: () => void;
  registerRef?: (el: HTMLInputElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((o) => o.value === value);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    setHighlight(0);
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  const openList = () => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (disabled) {
    return (
      <span
        className={cn(
          "block h-8 w-full min-w-[100px] truncate px-2 py-2 text-sm",
          selected ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {selected ? selected.label : placeholder}
      </span>
    );
  }

  const pick = (o: { value: string; label: string }, refocus = true) => {
    onChange(o.value);
    setQuery("");
    setOpen(false);
    if (refocus) inputRef.current?.focus();
  };

  return (
    <div ref={wrapRef} className="relative min-w-[100px]">
      <input
        ref={(el) => {
          inputRef.current = el;
          registerRef?.(el);
        }}
        type="text"
        value={open ? query : (selected?.label ?? "")}
        placeholder={placeholder}
        onFocus={() => {
          openList();
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!open) openList();
        }}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openList();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            const match = filtered[highlight];
            if (match && open) pick(match);
            else if (open) {
              setOpen(false);
              onTab?.();
            }
          } else if (e.key === "Tab") {
            e.preventDefault();
            if (open) {
              const match = filtered[highlight];
              if (match) {
                pick(match, false);
              }
              setOpen(false);
            }
            onTab?.();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        className="h-8 w-full truncate border-none bg-transparent px-1 text-left text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0"
      />
      {open &&
        coords &&
        createPortal(
          <div
            className="fixed z-50 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div ref={listRef} className="max-h-48 overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className="px-3 py-2.5 text-xs text-muted-foreground">No results</p>
              ) : (
                filtered.map((o, i) => (
                  <button
                    key={o.value}
                    type="button"
                    data-idx={i}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(o);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left text-xs transition-colors hover:bg-muted",
                      i === highlight && "bg-muted",
                      o.value === value && "text-primary"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.value === value && (
                      <Check size={13} strokeWidth={2.5} className="shrink-0 text-primary" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function MovementForm({
  title,
  initial,
  submitLabel,
  onSubmit,
  readOnly = false,
  actions,
  onSaved,
  onPost,
  onCancel,
  onAmend,
  statusBadge,
}: {
  title: string;
  initial?: StockMovementDetailFull | null;
  submitLabel: string;
  onSubmit: (input: MovementInput) => Promise<void>;
  readOnly?: boolean;
  actions?: ReactNode;
  onSaved?: (typeName: string) => void;
  onPost?: () => Promise<void>;
  onCancel?: () => Promise<void>;
  onAmend?: () => Promise<void>;
  statusBadge?: ReactNode;
}) {
  const [form, setForm] = useState({
    typeId: initial?.typeId ?? "",
    movementDate: initial?.movementDate ? initial.movementDate.slice(0, 10) : todayISO(),
    movementTime: initial?.movementDate ? toTimeInput(initial.movementDate) : nowTime(),
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
  const [saved, setSaved] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    if ((!onCancel && !onAmend) || cancelling) return;
    setCancelling(true);
    try {
      if (onAmend) await onAmend();
      else await onCancel!();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCancelling(false);
    }
  };

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    source: true,
    target: true,
    itemCode: true,
    qty: true,
    batch: false,
  });
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const cellRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const registerCell = (key: string) => (el: HTMLInputElement | null) => {
    cellRefs.current[key] = el;
  };

  const focusCell = (key: string) => {
    cellRefs.current[key]?.focus();
  };

  const tabNext = (rowKey: string, col: string) => {
    const cols = [
      ...(visibleCols.source ? ["source"] : []),
      ...(visibleCols.target ? ["target"] : []),
      ...(visibleCols.itemCode ? ["itemCode"] : []),
      ...(visibleCols.qty ? ["qty"] : []),
      ...(visibleCols.batch ? ["batch"] : []),
    ];
    const idx = cols.indexOf(col);
    if (idx < cols.length - 1) {
      focusCell(`${rowKey}:${cols[idx + 1]}`);
      return;
    }
    const newKey = nextKey();
    setRows((prev) => [
      ...prev,
      {
        key: newKey,
        itemId: "",
        batchNumber: "",
        fromWarehouseId: kind === "RECEIPT" ? "" : fromDefault,
        toWarehouseId: kind === "ISSUE" ? "" : toDefault,
        qty: "",
        uomId: "",
      },
    ]);
    focusCell(`${newKey}:${cols[0]}`);
  };

  const allSelected = rows.length > 0 && selectedKeys.size === rows.length;
  const someSelected = selectedKeys.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelectedKeys(allSelected ? new Set() : new Set(rows.map((r) => r.key)));
  };

  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const removeSelected = () => {
    setRows((prev) => prev.filter((r) => !selectedKeys.has(r.key)));
    setSelectedKeys(new Set());
  };

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
    if (readOnly) return;
    setError("");
    if (saved && onPost) {
      setSaving(true);
      try {
        await onPost();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to post");
      } finally {
        setSaving(false);
      }
      return;
    }
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
        details,
      });
      onSaved?.(selectedType?.name ?? form.typeId);
      setSaved(true);
      setSaving(false);
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
    <FormPage
      title={title}
      titleBadge={statusBadge}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {onCancel && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? "..." : onAmend ? "Amend" : "Cancel"}
            </Button>
          )}
          {!readOnly && (
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : saved && onPost ? "Post" : submitLabel}
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <FormSection className="pb-0">
          <FormGrid>
            <Select
              label="Transaction type"
              value={form.typeId}
              onChange={(e) => handleTypeChange(e.target.value)}
              disabled={typesLoading || readOnly}
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
                disabled={!editPostingDate || readOnly}
                onChange={(e) => setForm({ ...form, movementDate: e.target.value })}
              />
            </div>
            {!readOnly && (
              <div className="flex items-end pb-0.5">
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground">
                  <Checkbox
                    checked={editPostingDate}
                    onCheckedChange={(v) => setEditPostingDate(v === true)}
                  />
                  Edit posting date
                </label>
              </div>
            )}
            <div className="sm:col-start-2">
              <Input
                label="Time"
                type="time"
                value={form.movementTime}
                disabled={!editPostingDate || readOnly}
                onChange={(e) => setForm({ ...form, movementTime: e.target.value })}
              />
            </div>
            <div className={cn(kind === "RECEIPT" && "hidden")}>
              <Select
                label="Default warehouse"
                value={fromDefault}
                onChange={(e) => setFromDefault(e.target.value)}
                disabled={readOnly}
              >
                <option value=""></option>
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
                disabled={readOnly}
              >
                <option value=""></option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
          </FormGrid>
        </FormSection>

        <div className="my-6 h-px bg-border" />

        <FormSection className="pb-0">
        <div className="mb-4 grid gap-x-8 sm:grid-cols-2">
          <div>
            <div className="mb-2">
              <span className="text-[13px] font-medium text-foreground">
                Scan Barcode
              </span>
            </div>
            <div className="relative">
              <Input
                value={scanInput}
                disabled={readOnly}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleScanned(scanInput);
                }}
                placeholder="Scan Barcode"
                className="h-8 rounded-md pr-11 pl-3 font-mono text-[13px] shadow-none focus-visible:ring-1"
              />
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Scan with camera"
                  onClick={() => setCameraOpen(true)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-zinc-200/80 hover:text-foreground"
                >
                  <Camera size={16} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>

        {!readOnly && scanError && (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-[12.5px] text-destructive">
            {scanError}
          </p>
        )}
        {!readOnly && lastScan && (
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
          <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <div className="flex items-center gap-2">
              {!readOnly && (
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
              )}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <ScanBarcode size={26} strokeWidth={1.6} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-[13px] font-medium text-foreground">
                {readOnly ? "Tidak ada item" : "Belum ada item"}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {readOnly
                  ? "Transaksi ini tidak memiliki baris item."
                  : "Scan barcode pertama untuk memulai, atau tambah baris manual."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed border-collapse text-left text-sm [&_th]:border-r [&_th]:border-border/60 [&_td]:border-r [&_td]:border-border/60 [&_th]:last:border-r-0 [&_td]:last:border-r-0">
                <TableHeader className="bg-muted/40 [&_tr]:border-border">
                  <TableRow className="border-border hover:bg-transparent">
                    {!readOnly && (
                      <TableHead className="w-10 px-3">
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={toggleAll}
                          aria-label="Select all rows"
                        />
                      </TableHead>
                    )}
                    <TableHead className="w-10 px-3">No.</TableHead>
                    {visibleCols.source && <TableHead className="w-[260px] px-4">Source Warehouse</TableHead>}
                    {visibleCols.target && <TableHead className="w-[260px] px-4">Target Warehouse</TableHead>}
                    {visibleCols.itemCode && <TableHead className="px-4">Item Code</TableHead>}
                    {visibleCols.qty && <TableHead className="w-[150px] px-4 text-right">Qty</TableHead>}
                    {visibleCols.batch && <TableHead className="w-[150px] px-4">Batch</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow
                      key={r.key}
                      className={cn(
                        "border-border/70",
                        !readOnly && selectedKeys.has(r.key) && "bg-muted/50"
                      )}
                    >
                      {!readOnly && (
                        <TableCell className="px-3">
                          <Checkbox
                            checked={selectedKeys.has(r.key)}
                            onCheckedChange={() => toggleRow(r.key)}
                            aria-label={`Select row ${idx + 1}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="px-3 font-mono text-sm text-muted-foreground">                        {idx + 1}
                      </TableCell>
                      {visibleCols.source && (
                        <TableCell className="px-4">
                          <TableSearchSelect
                            value={r.fromWarehouseId}
                            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                            placeholder=""
                            onChange={(v) => setRow(r.key, { fromWarehouseId: v })}
                            disabled={readOnly}
                            registerRef={registerCell(`${r.key}:source`)}
                            onTab={() => tabNext(r.key, "source")}
                          />
                        </TableCell>
                      )}
                      {visibleCols.target && (
                        <TableCell className="px-4">
                          <TableSearchSelect
                            value={r.toWarehouseId}
                            options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                            placeholder=""
                            onChange={(v) => setRow(r.key, { toWarehouseId: v })}
                            disabled={readOnly}
                            registerRef={registerCell(`${r.key}:target`)}
                            onTab={() => tabNext(r.key, "target")}
                          />
                        </TableCell>
                      )}
                      {visibleCols.itemCode && (
                        <TableCell className="px-4">
                          <TableSearchSelect
                            value={r.itemId}
                            options={items.map((i) => ({
                              value: i.id,
                              label: `${i.name}: ${i.code}`,
                            }))}
                            placeholder=""
                            onChange={(v) => {
                              const item = itemOf(v);
                              setRow(r.key, { itemId: v, uomId: item?.uomId ?? "" });
                            }}
                            disabled={readOnly}
                            registerRef={registerCell(`${r.key}:itemCode`)}
                            onTab={() => tabNext(r.key, "itemCode")}
                          />
                        </TableCell>
                      )}
                      {visibleCols.qty && (
                        <TableCell className="px-4 text-right">
                          <QtyCalculator
                            value={r.qty}
                            disabled={readOnly}
                            onChange={(v) => setRow(r.key, { qty: v })}
                            registerRef={registerCell(`${r.key}:qty`)}
                            onTab={() => {
                              if (readOnly) return;
                              tabNext(r.key, "qty");
                            }}
                          />
                        </TableCell>
                      )}
                      {visibleCols.batch && (
                        <TableCell className="px-4">
                          <input
                            type="text"
                            value={r.batchNumber}
                            placeholder="—"
                            disabled={readOnly}
                            ref={registerCell(`${r.key}:batch`)}
                            onChange={(e) => setRow(r.key, { batchNumber: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Tab") {
                                e.preventDefault();
                                tabNext(r.key, "batch");
                              }
                            }}
                            className="h-8 w-full min-w-[90px] border-none bg-transparent px-1 font-mono text-sm text-foreground focus:outline-none focus:ring-0 disabled:opacity-100"
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="mt-3 flex items-center justify-start">
            {selectedKeys.size > 0 ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={removeSelected}
              >
                <Trash2 size={13} strokeWidth={2} />
                Delete ({selectedKeys.size})
              </Button>
            ) : (
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
                    qty: "",
                    uomId: "",
                  })
                }
              >
                <Plus size={13} strokeWidth={2} />
                Add row
              </Button>
            )}
          </div>
        )}

        {error && (
          <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
            {error}
          </p>
        )}
        </FormSection>
      </div>
      </div>

      {!readOnly && cameraOpen && (
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

      </FormPage>
  );
}
