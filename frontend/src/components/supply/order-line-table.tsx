import { Plus, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useItemsList, useUoms, useLastPurchasePrices, usePriceListLines } from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { TableInput } from "@/components/ui/table-input";
import { cn, formatNumber } from "@/lib/utils";

const CURRENCY_SYMBOLS: Record<string, string> = {
  IDR: "Rp",
  USD: "$",
  EUR: "€",
  SGD: "S$",
  JPY: "¥",
  CNY: "¥",
  MYR: "RM",
  THB: "฿",
  AUD: "A$",
};
function currencySymbol(cur?: string | null): string {
  if (!cur) return "Rp";
  return CURRENCY_SYMBOLS[cur.toUpperCase()] ?? cur.toUpperCase();
}
function convertFromBase(price: string | number | null | undefined, currency: string | undefined, exchangeRate: string | undefined, baseCurrency: string | undefined): string {
  if (price == null || price === "") return "";
  const n = Number(price);
  if (!Number.isFinite(n)) return String(price);
  if (!currency || !baseCurrency || currency.toUpperCase() === baseCurrency.toUpperCase()) return String(n);
  const rate = Number(exchangeRate || 1);
  if (!Number.isFinite(rate) || rate === 0) return String(n);
  // price list assumed in baseCurrency -> convert to selected currency
  const converted = n / rate;
  // keep 2 decimals for non-IDR, 0 for IDR
  return String(converted);
}

