import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Camera,
  Check,
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
  useBatchFormats,
  useItemGroups,
  useCustomers,
} from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { parseBarcode } from "@/lib/barcode/parser";
import { parseBatchNumber } from "@/lib/batch/parser";
import { getAll, syncMasterCache } from "@/lib/local-cache";
import { useErrorToast } from "@/hooks/use-error-toast";
import { CameraScanner } from "@/components/barcode/camera-scanner";
import { QtyCalculator } from "@/components/transactions/qty-calculator";
import type {
  BarcodeFormat,
  BatchFormat,
  ItemGroup,
  Item,
  MovementInput,
  StockMovementDetailFull,
} from "@/types";
import { cn, cx } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
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

interface DetailUnit {
  barcode?: string;
  serialNumber?: string;
  qty: number;
}

interface DetailDraft {
  key: string;
  itemId: string;
  batchNumber: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  qty: string;
  uomId: string;
  incomingRate?: string;
  barcode?: string;
  serialNumber?: string;
  /** Barcode/serial per unit saat baris hasil gabungan beberapa scan. */
  units?: DetailUnit[];
}

let rowKey = 0;
function nextKey() {
  rowKey += 1;
  return `row_${rowKey}_${Date.now()}`;
}

const detailKeyOf = (d: {
  itemId: string;
  batchNumber?: string | null;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  incomingRate?: number | null;
}) =>
  [d.itemId, d.batchNumber ?? "", d.fromWarehouseId ?? "", d.toWarehouseId ?? "", String(d.incomingRate ?? "")].join("|");

/** Gabung detail yang item + batch + gudang asal/tujuan sama menjadi satu baris,
 *  dengan qty dijumlahkan dan barcode/serial tiap unit tetap disimpan. */
function mergeDetails(
  details: { itemId: string; batchNumber?: string | null; fromWarehouseId?: string | null; toWarehouseId?: string | null; qty: number; uomId?: string | null; barcode?: string | null; serialNumber?: string | null; incomingRate?: number | null }[]
): DetailDraft[] {
  const out: DetailDraft[] = [];
  const map = new Map<string, DetailDraft>();
  for (const d of details) {
    const k = detailKeyOf(d as any);
    const qty = Number(d.qty) || 0;
    let row = map.get(k);
    if (!row) {
      row = {
        key: nextKey(),
        itemId: d.itemId,
        batchNumber: d.batchNumber ?? "",
        fromWarehouseId: d.fromWarehouseId ?? "",
        toWarehouseId: d.toWarehouseId ?? "",
        qty: "0",
        uomId: d.uomId ?? "",
        incomingRate: d.incomingRate != null ? String(d.incomingRate) : "",
        barcode: d.barcode ?? undefined,
        serialNumber: d.serialNumber ?? undefined,
        units: [],
      };
      map.set(k, row);
      out.push(row);
    }
    row.units!.push({
      barcode: d.barcode ?? undefined,
      serialNumber: d.serialNumber ?? undefined,
      qty,
    });
    row.qty = String(Number(row.qty) + qty);
  }
  return out;
}

