import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useAllWarehouses,
  useSuppliers,
  usePurchaseRequests,
  usePurchaseRequest,
  useCreateRfq,
  useCompanySettings,
} from "@/lib/api/query";
import { Plus, Trash2 } from "lucide-react";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect as TableSearchableSelect } from "@/components/ui/searchable-select";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatNumber } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : [];
  }, [options, q]);
  const selected = options.find((o) => o.value === value);
  return (
    <div className="relative">
      <input
        value={open ? q : selected?.label ?? ""}
        placeholder={placeholder}
        onFocus={() => {
          setQ("");
          setOpen(false);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          setOpen(v.trim().length > 0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow">
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              className="w-full px-3 py-2 text-left text-xs hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(o.value);
                setQ("");
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}



export default function NewRfqPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prIdParam = searchParams.get("prId");
  const { data: pr } = usePurchaseRequest(prIdParam || undefined);
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: suppliers = [] } = useSuppliers();
  const { data: prs = [] } = usePurchaseRequests();
  const create = useCreateRfq();
  const [err, setErr] = useState("");
  useErrorToast(err);
  const { data: company } = useCompanySettings();
  const baseCurrency = (company as any)?.baseCurrency ?? "IDR";

  const [form, setForm] = useState({
    warehouseId: "",
    purchaseRequestId: prIdParam ?? "",
    requestDate: todayISO(),
    quotationDeadline: "",
    expectedDate: "",
    notes: "",
    currency: baseCurrency,
    branchId: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([emptyOrderLine()]);
  // Supplier table: same UX as Items — default 1 empty row, typeable SearchableSelect inside table
  const [supplierRows, setSupplierRows] = useState<string[]>([""]);
  const [selectedSupplierRows, setSelectedSupplierRows] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (pr && prIdParam) {
      setForm((f) => ({
        ...f,
        warehouseId: pr.warehouseId ?? f.warehouseId,
        purchaseRequestId: pr.id,
        branchId: (pr as any).branchId ?? f.branchId,
      }));
      if (pr.lines && pr.lines.length) {
        setLines(
          pr.lines.map((l: any) => ({
            itemId: l.itemId,
            uomId: l.uomId,
            qty: String(l.qty),
            unitPrice: "",
            discount: "",
            batchNumber: "",
            note: l.note ?? "",
            deliveryDate: (l as any).deliveryDate ?? "",
          }))
        );
      }
    }
  }, [pr, prIdParam]);

  useEffect(() => {
    if (!form.warehouseId && warehouses.length) setForm((f) => ({ ...f, warehouseId: warehouses[0].id }));
  }, [warehouses, form.warehouseId]);

  const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);

  const supplierOptions = (suppliers as any[])
    .filter((s: any) => s.isActive !== false)
    .map((s: any) => ({
      value: s.id,
      label: s.code ? `${s.code} — ${s.name}` : s.name,
    }));

  const setSupplierRow = (idx: number, value: string) => {
    setSupplierRows((prev) => prev.map((v, i) => (i === idx ? value : v)));
  };
  const addSupplierRow = () => {
    setSupplierRows((prev) => [...prev, ""]);
  };
  const toggleSupplierRow = (idx: number, checked: boolean) => {
    setSelectedSupplierRows((prev) => {
      const next = new Set(prev);
      if (checked) next.add(idx);
      else next.delete(idx);
      return next;
    });
  };
  const toggleAllSupplierRows = (checked: boolean) => {
    if (checked) setSelectedSupplierRows(new Set(supplierRows.map((_, i) => i)));
    else setSelectedSupplierRows(new Set());
  };
  const deleteSelectedSupplierRows = () => {
    const next = supplierRows.filter((_, i) => !selectedSupplierRows.has(i));
    setSupplierRows(next.length ? next : [""]);
    setSelectedSupplierRows(new Set());
  };

  const submit = async () => {
    if (!form.warehouseId) return setErr("Warehouse wajib.");
    if (!form.requestDate) return setErr("Request date wajib.");
    const valid = lines.filter((l) => l.itemId && l.qty);
    if (valid.length === 0) return setErr("Minimal 1 line dengan item, qty.");
    for (const l of valid) if (Number(l.qty) <= 0) return setErr("Qty harus >0");
    const validSuppliers = supplierRows.map((s) => s.trim()).filter(Boolean);
    const uniqueSuppliers = [...new Set(validSuppliers)];
    if (validSuppliers.length === 0) return setErr("Pilih minimal 1 supplier.");
    if (uniqueSuppliers.length !== validSuppliers.length) return setErr("Supplier duplikat tidak diizinkan.");
    try {
      const res = await create.mutateAsync({
        warehouseId: form.warehouseId,
        purchaseRequestId: form.purchaseRequestId || null,
        requestDate: form.requestDate,
        quotationDeadline: form.quotationDeadline || null,
        expectedDate: form.expectedDate || null,
        notes: form.notes || null,
        currency: form.currency || baseCurrency,
        branchId: form.branchId || null,
        lines: valid.map((l) => ({ itemId: l.itemId, uomId: l.uomId, qty: l.qty, note: l.note || null })),
        supplierIds: uniqueSuppliers,
      });
      navigate(`/app/rfq/${(res as any).id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create RFQ");
    }
  };

  const prOptions = (prs as any[]).filter((p) => ["APPROVED", "POSTED"].includes(String(p.status).toUpperCase())).map((p) => ({ value: p.id, label: `${p.documentNo ?? p.prNo ?? p.id} - ${p.requestDate}` }));

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <FormPage
        title="New RFQ"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate("/app/rfq")}>
              Cancel
            </Button>
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <FormSection>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">PR Reference</label>
              {prIdParam ? (
                <div className="flex h-8 items-center rounded-md border bg-zinc-100 px-3 text-sm">{pr?.documentNo ?? prIdParam}</div>
              ) : (
                <SearchableSelect value={form.purchaseRequestId} onChange={(v) => setForm({ ...form, purchaseRequestId: v })} options={prOptions} placeholder="Select PR (optional)..." />
              )}
            </div>
            <Select label="Target Warehouse" value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })} className="h-8">
              <option value="">Select warehouse...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <DatePicker label="Posting Date" value={form.requestDate} onChange={(v) => setForm({ ...form, requestDate: v })} />
            <DatePicker label="Quotation Deadline" value={form.quotationDeadline} onChange={(v) => setForm({ ...form, quotationDeadline: v })} />
          </div>
          <div className="mt-6 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            <DatePicker label="Expected Delivery" value={form.expectedDate} onChange={(v) => setForm({ ...form, expectedDate: v })} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Currency</label>
              <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="h-8">
                <option value="IDR">IDR</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="SGD">SGD</option>
              </Select>
            </div>
          </div>
          <div className="mt-6">
            <label className="mb-1.5 block text-sm font-medium">Notes</label>
            <Textarea placeholder="Catatan untuk supplier..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </FormSection>

        <FormSection title="Lines">
          <OrderLineTable
            value={lines}
            onChange={setLines}
            currency={form.currency || baseCurrency}
            baseCurrency={baseCurrency}
            variant="rfq"
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input label="Total Quantity" value={formatNumber(totalQty)} disabled className="h-8 bg-zinc-100 text-sm" />
          </div>
        </FormSection>

        <FormSection title="Invite Suppliers (min 1)">
          <div className="overflow-hidden rounded-lg border border-border">
            <Table className="table-fixed border-collapse text-left text-[13px] [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th]:last:border-r-0 [&_td]:last:border-r-0">
              <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="w-8 px-2 text-center">
                    <Checkbox
                      checked={supplierRows.length > 0 && selectedSupplierRows.size === supplierRows.length ? true : selectedSupplierRows.size > 0 ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAllSupplierRows(!!v)}
                      aria-label="select all suppliers"
                    />
                  </TableHead>
                  <TableHead className="w-10 px-3 text-center">No</TableHead>
                  <TableHead className="px-3">Supplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="[&_tr]:border-border/70">
                {supplierRows.map((sid, idx) => {
                  const rowOptions = supplierOptions.filter((o) => !supplierRows.includes(o.value) || o.value === sid);
                  return (
                    <TableRow key={idx} className="border-border/70 hover:bg-transparent data-[state=selected]:bg-muted" data-state={selectedSupplierRows.has(idx) ? "selected" : undefined}>
                      <TableCell className="px-2 text-center">
                        <Checkbox checked={selectedSupplierRows.has(idx)} onCheckedChange={(v) => toggleSupplierRow(idx, !!v)} aria-label={`select supplier row ${idx + 1}`} />
                      </TableCell>
                      <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="p-0">
                        <TableSearchableSelect
                          table
                          value={sid}
                          onChange={(v) => setSupplierRow(idx, v)}
                          options={rowOptions}
                          placeholder="Ketik nama / kode supplier..."
                          columnTitle="Supplier"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="border-t border-border p-3">
              {selectedSupplierRows.size > 0 ? (
                <Button variant="destructive" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={deleteSelectedSupplierRows}>
                  <Trash2 size={13} strokeWidth={2} />
                  Delete
                </Button>
              ) : (
                <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={addSupplierRow}>
                  <Plus size={13} strokeWidth={2} />
                  Add Row
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Supplier terpilih akan mendapatkan dokumen RFQ terpisah saat Print (1 halaman per supplier). Ketik di kolom Supplier untuk mencari.</p>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
