// Tabel item GRN — kolom: Checkbox | No | Item Code | Qty | UOM | Unit Price | Disc. | Amount.
// Mengikuti gaya tabel global (design.md §5): kolom pertama selalu Checkbox
// (header select-all, per-row checkbox, berlaku edit maupun readOnly),
// header bg-zinc-100, TableInput h-9 border-0 bg-transparent,
// SearchableSelect(table) di kolom Item Code.

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
import { emptyGrnLine, grnLineAmount, type GrnLineInput } from "../grn-types";

export function GrnItemTable({
  value,
  onChange,
  readOnly = false,
}: {
  value: GrnLineInput[];
  onChange: (next: GrnLineInput[]) => void;
  readOnly?: boolean;
}) {
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.code}: ${i.name}` }));
  const uomName = (uomId: string, itemId: string) => {
    const direct = uoms.find((u) => u.id === uomId);
    if (direct) return direct.name;
    const item = items.find((i) => i.id === itemId);
    const fromItem = item ? uoms.find((u) => u.id === (item as any).uomId) : undefined;
    return fromItem?.name ?? "UOM";
  };

  const setRow = (idx: number, patch: Partial<GrnLineInput>) => {
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
        <Table className="min-w-[940px] table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th]:last:border-r-0 [&_td]:last:border-r-0">
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
              <TableHead className="min-w-[220px] px-3">Item Code</TableHead>
              <TableHead className="w-[100px] px-3 text-right">Qty</TableHead>
              <TableHead className="w-[90px] px-3">UOM</TableHead>
              <TableHead className="w-[150px] px-3 text-right">Unit Price</TableHead>
              <TableHead className="w-[100px] px-3 text-right">Disc.</TableHead>
              <TableHead className="w-[160px] px-3 text-right">Amount</TableHead>
              {!readOnly && <TableHead className="w-12 px-2 text-center" />}
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {value.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={readOnly ? 8 : 9} className="px-3 py-6 text-center text-muted-foreground">
                  No lines yet — add a row below.
                </TableCell>
              </TableRow>
            ) : (
              value.map((r, idx) => {
                const amount = grnLineAmount(r);
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
                          {(() => {
                            const item = items.find((i) => i.id === r.itemId);
                            return item ? `${item.code}: ${item.name}` : "";
                          })()}
                        </div>
                      ) : (
                        <SearchableSelect
                          table
                          columnTitle="Item Code"
                          placeholder="Item Code"
                          options={itemOptions}
                          value={r.itemId}
                          onChange={(v) => {
                            const item = items.find((i) => i.id === v);
                            setRow(idx, { itemId: v, uomId: (item as any)?.uomId ?? r.uomId });
                          }}
                        />
                      )}
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
                          columnTitle="Qty"
                          isNumeric
                        />
                      )}
                    </TableCell>
                    <TableCell className="px-3 text-[13px] tabular-nums text-muted-foreground">
                      {uomName(r.uomId, r.itemId)}
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      {readOnly ? (
                        <div className="flex h-9 items-center justify-between gap-2 px-3">
                          <span className="text-[13px] font-medium tracking-wide text-muted-foreground">Rp</span>
                          <span className="text-[13px] tabular-nums text-right">
                            {r.unitPrice ? formatNumber(r.unitPrice) : "0"}
                          </span>
                        </div>
                      ) : (
                        <TableInput
                          value={r.unitPrice}
                          onChange={(v) => setRow(idx, { unitPrice: v })}
                          columnTitle="Unit Price"
                          isNumeric
                          currency="Rp"
                        />
                      )}
                    </TableCell>
                    <TableCell className="p-0 border-r border-border">
                      {readOnly ? (
                        <div className="flex h-9 items-center justify-end px-3 text-right tabular-nums text-[13px]">
                          {r.discount ? `${formatNumber(r.discount)}%` : "0%"}
                        </div>
                      ) : (
                        <TableInput
                          value={r.discount}
                          onChange={(v) => {
                            const n = Number(v);
                            if (v !== "" && (!Number.isFinite(n) || n < 0 || n > 100)) return;
                            setRow(idx, { discount: v });
                          }}
                          columnTitle="Disc."
                          isNumeric
                        />
                      )}
                    </TableCell>
                    <TableCell className="p-0">
                      <div className="flex h-9 items-center justify-between gap-2 px-3">
                        <span className="text-[13px] font-medium tracking-wide text-muted-foreground">Rp</span>
                        <span className="text-[13px] tabular-nums text-right font-medium">
                          {formatNumber(amount)}
                        </span>
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
              onClick={() => onChange([...value, emptyGrnLine()])}
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