function PoTableSelect({
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
  useEffect(() => setHighlight(0), [filtered]);
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
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);
  const pick = (o: { value: string; label: string }) => {
    onChange(o.value);
    setQuery("");
    setOpen(false);
  };
  return (
    <div ref={wrapRef} className="relative min-w-[100px]">
      <input
        ref={inputRef}
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
          } else if (e.key === "Escape") setOpen(false);
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
                    {o.value === value && <Check size={13} strokeWidth={2.5} className="shrink-0 text-primary" />}
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

export interface OrderLineInput {
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice: string;
  discount?: string;
  batchNumber: string;
  note: string;
  deliveryDate?: string;
}

export function emptyOrderLine(): OrderLineInput {
  return {
    itemId: "",
    uomId: "",
    qty: "",
    unitPrice: "",
    discount: "",
    batchNumber: "",
    note: "",
    deliveryDate: "",
  };
}

export function OrderLineTable({
  value,
  onChange,
  readOnly = false,
  headerDeliveryDate,
  currency,
  exchangeRate,
  baseCurrency,
  priceListId,
  supplierId,
}: {
  value: OrderLineInput[];
  onChange: (next: OrderLineInput[]) => void;
  readOnly?: boolean;
  headerDeliveryDate?: string;
  currency?: string;
  exchangeRate?: string;
  baseCurrency?: string;
  priceListId?: string | null;
  supplierId?: string | null;
}) {
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
  const itemIds = value.map((r) => r.itemId).filter(Boolean) as string[];
  const { data: lastPrices = {} } = useLastPurchasePrices(itemIds);
  const { data: priceListLines = [] } = usePriceListLines(priceListId || undefined);
  const priceMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const pl of priceListLines as any[]) {
      // prefer matching supplier, fallback to any
      const key = String(pl.itemId);
      if (!m.has(key)) m.set(key, String(pl.unitPrice ?? ""));
      // if supplier matches, override
      if (supplierId && String((pl as any).supplierId) === String(supplierId)) {
        m.set(key, String(pl.unitPrice ?? ""));
      }
    }
    return m;
  }, [priceListLines, supplierId]);

  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.code}: ${i.name}` }));
  const uomOptions = uoms.map((u) => ({ value: u.id, label: u.name }));

  const [selected, setSelected] = useState<Set<number>>(new Set());

  const setRow = (idx: number, patch: Partial<OrderLineInput>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => onChange([...value, { ...emptyOrderLine(), deliveryDate: headerDeliveryDate ?? "" }]);

  // Link per-line deliveryDate with header date
  const effectiveValue = headerDeliveryDate
    ? value.map((r) => ({ ...r, deliveryDate: r.deliveryDate || headerDeliveryDate }))
    : value;

  const cur = currency || baseCurrency || "IDR";
  const curSym = currencySymbol(cur);
  const rateHeader = `Rate`;
  const lastRateHeader = `Last Order Rate`;

  const calcAmount = (r: OrderLineInput) => {
    const qty = Number(r.qty || 0);
    const price = Number(r.unitPrice || 0);
    const amt = qty * price;
    return amt > 0 ? amt : 0;
  };

  // Auto-fill Rate from price list when item selected or priceList/currency changes
  const prevPriceListIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!priceListId || priceMap.size === 0) {
      prevPriceListIdRef.current = priceListId;
      return;
    }
    // If priceListId just changed, update all rows that have itemId and no manual price or price from old list
    if (prevPriceListIdRef.current !== priceListId) {
      const next = value.map((r) => {
        if (!r.itemId) return r;
        const basePrice = priceMap.get(String(r.itemId));
        if (basePrice == null || basePrice === "") return r;
        const converted = convertFromBase(basePrice, currency, exchangeRate, baseCurrency);
        // Only auto-fill if current unitPrice is empty or equals previous price list price
        // For simplicity, fill if empty
        if (!r.unitPrice) return { ...r, unitPrice: converted };
        return r;
      });
      const changed = next.some((r, i) => r.unitPrice !== value[i].unitPrice);
      if (changed) onChange(next);
    }
    prevPriceListIdRef.current = priceListId;
  }, [priceListId, priceMap, currency, exchangeRate, baseCurrency]);

  const allChecked = effectiveValue.length > 0 && selected.size === effectiveValue.length;
  const someChecked = selected.size > 0 && selected.size < effectiveValue.length;

  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(effectiveValue.map((_, i) => i)));
    else setSelected(new Set());
  };
  const toggleRow = (idx: number, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(idx);
    else next.delete(idx);
    setSelected(next);
  };

  if (readOnly) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="overflow-x-auto">
          <Table className="min-w-[1120px] table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th]:last:border-r-0 [&_td]:last:border-r-0">
            <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-8 px-2 text-center">
                  <Checkbox checked={false} disabled aria-label="select all" />
                </TableHead>
              <TableHead className="w-10 px-3 text-center">No</TableHead>
              <TableHead className="px-3 min-w-[180px]">Item Code</TableHead>
              <TableHead className="w-[70px] px-2 text-right">Qty</TableHead>
              <TableHead className="w-[80px] px-2">UOM</TableHead>
              <TableHead className="w-[175px] px-3 text-right">{rateHeader}</TableHead>
              <TableHead className="w-[175px] px-3 text-right">{lastRateHeader}</TableHead>
              <TableHead className="w-[185px] px-3 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {effectiveValue.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No lines.
                </TableCell>
              </TableRow>
            ) : (
              effectiveValue.map((r, idx) => {
                const item = items.find((i) => i.id === r.itemId);
                const uom = uoms.find((u) => u.id === r.uomId);
                const lastRaw = r.itemId ? (lastPrices as Record<string, string | null>)[r.itemId] : null;
                const lastConverted = lastRaw ? convertFromBase(lastRaw, currency, exchangeRate, baseCurrency) : null;
                const amount = calcAmount(r);
                return (
                  <TableRow key={idx} className="border-border/70 hover:bg-transparent data-[state=selected]:bg-muted">
                    <TableCell className="px-2 text-center">
                      <Checkbox checked={selected.has(idx)} onCheckedChange={(v) => toggleRow(idx, !!v)} aria-label={`select row ${idx + 1}`} />
                    </TableCell>
                    <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="px-3">{item ? `${item.code}: ${item.name}` : "—"}</TableCell>
                    <TableCell className="px-2 text-right tabular-nums">{r.qty ? formatNumber(r.qty) : "0"}</TableCell>
                    <TableCell className="px-2 tabular-nums">{uom?.name ?? "UOM"}</TableCell>
                    <TableCell className="p-0">
                      <div className="flex items-center justify-between gap-2 px-3">
                        <span className="text-[13px] font-medium tracking-wide text-muted-foreground">{curSym}</span>
                        <span className="text-[13px] tabular-nums text-right">{r.unitPrice ? formatNumber(r.unitPrice) : "0"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="p-0">
                      <div className="flex items-center justify-between gap-2 px-3">
                        <span className="text-[13px] font-medium tracking-wide text-muted-foreground">{curSym}</span>
                        <span className="text-[13px] tabular-nums text-right text-muted-foreground">{lastConverted ? formatNumber(lastConverted) : "0"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="p-0">
                      <div className="flex items-center justify-between gap-2 px-3">
                        <span className="text-[13px] font-medium tracking-wide text-muted-foreground">{curSym}</span>
                        <span className="text-[13px] tabular-nums text-right font-medium">{formatNumber(amount)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <Table className="min-w-[1120px] table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th]:last:border-r-0 [&_td]:last:border-r-0">
          <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-8 px-2 text-center">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="select all"
                />
              </TableHead>
              <TableHead className="w-10 px-3 text-center">No</TableHead>
              <TableHead className="min-w-[200px] px-3">Item Code</TableHead>
              <TableHead className="w-[70px] px-2 text-right">Qty</TableHead>
              <TableHead className="w-[80px] px-2">UOM</TableHead>
              <TableHead className="w-[175px] px-3 text-right">{rateHeader}</TableHead>
              <TableHead className="w-[175px] px-3 text-right">{lastRateHeader}</TableHead>
              <TableHead className="w-[185px] px-3 text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {effectiveValue.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No lines yet — add a row below.
                </TableCell>
              </TableRow>
            ) : (
              effectiveValue.map((r, idx) => {
                const lastRaw = r.itemId ? (lastPrices as Record<string, string | null>)[r.itemId] : null;
                const last = lastRaw ? convertFromBase(lastRaw, currency, exchangeRate, baseCurrency) : null;
                const amount = calcAmount(r);
                return (
                  <TableRow key={idx} className="border-border/70 hover:bg-transparent data-[state=selected]:bg-muted" data-state={selected.has(idx) ? "selected" : undefined}>
                    <TableCell className="px-2 text-center">
                      <Checkbox checked={selected.has(idx)} onCheckedChange={(v) => toggleRow(idx, !!v)} aria-label={`select row ${idx + 1}`} />
                    </TableCell>
                    <TableCell className="px-3 text-center text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="px-3">
                      <PoTableSelect
                        placeholder="Select item..."
                        options={itemOptions}
                        value={r.itemId}
                        onChange={(v) => {
                          const item = items.find((i) => i.id === v);
                          const basePrice = priceMap.get(String(v));
                          const converted = basePrice ? convertFromBase(basePrice, currency, exchangeRate, baseCurrency) : undefined;
                          setRow(idx, {
                            itemId: v,
                            uomId: item?.uomId ?? r.uomId,
                            ...(converted !== undefined ? { unitPrice: converted } : {}),
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      <TableInput value={r.qty} onChange={(v) => setRow(idx, { qty: v })} columnTitle="Qty" isNumeric />
                    </TableCell>
                    <TableCell className="px-2 tabular-nums">
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          const uom = uoms.find((u) => u.id === r.uomId);
                          if (uom) return uom.name;
                          const it = items.find((i) => i.id === r.itemId);
                          const itUom = it ? uoms.find((u) => u.id === (it as any).uomId) : null;
                          return itUom?.name ?? "UOM";
                        })()}
                      </span>
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      <TableInput value={r.unitPrice} onChange={(v) => setRow(idx, { unitPrice: v })} columnTitle={rateHeader} isNumeric currency={curSym} />
                    </TableCell>
                    <TableCell className="p-0">
                      <div className="flex items-center justify-between gap-2 px-3">
                        <span className="text-[13px] font-medium tracking-wide text-muted-foreground">{curSym}</span>
                        <span className="text-[13px] tabular-nums text-right text-muted-foreground">{last ? formatNumber(last) : "0"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="p-0">
                      <div className="flex items-center justify-between gap-2 px-3">
                        <span className="text-[13px] font-medium tracking-wide text-muted-foreground">{curSym}</span>
                        <span className="text-[13px] tabular-nums text-right font-medium">{formatNumber(amount)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-border p-3">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2.5 text-xs"
          onClick={addRow}
        >
          <Plus size={13} strokeWidth={2} />
          Add Row
        </Button>
      </div>
    </div>
  );
}