const SCAN_TABLE_COLUMNS = [
  { id: "source", label: "Source Warehouse" },
  { id: "target", label: "Target Warehouse" },
  { id: "itemCode", label: "Item Code" },
  { id: "qty", label: "Qty" },
  { id: "batch", label: "Batch" },
  { id: "rate", label: "Rate" },
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
  formatId?: string;
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
  tabs,
  className,
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
  tabs?: ReactNode;
  className?: string;
}) {
  const [form, setForm] = useState({
    typeId: initial?.typeId ?? "",
    movementDate: initial?.movementDate ? initial.movementDate.slice(0, 10) : todayISO(),
    movementTime: (initial?.movementDate ? toTimeInput(initial.movementDate) : nowTime()).replace(
      /^(\d{2}:\d{2})$/,
      "$1:00"
    ),
    customerId: (initial as any)?.customerId ?? "",
    description: (initial as any)?.description ?? "",
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
    initial?.details?.length ? mergeDetails(initial.details) : []
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(() => !!initial);
  const [cancelling, setCancelling] = useState(false);
  useErrorToast(error);

  const serialize = () =>
    JSON.stringify({ form, editPostingDate, rows });
  const [snapshot, setSnapshot] = useState<string>(() => serialize());
  // keep snapshot in sync when initial loads (detail page)
  useEffect(() => {
    if (initial) {
      setSnapshot(serialize());
      setSaved(true);
    }
  }, [initial?.id]);
  const dirty = serialize() !== snapshot;
  const showNotSave = !readOnly && (!saved || dirty);
  const fallbackBadge = saved && !dirty && !readOnly ? <Badge tone="neutral">Draft</Badge> : null;
  const displayBadge = showNotSave ? <Badge tone="destructive">Not Save</Badge> : (statusBadge ?? fallbackBadge);

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
    rate: true,
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
      ...(visibleCols.rate && kind === "RECEIPT" ? ["rate"] : []),
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
        incomingRate: "",
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
  useErrorToast(scanError);
  const [scanHistory, setScanHistory] = useState<
    {
      key: string;
      barcode: string;
      batch: string;
      itemCode: string;
      serial: string;
    }[]
  >(() =>
    (initial?.details ?? [])
      .filter((d) => d.barcode)
      .map((d) => ({
        key: `${d.barcode}-${Math.random().toString(36).slice(2)}`,
        barcode: d.barcode as string,
        batch: (d as { batchNumber?: string | null }).batchNumber ?? "",
        itemCode: (d as { itemCode?: string | null }).itemCode ?? "",
        serial: (d as { serialNumber?: string | null }).serialNumber ?? "",
      }))
  );
  const [internalTab, setInternalTab] = useState<"details" | "scans">("details");
  const hasExternalTabs = !!tabs;
  const internalTabsNode = (
    <div className="flex items-center gap-1 border-b border-border">
      <button
        onClick={() => setInternalTab("details")}
        className={
          internalTab === "details"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Details
      </button>
      <button
        onClick={() => setInternalTab("scans")}
        className={
          internalTab === "scans"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Scan History{scanHistory.length > 0 ? ` (${scanHistory.length})` : ""}
      </button>
    </div>
  );
  const effectiveTabs = tabs ?? internalTabsNode;
  const showScans = !hasExternalTabs && internalTab === "scans";
  const lastBarcodeRef = useRef<{ barcode: string; at: number } | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-enter: scanner/manual ketik → submit 1 detik setelah berhenti;
  // paste → langsung submit tanpa nunggu.
  useEffect(() => () => {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
  }, []);

  const { data: types = [], isLoading: typesLoading } = useMovementTypes();
  const { data: items = [] } = useItemsList();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: formats = [] } = useBarcodeFormats();
  const { data: batchFormats = [] } = useBatchFormats();
  const { data: itemGroups = [] } = useItemGroups();
  const { data: customers = [] } = useCustomers();

  // Isi cache lokal supaya scan bisa resolve item offline.
  useEffect(() => {
    if (formats.length && items.length && itemGroups.length) {
      void syncMasterCache({
        items,
        itemGroups,
        barcodeFormats: formats,
        batchFormats,
      });
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
  ): Promise<
    | { item: Item; batchNumber: string; formatId?: string; values?: Record<string, string> }
    | null
  > => {
    try {
      const cachedItems = await getAll<Item>("items");
      const cachedItemGroups = await getAll<ItemGroup>("itemGroups");
      const cachedFormats = await getAll<BarcodeFormat>("barcodeFormats");
      const cachedBatchFormats = await getAll<BatchFormat>("batchFormats");
      if (cachedItems.length > 0 && cachedFormats.length > 0) {
        const parsed = parseBarcode(barcode, cachedFormats, {
          items: cachedItems,
          itemGroups: cachedItemGroups,
          batchFormats: cachedBatchFormats,
        });
        if (parsed?.item) {
          return {
            item: parsed.item,
            batchNumber: (parsed.values.BATCH ?? "").trim(),
            formatId: parsed.formatId || undefined,
            values: parsed.values,
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
        formatId: res.formatId,
        values: res.values,
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
      // Format barcode unik — barcode yang sama tidak boleh discan dua kali.
      const from = kind === "RECEIPT" ? "" : fromDefault;
      const format = formats.find((f) => f.id === resolved.formatId);
      if (format?.uniqueBarcode && scanHistory.some((h) => h.barcode === barcode)) {
        setScanError(`Barcode sudah discan (format unik): ${barcode}`);
        return;
      }
      if (format?.uniqueBarcode) {
        const check = await api.get<{
          exists: boolean;
          movementId?: string | null;
          warehouseId?: string | null;
          warehouseCode?: string | null;
          warehouseName?: string | null;
        }>(
          `/transactions/barcode-check?barcode=${encodeURIComponent(barcode)}${
            initial?.id
              ? `&excludeMovementId=${encodeURIComponent(initial.id)}`
              : ""
          }`
        );
        if (kind === "RECEIPT") {
          // Barcode masih aktif di sistem → tolak. Sudah keluar (issue) → boleh re-receipt.
          if (check.exists && check.warehouseId) {
            setScanError(
              `Barcode "${barcode}" sudah pernah dibuat dan masih ada di gudang ${check.warehouseCode ?? check.warehouseName ?? check.warehouseId} — barcode has been created.`
            );
            return;
          }
        } else {
          // ISSUE / TRANSFER / OTHER — barcode wajib sudah pernah di-receipt
          // dan berada di gudang asal.
          if (!check.exists) {
            setScanError(
              `Barcode "${barcode}" belum pernah dibuat (receipt) — tidak ada di sistem.`
            );
            return;
          }
          if (!from) {
            setScanError(
              "Pilih gudang asal (Default warehouse) terlebih dahulu sebelum scan."
            );
            return;
          }
          if (check.warehouseId && check.warehouseId !== from) {
            setScanError(
              `Barcode "${barcode}" ada di gudang ${check.warehouseCode ?? check.warehouseName ?? check.warehouseId} — bukan gudang asal yang dipilih.`
            );
            return;
          }
          if (!check.warehouseId) {
            setScanError(
              `Barcode "${barcode}" sudah keluar dari sistem (tidak ada di gudang asal).`
            );
            return;
          }
        }
      }
      const to = kind === "ISSUE" ? "" : toDefault;
      const masterQty =
        resolved.item.uomQty && Number(resolved.item.uomQty) > 0
          ? Number(resolved.item.uomQty)
          : 1;
      // Gabung baris item+batch+gudang yang sama — barcode tiap unit tetap
      // dicatat di row (units) supaya data per barcode tidak hilang saat save.
      const serial = (resolved.values?.SEQUENCE ?? "").trim() || undefined;
      const existing = rows.find(
        (r) =>
          r.itemId === resolved.item.id &&
          (r.batchNumber ?? "") === resolved.batchNumber &&
          r.fromWarehouseId === from &&
          r.toWarehouseId === to
      );
      if (existing) {
        setRow(existing.key, {
          qty: String(Number(existing.qty || 0) + masterQty),
          barcode: existing.barcode || barcode,
          serialNumber: existing.serialNumber || serial,
          units: [
            ...(existing.units ?? [
              {
                barcode: existing.barcode,
                serialNumber: existing.serialNumber,
                qty: Number(existing.qty || 0),
              },
            ]),
            { barcode, serialNumber: serial, qty: masterQty },
          ],
        });
      } else {
        addRow({
          itemId: resolved.item.id,
          batchNumber: resolved.batchNumber,
          fromWarehouseId: from,
          toWarehouseId: to,
          qty: String(masterQty),
          uomId: resolved.item.uomId ?? "",
          barcode,
          serialNumber: serial,
          units: [{ barcode, serialNumber: serial, qty: masterQty }],
        });
      }
      setScanHistory((prev) => [
        ...prev,
        {
          key: `${barcode}-${Date.now()}`,
          barcode,
          batch: resolved.batchNumber,
          itemCode: resolved.item.code,
          serial: (resolved.values?.SEQUENCE ?? "").trim(),
        },
      ]);
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
    if (saved && onPost && !dirty) {
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
    if (isReturnCustomer && !form.customerId) {
      setError("Customer is required for return.");
      return;
    }
    if (editPostingDate && !form.movementDate) {
      setError("Date is required.");
      return;
    }
    const details = rows
      .flatMap((r): {
        itemId: string;
        fromWarehouseId: string | null;
        toWarehouseId: string | null;
        qty: number;
        uomId: string | null;
        batchNumber: string | null;
        barcode: string | null;
        serialNumber: string | null;
        incomingRate: number | null;
      }[] => {
        const base = {
          itemId: r.itemId,
          fromWarehouseId: r.fromWarehouseId || null,
          toWarehouseId: r.toWarehouseId || null,
          uomId: r.uomId || null,
          batchNumber: r.batchNumber.trim() || null,
          incomingRate: r.incomingRate && String(r.incomingRate).trim() !== "" ? Number(r.incomingRate) : null,
        };
        const units = r.units ?? [];
        const unitSum = units.reduce((a, u) => a + u.qty, 0);
        if (units.length > 1 && unitSum === Number(r.qty)) {
          return units.map((u) => ({
            ...base,
            qty: u.qty,
            barcode: u.barcode || null,
            serialNumber: u.serialNumber || null,
          }));
        }
        return [
          {
            ...base,
            qty: Number(r.qty),
            barcode: r.barcode || null,
            serialNumber: r.serialNumber || null,
          },
        ];
      })
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
      if (isReturnCustomer) {
        const it = itemOf(d.itemId) as any;
        if (!it?.isFinishGood) {
          setError(`Item ${it?.code ?? d.itemId} bukan finish good — hanya finish good bisa di-return.`);
          return;
        }
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
        referenceType: isReturnCustomer ? "RETURN_CUSTOMER" : null,
        referenceId: isReturnCustomer ? form.customerId : null,
        description: form.description?.trim() ? form.description.trim() : null,
        customerId: isReturnCustomer ? form.customerId : null,
        details,
      } as any);
      onSaved?.(selectedType?.name ?? form.typeId);
      setSaved(true);
      setSnapshot(serialize());
      setSaving(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  const itemOf = (id: string) => items.find((i) => i.id === id);
  const selectedType = types.find((t) => t.id === form.typeId);
  const kind = selectedType?.kind;
  const isReturnCustomer = selectedType?.code === "RETURN_CUSTOMER";
  const returWarehouses = warehouses.filter((w) => w.code.includes("RET"));
  const filteredItems = isReturnCustomer ? (items as any[]).filter((i: any) => i.isFinishGood) : items;

  const handleTypeChange = (typeId: string) => {
    setForm((prev) => ({ ...prev, typeId }));
    const nextType = types.find((t) => t.id === typeId);
    const nextKind = nextType?.kind;
    if (nextType?.code === "RETURN_CUSTOMER") {
      // Return: receipt to retur warehouse, need customer
      const returWh = warehouses.find((w) => w.code.includes("RET"))?.id ?? "";
      if (returWh) setToDefault(returWh);
      setFromDefault("");
    } else if (nextKind === "RECEIPT") {
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
      titleBadge={displayBadge}
      className={className}
      tabs={effectiveTabs}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {onCancel && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? "..." : onAmend ? "Amend" : "Cancel"}
            </Button>
          )}
          {!readOnly && (
            <Button variant="primary" size="sm" className="h-7 px-2.5 text-xs" onClick={save} disabled={saving}>
              {saving ? "Saving..." : saved && onPost && !dirty ? "Submit" : submitLabel}
            </Button>
          )}
        </div>
      }
    >
      {showScans ? (
        scanHistory.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-foreground">Belum ada scan history</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Scan barcode di tab Details untuk melihat history.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">No.</th>
                    <th className="px-4 py-2.5 font-semibold">Barcode</th>
                    <th className="px-3 py-2.5 font-semibold">Batch</th>
                    <th className="px-3 py-2.5 font-semibold">Item Code</th>
                    <th className="px-3 py-2.5 font-semibold">Serial</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {scanHistory.slice().reverse().map((h, idx) => {
                    const qtyFromRow = (() => {
                      const row = rows.find((r) => r.barcode === h.barcode || r.units?.some((u) => u.barcode === h.barcode));
                      if (row?.units) {
                        const u = row.units.find((uu) => uu.barcode === h.barcode);
                        if (u) return String(u.qty);
                      }
                      return row ? row.qty : "1";
                    })();
                    return (
                      <tr key={h.key} className="hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{scanHistory.length - idx}</td>
                        <td className="break-all px-4 py-2.5 font-mono text-xs text-foreground">{h.barcode}</td>
                        <td className="break-all px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">{h.batch || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px] font-medium text-foreground">{h.itemCode || "—"}</td>
                        <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">{h.serial || "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold tabular-nums text-foreground">{qtyFromRow}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <FormSection className="pb-0">
          <FormGrid>
            <div className="flex flex-col gap-5">
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
              {!readOnly && (
                <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground">
                  <Checkbox
                    checked={editPostingDate}
                    onCheckedChange={(v) => setEditPostingDate(v === true)}
                  />
                  Edit posting date
                </label>
              )}
            </div>
            <div className="flex flex-col gap-5">
              <DatePicker
                label="Date"
                value={form.movementDate}
                disabled={!editPostingDate || readOnly}
                onChange={(v) => setForm({ ...form, movementDate: v })}
              />
              <TimePicker
                label="Time"
                value={form.movementTime}
                disabled={!editPostingDate || readOnly}
                onChange={(v) => setForm({ ...form, movementTime: v })}
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
                {(isReturnCustomer ? returWarehouses.length ? returWarehouses : warehouses : warehouses).map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
            {isReturnCustomer && (
              <>
                <div>
                  <Select
                    label="Customer *"
                    value={form.customerId}
                    onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                    disabled={readOnly}
                  >
                    <option value="">Select customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium leading-none">Receipt / Keterangan</label>
                  <Input
                    placeholder="No. receipt / keterangan return"
                    value={form.description}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </>
            )}
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
                ref={scanInputRef}
                value={scanInput}
                disabled={readOnly}
                onChange={(e) => {
                  const isPaste =
                    (e.nativeEvent as InputEvent).inputType === "insertFromPaste" ||
                    (e.nativeEvent as InputEvent).inputType === "insertFromDrop";
                  setScanInput(e.target.value);
                  if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                  if (isPaste) {
                    if (e.target.value.trim()) void handleScanned(e.target.value);
                  } else {
                    scanTimerRef.current = setTimeout(() => {
                      const v = scanInputRef.current?.value ?? "";
                      if (v.trim()) void handleScanned(v);
                    }, 1000);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
                    void handleScanned(scanInput);
                  }
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

          {scanHistory.length > 0 && (
            <div>
              <div className="mb-2">
                <span className="text-[13px] font-medium text-foreground">Last barcode</span>
              </div>
              <div className="overflow-hidden rounded-md border border-border bg-zinc-100 dark:bg-muted/40">
                <div className="max-h-[280px] overflow-y-auto">
                  {scanHistory.slice(-10).reverse().map((h) => (
                    <div
                      key={h.key}
                      className="break-all border-b border-border/60 bg-card px-3 py-1.5 font-mono text-[11.5px] text-foreground last:border-0 even:bg-zinc-50 dark:even:bg-muted/20"
                    >
                      {h.barcode}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

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
                    {visibleCols.rate && kind === "RECEIPT" && <TableHead className="w-[140px] px-4 text-right">Rate</TableHead>}
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
                            options={filteredItems.map((i) => ({
                              value: i.id,
                              label: `${i.name}: ${i.code}${(i as any).isFinishGood ? "" : ""}`,
                            }))}
                            placeholder={isReturnCustomer ? "Finish good only" : ""}
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
                          {!readOnly && r.batchNumber.trim() && (
                            <BatchHint
                              number={r.batchNumber}
                              formats={batchFormats}
                              item={r.itemId ? itemOf(r.itemId) ?? null : null}
                            />
                          )}
                        </TableCell>
                      )}
                      {visibleCols.rate && kind === "RECEIPT" && (
                        <TableCell className="px-4 text-right">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={r.incomingRate ?? ""}
                            placeholder="0.00"
                            disabled={readOnly}
                            ref={registerCell(`${r.key}:rate`)}
                            onChange={(e) => setRow(r.key, { incomingRate: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Tab") {
                                e.preventDefault();
                                tabNext(r.key, "rate");
                              }
                            }}
                            className="h-8 w-full min-w-[90px] border-none bg-transparent px-1 text-right font-mono text-sm text-foreground focus:outline-none focus:ring-0 disabled:opacity-100"
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
                    incomingRate: "",
                  })
                }
              >
                <Plus size={13} strokeWidth={2} />
                Add row
              </Button>
            )}
          </div>
        )}

        </FormSection>
      </div>
      </div>
      )}

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

/** Hint live hasil parse batch number — dipakai di kolom Batch. */
function BatchHint({
  number,
  formats,
  item,
}: {
  number: string;
  formats: BatchFormat[];
  item: Item | null;
}) {
  const parsed = parseBatchNumber(number, formats);
  if (!parsed) return null;
  const parts: string[] = [];
  if (parsed.productionDate) parts.push(parsed.productionDate);
  if (parsed.shift) parts.push(`shift ${parsed.shift}`);
  for (const [k, v] of Object.entries(parsed.meta)) parts.push(`${k} ${v}`);

  const mismatch =
    parsed.alternativeCode &&
    item?.alternativeCode &&
    parsed.alternativeCode.trim().toLowerCase() !==
      item.alternativeCode.trim().toLowerCase();

  return (
    <p
      className={cx(
        "mt-0.5 truncate text-[10px]",
        mismatch ? "font-medium text-red-600" : "text-sky-600"
      )}
      title={mismatch ? `Kode alternatif batch (${parsed.alternativeCode}) tidak cocok dengan item (${item?.alternativeCode}).` : undefined}
    >
      {parts.join(" · ")}
      {mismatch && ` · alt ${parsed.alternativeCode} ≠ ${item?.alternativeCode}`}
    </p>
  );
}