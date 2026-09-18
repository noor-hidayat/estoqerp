// Tabel details Putaway — kolom: Checkbox | No | From Location | To Location |
// Item Code | UOM | Qty Putaway | Qty Outstanding.
// Mengikuti gaya tabel global (design.md §5): kolom pertama selalu Checkbox
// (header select-all, per-row checkbox, berlaku edit maupun readOnly),
// header bg-zinc-100, TableInput h-9 border-0 bg-transparent,
// SearchableSelect(table) di kolom From/To/Item Code.
// Qty Outstanding selalu readOnly (info dari GRN). Valuation Rate dihapus.

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useItemsList, useUoms } from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { formatNumber } from "@/lib/utils";
import { emptyPutawayLine, type PutawayLineInput } from "../putaway-types";

export function PutawayItemTable({
  value,
  onChange,
  getOutstanding,
  readOnly = false,
  locationOptions = [],
  fromDefault = "",
  toDefault = "",
}: {
  value: PutawayLineInput[];
  onChange: (next: PutawayLineInput[]) => void;
  /** Sisa qty (GRN - putaway lain); null = tanpa acuan (tampil "—"). */
  getOutstanding: (itemId: string) => number | null;
  readOnly?: boolean;
  /** Opsi location (dari sub warehouse header) untuk kolom From/To per baris. */
  locationOptions?: { value: string; label: string }[];
  /** Default header — dipakai untuk baris baru & fallback dok lama. */
  fromDefault?: string;
  /** Default header — dipakai untuk baris baru & fallback dok lama. */
  toDefault?: string;
}) {
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.code}: ${i.name}` }));
  const locationLabel = (id?: string) =>
    locationOptions.find((o) => o.value === id)?.label ?? "";

  const itemOf = (itemId: string) => items.find((i) => i.id === itemId);
  const uomName = (uomId: string, itemId: string) => {
    const direct = uoms.find((u) => u.id === uomId);
    if (direct) return direct.name;
    const item = itemOf(itemId);
    const fromItem = item ? uoms.find((u) => u.id === (item as any).uomId) : undefined;
    return fromItem?.name ?? "UOM";
  };

  const setRow = (idx: number, patch: Partial<PutawayLineInput>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const allChecked = value.length > 0 && selected.size === value.length;
  const someChecked = selected.size > 0 && selected.size < value.length;
  const toggleAll = (checked: boolean) => {
    if (checked) setSelected(new Set(value.map((_, i) => i)));
    else setSelected(new Set());
  };
  const toggleRow = (idx: number, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(idx);
    else next.delete(idx);
    setSelected(next);
  };

  const deleteSelected = () => {
    onChange(value.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <Table className="min-w-[1100px] table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th]:last:border-r-0 [&_td]:last:border-r-0">
          <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-8 px-2 text-center">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleAll(!!v)}
                  aria-label="select all"
                  disabled={value.length === 0}
                />
              </TableHead>
              <TableHead className="w-10 px-3 text-center">No</TableHead>
              <TableHead className="min-w-[180px] px-3">From Location</TableHead>
              <TableHead className="min-w-[180px] px-3">To Location</TableHead>
              <TableHead className="min-w-[220px] px-3">Item Code</TableHead>
              <TableHead className="w-[90px] px-3">UOM</TableHead>
              <TableHead className="w-[130px] px-3 text-right">Qty Putaway</TableHead>
              <TableHead className="w-[140px] px-3 text-right">Qty Outstanding</TableHead>
              {!readOnly && <TableHead className="w-12 px-2 text-center" />}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {value.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={readOnly ? 8 : 9} className="px-3 py-6 text-center text-muted-foreground">
                  No lines yet — use Get Item GRN, scan a barcode, or add a row.
                </TableCell>
              </TableRow>
            ) : (
              value.map((r, idx) => {
                const item = itemOf(r.itemId);
                const outstanding = r.itemId ? getOutstanding(r.itemId) : null;
                return (
                  <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                    <TableCell className="px-2 text-center">
                      <Checkbox
                        checked={selected.has(idx)}
                        onCheckedChange={(v) => toggleRow(idx, !!v)}
                        aria-label={`select row ${idx + 1}`}
                      />
                    </TableCell>
                    <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="p-0 border-r border-border">
                      {readOnly ? (
                        <div className="flex h-9 items-center px-3 text-[13px]">
                          {locationLabel(r.fromLocationId || fromDefault) || r.fromLocationId || fromDefault || "—"}
                        </div>
                      ) : (
                        <SearchableSelect
                          table
                          columnTitle="From Location"
                          placeholder=""
                          options={locationOptions.filter((o) => o.value !== (r.toLocationId || toDefault))}
                          value={r.fromLocationId || ""}
                          onChange={(v) => setRow(idx, { fromLocationId: v })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      {readOnly ? (
                        <div className="flex h-9 items-center px-3 text-[13px]">
                          {locationLabel(r.toLocationId || toDefault) || r.toLocationId || toDefault || "—"}
                        </div>
                      ) : (
                        <SearchableSelect
                          table
                          columnTitle="To Location"
                          placeholder=""
                          options={locationOptions.filter((o) => o.value !== (r.fromLocationId || fromDefault))}
                          value={r.toLocationId || ""}
                          onChange={(v) => setRow(idx, { toLocationId: v })}
                        />
                      )}
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      {readOnly ? (
                        <div className="flex h-9 items-center px-3 text-[13px]">
                          {item ? item.code : r.barcode || ""}
                        </div>
                      ) : (
                        <SearchableSelect
                          table
                          columnTitle="Item Code"
                          placeholder={r.barcode || "Item Code"}
                          options={itemOptions}
                          value={r.itemId}
                          onChange={(v) => {
                            const next = items.find((i) => i.id === v);
                            setRow(idx, { itemId: v, uomId: (next as any)?.uomId ?? r.uomId });
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-3 text-[13px] tabular-nums text-muted-foreground">
                      {uomName(r.uomId, r.itemId)}
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      {readOnly ? (
                        <div className="flex h-9 items-center justify-end px-3 text-right tabular-nums text-[13px]">
                          {r.qty ? formatNumber(r.qty) : "0"}
                        </div>
                      ) : (
                        <TableInput
                          value={r.qty}
                          onChange={(v) => setRow(idx, { qty: v })}
                          columnTitle="Qty Putaway"
                          isNumeric
                        />
                      )}
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      <div className="flex h-9 items-center justify-end px-3 text-right tabular-nums text-[13px] text-muted-foreground">
                        {outstanding == null ? "—" : formatNumber(outstanding)}
                      </div>
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="px-2 text-center">
                        <button
                          type="button"
                          aria-label={`Delete row ${idx + 1}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onChange(value.filter((_, i) => i !== idx))}
                        >
                          <Trash2 size={14} />
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {!readOnly && (
        <div className="border-t border-border p-3">
          {selected.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={deleteSelected}
            >
              <Trash2 size={13} strokeWidth={2} />
              Delete
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={() => onChange([...value, emptyPutawayLine({ fromLocationId: fromDefault, toLocationId: toDefault })])}
            >
              <Plus size={13} strokeWidth={2} />
              Add Row
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
