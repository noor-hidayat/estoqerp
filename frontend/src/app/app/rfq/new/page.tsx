import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import {
  useAllWarehouses,
  useBranches,
  useUoms,
  useItemsList,
  useSuppliers,
  usePurchaseRequests,
  usePurchaseRequest,
  useCreateRfq,
  useCompanySettings,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useErrorToast } from "@/hooks/use-error-toast";

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

interface RfqLineInput {
  itemId: string;
  uomId: string;
  qty: string;
  note: string;
}

export default function NewRfqPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prIdParam = searchParams.get("prId");
  const { data: pr } = usePurchaseRequest(prIdParam || undefined);
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
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
  const [lines, setLines] = useState<RfqLineInput[]>([{ itemId: "", uomId: "", qty: "", note: "" }]);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

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
            qty: l.qty,
            note: l.note ?? "",
          }))
        );
      }
    }
  }, [pr, prIdParam]);

  useEffect(() => {
    if (!form.warehouseId && warehouses.length) setForm((f) => ({ ...f, warehouseId: warehouses[0].id }));
  }, [warehouses, form.warehouseId]);

  // auto fill uom when item selected
  const itemOptions = items.map((i: any) => ({ value: i.id, label: `${i.code}: ${i.name}` }));
  const uomName = (id: string) => uoms.find((u) => u.id === id)?.name ?? "UOM";

  const setLine = (idx: number, patch: Partial<RfqLineInput>) => {
    setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const toggleSupplier = (id: string, checked: boolean) => {
    setSelectedSuppliers((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const submit = async () => {
    if (!form.warehouseId) return setErr("Warehouse wajib.");
    if (!form.requestDate) return setErr("Request date wajib.");
    const valid = lines.filter((l) => l.itemId && l.uomId && l.qty);
    if (valid.length === 0) return setErr("Minimal 1 line dengan item, uom, qty.");
    for (const l of valid) if (Number(l.qty) <= 0) return setErr("Qty harus >0");
    if (selectedSuppliers.length === 0) return setErr("Pilih minimal 1 supplier.");
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
        supplierIds: selectedSuppliers,
      });
      navigate(`/app/rfq/${(res as any).id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create RFQ");
    }
  };

  const prOptions = (prs as any[]).filter((p) => ["APPROVED", "POSTED"].includes(String(p.status).toUpperCase())).map((p) => ({ value: p.id, label: `${p.documentNo ?? p.prNo ?? p.id} - ${p.requestDate}` }));

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
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

        <FormSection title="Items (tanpa harga)">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-zinc-100">
                <TableRow>
                  <TableHead className="w-10 text-center">No</TableHead>
                  <TableHead>Item Code</TableHead>
                  <TableHead className="w-24">UOM</TableHead>
                  <TableHead className="w-28 text-right">Qty</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-center text-sm">{idx + 1}</TableCell>
                    <TableCell className="p-0 border-r">
                      <SearchableSelect
                        value={l.itemId}
                        onChange={(v) => {
                          const it = (items as any[]).find((x) => x.id === v);
                          setLine(idx, { itemId: v, uomId: it?.uomId ?? l.uomId });
                        }}
                        options={itemOptions}
                        placeholder="Select item..."
                      />
                    </TableCell>
                    <TableCell className="text-xs">{uomName(l.uomId) ?? l.uomId ?? "—"}</TableCell>
                    <TableCell className="p-0 border-r">
                      <TableInput value={l.qty} onChange={(v) => setLine(idx, { qty: v })} columnTitle="Qty" isNumeric />
                    </TableCell>
                    <TableCell className="p-0">
                      <TableInput value={l.note} onChange={(v) => setLine(idx, { note: v })} columnTitle="Note" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}>
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="border-t p-3">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLines((prev) => [...prev, { itemId: "", uomId: "", qty: "", note: "" }])}>
                <Plus size={14} /> Add Item
              </Button>
            </div>
          </div>
        </FormSection>

        <FormSection title="Invite Suppliers (min 1)">
          <div className="rounded-lg border p-4">
            <div className="flex flex-wrap gap-2">
              {selectedSuppliers.map((sid) => {
                const s = (suppliers as any[]).find((x) => x.id === sid);
                return (
                  <Badge key={sid} variant="secondary" className="gap-1">
                    {s?.name ?? sid}
                    <button type="button" onClick={() => toggleSupplier(sid, false)} className="ml-1">
                      ×
                    </button>
                  </Badge>
                );
              })}
            </div>
            <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto">
              {(suppliers as any[]).map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <Checkbox checked={selectedSuppliers.includes(s.id)} onCheckedChange={(v) => toggleSupplier(s.id, !!v)} />
                  <span className="font-medium">{s.code}</span>
                  <span>{s.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{s.phone ?? ""}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Supplier terpilih akan mendapatkan dokumen RFQ terpisah saat Print (1 halaman per supplier).</p>
          </div>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
