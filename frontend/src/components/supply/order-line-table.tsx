import { Plus, Trash2, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useItemsList, useUoms, useLastPurchasePrices } from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatNumber } from "@/lib/utils";

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
}: {
  value: OrderLineInput[];
  onChange: (next: OrderLineInput[]) => void;
  readOnly?: boolean;
  headerDeliveryDate?: string;
}) {
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
  const itemIds = value.map((r) => r.itemId).filter(Boolean) as string[];
  const { data: lastPrices = {} } = useLastPurchasePrices(itemIds);

  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.code} — ${i.name}` }));
  const uomOptions = uoms.map((u) => ({ value: u.id, label: u.name }));

  const setRow = (idx: number, patch: Partial<OrderLineInput>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => onChange([...value, { ...emptyOrderLine(), deliveryDate: headerDeliveryDate ?? "" }]);

  const removeRow = (idx: number) =>
    onChange(value.filter((_, i) => i !== idx));

  // Link per-line deliveryDate with header date
  const effectiveValue = headerDeliveryDate
    ? value.map((r) => ({ ...r, deliveryDate: r.deliveryDate || headerDeliveryDate }))
    : value;

  if (readOnly) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="text-[13px]">
          <TableHeader className="bg-muted/40 [&_tr]:border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="px-3">#</TableHead>
              <TableHead className="px-3">Item</TableHead>
              <TableHead className="px-3">Tgl Kirim</TableHead>
              <TableHead className="px-3 text-right">Qty</TableHead>
              <TableHead className="px-3 text-right">Last Price</TableHead>
              <TableHead className="px-3 text-right">Price</TableHead>
              <TableHead className="px-3 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {effectiveValue.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No lines.
                </TableCell>
              </TableRow>
            ) : (
              effectiveValue.map((r, idx) => {
                const item = items.find((i) => i.id === r.itemId);
                const last = r.itemId ? (lastPrices as Record<string, string | null>)[r.itemId] : null;
                const total = Number(r.qty || 0) * Number(r.unitPrice || 0);
                return (
                  <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                    <TableCell className="px-3 text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="px-3">{item ? `${item.code} — ${item.name}` : "—"}</TableCell>
                    <TableCell className="px-3 text-muted-foreground">{r.deliveryDate || "—"}</TableCell>
                    <TableCell className="px-3 text-right font-mono">{r.qty || "—"}</TableCell>
                    <TableCell className="px-3 text-right font-mono text-muted-foreground">{last ? `Rp ${formatNumber(Number(last))}` : "—"}</TableCell>
                    <TableCell className="px-3 text-right font-mono">{r.unitPrice ? `Rp ${formatNumber(Number(r.unitPrice))}` : "—"}</TableCell>
                    <TableCell className="px-3 text-right font-mono font-semibold">{total ? `Rp ${formatNumber(total)}` : "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <Table className="min-w-[960px] table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border/60 [&_td]:border-r [&_td]:border-border/60 [&_th]:last:border-r-0 [&_td]:last:border-r-0">
          <TableHeader className="bg-muted/40 [&_tr]:border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10 px-3">#</TableHead>
              <TableHead className="min-w-[220px] px-3">Item</TableHead>
              <TableHead className="w-[150px] px-3">Tgl Kirim</TableHead>
              <TableHead className="w-[110px] px-3 text-right">Qty</TableHead>
              <TableHead className="w-[130px] px-3 text-right">Last Price</TableHead>
              <TableHead className="w-[130px] px-3 text-right">Price</TableHead>
              <TableHead className="w-[140px] px-3 text-right">Total</TableHead>
              <TableHead className="w-10 px-3" />
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
                const last = r.itemId ? (lastPrices as Record<string, string | null>)[r.itemId] : null;
                const total = Number(r.qty || 0) * Number(r.unitPrice || 0);
                return (
                  <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                    <TableCell className="px-3 font-mono text-sm text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="px-3">
                      <PoTableSelect
                        placeholder="Select item..."
                        options={itemOptions}
                        value={r.itemId}
                        onChange={(v) => {
                          const item = items.find((i) => i.id === v);
                          setRow(idx, {
                            itemId: v,
                            uomId: item?.uomId ?? r.uomId,
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="px-3">
                      <input
                        type="date"
                        value={r.deliveryDate ?? ""}
                        onChange={(e) => setRow(idx, { deliveryDate: e.target.value })}
                        className="h-8 w-full border-none bg-transparent px-1 text-sm text-foreground focus:outline-none focus:ring-0"
                      />
                    </TableCell>
                    <TableCell className="px-3">
                      <input
                        type="number"
                        min={0}
                        value={r.qty}
                        onChange={(e) => setRow(idx, { qty: e.target.value })}
                        className="h-8 w-full border-none bg-transparent px-1 text-right font-mono text-sm text-foreground focus:outline-none focus:ring-0"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="px-3 text-right">
                      <span className="font-mono text-xs text-muted-foreground">
                        {last ? `Rp ${formatNumber(Number(last))}` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="px-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={r.unitPrice}
                        onChange={(e) => setRow(idx, { unitPrice: e.target.value })}
                        className="h-8 w-full border-none bg-transparent px-1 text-right font-mono text-sm text-foreground focus:outline-none focus:ring-0"
                        placeholder="0.00"
                      />
                    </TableCell>
                    <TableCell className="px-3 text-right">
                      <span className="font-mono text-xs font-semibold">
                        {total ? `Rp ${formatNumber(total)}` : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="px-3">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => removeRow(idx)}
                        aria-label="Remove row"
                      >
                        <Trash2 size={14} strokeWidth={2} />
                      </Button>
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