import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useAllWarehouses,
  useCreateReceiving,
  usePurchaseOrder,
  usePurchaseOrders,
  useSuppliers,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { TableInput } from "@/components/ui/table-input";
import { type OrderLineInput } from "@/modules/purchasing/components/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId, formatNumber } from "@/lib/utils";
import { useItemsList } from "@/lib/api/query";

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

export default function NewReceivingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPoId = searchParams.get("purchaseOrderId") ?? "";
  const { data: pos = [], isLoading: posLoading } = usePurchaseOrders();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { data: suppliers = [] } = useSuppliers();
  const { data: items = [] } = useItemsList();
  const create = useCreateReceiving();
  const filteredPos = pos.filter((p) => {
    const s = String((p as any).status ?? "").toUpperCase();
    if (s === "CANCELED") return false;
    return true;
  });
  const [error, setError] = useState("");
  useErrorToast(error);

  const [poId, setPoId] = useState(initialPoId);
  const [warehouseId, setWarehouseId] = useState("");
  const [postingDate, setPostingDate] = useState(todayISO());
  const [postingTime, setPostingTime] = useState(nowTime());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<OrderLineInput[]>([]);

  // Sync when ?purchaseOrderId changes (e.g. navigasi dari PO Create → Purchase Receipt)
  useEffect(() => {
    if (initialPoId) setPoId(initialPoId);
  }, [initialPoId]);

  const { data: poDetail } = usePurchaseOrder(poId || undefined);
  const supplierIdForSelected = (poDetail as any)?.supplierId ?? pos.find((p) => p.id === poId)?.supplierId ?? "";

  useEffect(() => {
    if (poDetail) {
      setWarehouseId(poDetail.warehouseId);
      setLines(
        (poDetail.lines ?? []).map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: String(l.qty),
          unitPrice: l.unitPrice ?? "",
          batchNumber: l.batchNumber ?? "",
          note: l.note ?? "",
        }))
      );
    }
  }, [poDetail]);

  const doCreate = async (): Promise<string | null> => {
    if (!poId) {
      setError("Pilih No PO dulu.");
      return null;
    }
    if (!warehouseId) {
      setError("Gudang simpan wajib diisi.");
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
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) {
      setError("Tambah minimal satu item.");
      return null;
    }
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) {
        setError("Setiap item harus punya qty > 0.");
        return null;
      }
    }
    try {
      const res = await create.mutateAsync({
        purchaseOrderId: poId,
        warehouseId,
        receiptDate: postingDate,
        notes: notes.trim() || null,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: l.qty,
          unitPrice: l.unitPrice || null,
          batchNumber: l.batchNumber || null,
          note: l.note || null,
        })),
      });
      return (res as any).documentNo ?? (res as any).id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan receiving.");
      return null;
    }
  };

  const onSave = async () => {
    const docNo = await doCreate();
    if (docNo) navigate(`/app/receiving/${encodeURIComponent(docNo)}`, { replace: true });
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!create.isPending) onSave();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [poId, warehouseId, postingDate, postingTime, notes, lines, create.isPending]);

  if (posLoading || warehousesLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.receivings"]}>
        <FormSkeleton sections={[["half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.receivings"]}>
      <FormPage
        title="New Receiving"
        actions={
          <Button size="sm" onClick={onSave} disabled={create.isPending}>
            {create.isPending ? "Menyimpan…" : "Save"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <SearchableSelect
              label="Document"
              placeholder="Pilih purchase order..."
              options={filteredPos.map((p) => ({
                value: p.id,
                label: `${p.documentNo ?? p.poNo ?? formatId(p.id)} · ${p.status}`,
              }))}
              value={poId}
              onChange={(v) => setPoId(v)}
            />
            <DatePicker label="Posting Date" value={postingDate} onChange={(v) => setPostingDate(v)} />
            <div aria-hidden="true" />
            <TimePicker label="Posting Time" value={postingTime} onChange={(v) => setPostingTime(v)} />
            <SearchableSelect
              label="Supplier Name"
              placeholder={poId ? "Otomatis dari PO" : "Pilih PO dulu..."}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={supplierIdForSelected}
              onChange={() => {}}
              disabled
            />
            <SearchableSelect
              label="Target Warehouse"
              placeholder="Pilih gudang..."
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              value={warehouseId}
              onChange={(v) => setWarehouseId(v)}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea
                placeholder="Catatan opsional..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection title="Item dari PO">
          {!poId ? (
            <div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">Pilih No PO (status POST/SUBMIT) untuk menampilkan item.</p>
            </div>
          ) : lines.length === 0 ? (
            <div className="rounded-lg border border-border bg-card px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">PO tidak memiliki item.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <Table className="min-w-[800px] table-fixed border border-border border border-border text-left text-[13px]">
                  <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="w-10 px-3 text-center">No.</TableHead>
                      <TableHead className="min-w-[220px] px-3">Item</TableHead>
                      <TableHead className="w-[90px] px-3 text-right">Qty PO</TableHead>
                      <TableHead className="w-[110px] px-3 text-right">Qty Received</TableHead>
                      <TableHead className="w-[110px] px-3 text-right">Rate</TableHead>
                      <TableHead className="w-[130px] px-3 text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-border/70">
                    {lines.map((r, idx) => {
                      const item = items.find((i) => i.id === r.itemId);
                      const poLine = (poDetail as any)?.lines?.[idx] as { qty?: string } | undefined;
                      const qtyPo = poLine?.qty ?? r.qty ?? "";
                      const qtyReceived = r.qty;
                      const rate = r.unitPrice ?? "";
                      const amount = Number(qtyReceived || 0) * Number(rate || 0);
                      return (
                        <TableRow key={idx} className="border-border/70 hover:bg-transparent">
                          <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="px-3">
                            <span className="font-medium text-foreground">
                              {item ? `${item.code}: ${item.name}` : r.itemId || ""}
                            </span>
                          </TableCell>
                          <TableCell className="px-3 text-right tabular-nums text-muted-foreground">{qtyPo !== "" ? formatNumber(qtyPo) : "0"}</TableCell>
                          <TableCell className="p-0 border-r border-border">
                            <TableInput value={qtyReceived} onChange={(v) => setLines((prev) => prev.map((line, i) => (i === idx ? { ...line, qty: v } : line)))} columnTitle="Qty Received" isNumeric />
                          </TableCell>
                          <TableCell className="p-0">
                            <div className="flex items-center justify-between gap-2 px-3">
                              <span className="text-sm font-medium tracking-wide text-muted-foreground">Rp</span>
                              <span className="tabular-nums text-right">{rate ? formatNumber(Number(rate)) : "0"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="p-0">
                            <div className="flex items-center justify-between gap-2 px-3">
                              <span className="text-sm font-medium tracking-wide text-muted-foreground">Rp</span>
                              <span className="tabular-nums text-right font-medium">{formatNumber(amount)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="border-t border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                Tidak dapat menambahkan item atau baris — item diambil otomatis dari PO.
              </div>
            </div>
          )}
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
