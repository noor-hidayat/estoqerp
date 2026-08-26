"use client";

import { Plus, Trash2 } from "lucide-react";
import { useItemsList, useUoms } from "@/lib/api/query";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface OrderLineInput {
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice: string;
  batchNumber: string;
  note: string;
}

export function emptyOrderLine(): OrderLineInput {
  return {
    itemId: "",
    uomId: "",
    qty: "",
    unitPrice: "",
    batchNumber: "",
    note: "",
  };
}

export function OrderLineTable({
  value,
  onChange,
  readOnly = false,
}: {
  value: OrderLineInput[];
  onChange: (next: OrderLineInput[]) => void;
  readOnly?: boolean;
}) {
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();

  const itemOptions = items.map((i) => ({ value: i.id, label: i.name }));
  const uomOptions = uoms.map((u) => ({ value: u.id, label: u.name }));

  const setRow = (idx: number, patch: Partial<OrderLineInput>) => {
    onChange(value.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addRow = () => onChange([...value, emptyOrderLine()]);

  const removeRow = (idx: number) =>
    onChange(value.filter((_, i) => i !== idx));

  if (readOnly) {
    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table className="text-[13px]">
          <TableHeader className="bg-muted/40 [&_tr]:border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="px-3">#</TableHead>
              <TableHead className="px-3">Item</TableHead>
              <TableHead className="px-3">UOM</TableHead>
              <TableHead className="px-3 text-right">Qty</TableHead>
              <TableHead className="px-3 text-right">Unit Price</TableHead>
              <TableHead className="px-3">Batch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {value.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No lines.
                </TableCell>
              </TableRow>
            ) : (
              value.map((r, idx) => {
                const item = items.find((i) => i.id === r.itemId);
                const uom = uoms.find((u) => u.id === r.uomId);
                return (
                  <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                    <TableCell className="px-3 text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="px-3">{item?.name ?? "—"}</TableCell>
                    <TableCell className="px-3">{uom?.name ?? "—"}</TableCell>
                    <TableCell className="px-3 text-right">{r.qty}</TableCell>
                    <TableCell className="px-3 text-right">{r.unitPrice || "—"}</TableCell>
                    <TableCell className="px-3">{r.batchNumber || "—"}</TableCell>
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
        <Table className="min-w-[820px] text-[13px]">
          <TableHeader className="bg-muted/40 [&_tr]:border-border">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10 px-3">#</TableHead>
              <TableHead className="px-3">Item</TableHead>
              <TableHead className="w-[150px] px-3">UOM</TableHead>
              <TableHead className="w-[110px] px-3 text-right">Qty</TableHead>
              <TableHead className="w-[120px] px-3 text-right">Unit Price</TableHead>
              <TableHead className="w-[120px] px-3">Batch</TableHead>
              <TableHead className="w-[140px] px-3">Note</TableHead>
              <TableHead className="w-10 px-3" />
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {value.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No lines yet — add a row below.
                </TableCell>
              </TableRow>
            ) : (
              value.map((r, idx) => (
                <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                  <TableCell className="px-3 text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="px-3">
                    <SearchableSelect
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
                    <SearchableSelect
                      placeholder="UOM..."
                      options={uomOptions}
                      value={r.uomId}
                      onChange={(v) => setRow(idx, { uomId: v })}
                    />
                  </TableCell>
                  <TableCell className="px-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      className="text-right"
                      value={r.qty}
                      onChange={(e) => setRow(idx, { qty: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="px-3 text-right">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="text-right"
                      value={r.unitPrice}
                      onChange={(e) => setRow(idx, { unitPrice: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="px-3">
                    <Input
                      placeholder="—"
                      value={r.batchNumber}
                      onChange={(e) => setRow(idx, { batchNumber: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="px-3">
                    <Input
                      placeholder="—"
                      value={r.note}
                      onChange={(e) => setRow(idx, { note: e.target.value })}
                    />
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
              ))
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
