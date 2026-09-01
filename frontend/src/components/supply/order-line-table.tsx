import { Plus, Trash2 } from "lucide-react";
import { useItemsList, useUoms, useLastPurchasePrices } from "@/lib/api/query";
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
import { formatNumber } from "@/lib/utils";

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
}: {
  value: OrderLineInput[];
  onChange: (next: OrderLineInput[]) => void;
  readOnly?: boolean;
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
              <TableHead className="px-3">Tgl Kirim</TableHead>
              <TableHead className="px-3 text-right">Qty</TableHead>
              <TableHead className="px-3 text-right">Last Price</TableHead>
              <TableHead className="px-3 text-right">Price</TableHead>
              <TableHead className="px-3 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr]:border-border/70">
            {value.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No lines.
                </TableCell>
              </TableRow>
            ) : (
              value.map((r, idx) => {
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
        <Table className="min-w-[960px] text-[13px]">
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
            {value.length === 0 ? (
              <TableRow className="border-border/70 hover:bg-transparent">
                <TableCell colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                  No lines yet — add a row below.
                </TableCell>
              </TableRow>
            ) : (
              value.map((r, idx) => {
                const last = r.itemId ? (lastPrices as Record<string, string | null>)[r.itemId] : null;
                const total = Number(r.qty || 0) * Number(r.unitPrice || 0);
                return (
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
                      <Input
                        type="date"
                        value={r.deliveryDate ?? ""}
                        onChange={(e) => setRow(idx, { deliveryDate: e.target.value })}
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
                      <span className="font-mono text-xs text-muted-foreground">
                        {last ? `Rp ${formatNumber(Number(last))}` : "—"}
                      </span>
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