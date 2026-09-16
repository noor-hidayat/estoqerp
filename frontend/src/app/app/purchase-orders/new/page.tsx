import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, ChevronDown, Briefcase, X, Check, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  useSuppliers,
  useBranches,
  useAllWarehouses,
  useUoms,
  useTaxCategories,
  usePriceLists,
  useCompanySettings,
  useExchangeRate,
  useCreatePurchaseOrder,
  useWorkflows,
} from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocMenu } from "@/components/ui/doc-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatNumber } from "@/lib/utils";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
const CURRENCY_SYMBOLS: Record<string, string> = { IDR: "Rp", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", CNY: "¥", MYR: "RM", THB: "฿", AUD: "A$" };
function sym(cur?: string | null): string {
  if (!cur) return "Rp";
  return CURRENCY_SYMBOLS[cur.toUpperCase()] ?? cur.toUpperCase();
}

function ChargeTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const options = [
    { value: "freight", label: "Freight" },
    { value: "handling", label: "Handling" },
    { value: "other", label: "Other" },
  ];
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
    return q ? options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : options;
  }, [query]);
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
        value={open ? query : (selected?.label ?? value ?? "")}
        placeholder="Type..."
        onFocus={() => {
          openList();
          setQuery("");
        }}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onChange(v.toLowerCase());
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
            if (match && open) {
              e.preventDefault();
              pick(match);
            }
          } else if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => {
          if (query && !selected) {
            onChange(query.toLowerCase());
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
                <p className="px-3 py-2.5 text-xs text-muted-foreground">No results — press Enter to use &quot;{query}&quot;</p>
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

export default function NewPurchaseOrderPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { data: suppliers = [], isLoading: suppliersLoading } = useSuppliers();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  // PO / pembelian hanya pakai parent warehouse (parentId == null)
  const parentWarehouses = useMemo(() => warehouses.filter((w: any) => !w.parentId), [warehouses]);
  const { data: branches = [] } = useBranches();
  const { isLoading: uomsLoading } = useUoms();
  const { data: taxCategories = [] } = useTaxCategories();
  const { data: priceLists = [] } = usePriceLists();
  const { data: company } = useCompanySettings();
  const { data: workflows = [] } = useWorkflows();
  const hasDefaultPO = useMemo(
    () => (workflows as any[]).some((w) => String(w.documentType).toUpperCase() === "PO" && !!w.isDefault && w.isActive !== false),
    [workflows]
  );
  const create = useCreatePurchaseOrder();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [needApprovalManuallySet, setNeedApprovalManuallySet] = useState(false);

  const [form, setForm] = useState({
    supplierId: "",
    warehouseId: "",
    orderDate: todayISO(),
    expectedDate: "",
    notes: "",
    department: "",
    costCenter: "",
    branchId: "",
    paymentTerms: "",
    priceListId: "",
    currency: "",
    exchangeRate: "1",
    allowEditOrderDate: false,
    qcRequired: true,
    needApproval: false,
    globalDiscountPercent: "0",
    additionalCharges: [] as { type: string; amount: string }[],
    taxRate: "0",
    taxCategoryId: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([emptyOrderLine()]);

  // default currency from company setting
  const baseCurrency = (company as any)?.baseCurrency ?? "IDR";
  const defaultCurrency = baseCurrency;
  const [currencyManuallySet, setCurrencyManuallySet] = useState(false);
  const [rateManuallyEdited, setRateManuallyEdited] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [selectedCharges, setSelectedCharges] = useState<Set<number>>(new Set());
  const allChargesChecked = form.additionalCharges.length > 0 && selectedCharges.size === form.additionalCharges.length;
  const someChargesChecked = selectedCharges.size > 0 && selectedCharges.size < form.additionalCharges.length;
  const toggleAllCharges = (checked: boolean) => {
    if (checked) setSelectedCharges(new Set(form.additionalCharges.map((_, i) => i)));
    else setSelectedCharges(new Set());
  };
  const toggleCharge = (idx: number, checked: boolean) => {
    const next = new Set(selectedCharges);
    if (checked) next.add(idx);
    else next.delete(idx);
    setSelectedCharges(next);
  };
  const deleteSelectedCharges = () => {
    setForm((f) => ({ ...f, additionalCharges: f.additionalCharges.filter((_, i) => !selectedCharges.has(i)) }));
    setSelectedCharges(new Set());
  };

  useEffect(() => {
    if (!currencyManuallySet && !form.currency && defaultCurrency) {
      setForm((f) => (f.currency ? f : { ...f, currency: defaultCurrency }));
    }
  }, [defaultCurrency, form.currency, currencyManuallySet]);

  // Need Approval default true jika ada workflow PO yang isDefault
  useEffect(() => {
    if (needApprovalManuallySet) return;
    // workflows already fetched (empty array means no default)
    const should = hasDefaultPO;
    setForm((f) => (f.needApproval === should ? f : { ...f, needApproval: should }));
  }, [hasDefaultPO, needApprovalManuallySet]);

  // auto-select first supplier/warehouse if hidden (fallback biar submit gak error)
  useEffect(() => {
    if (!form.supplierId && suppliers.length > 0) {
      setForm((f) => (f.supplierId ? f : { ...f, supplierId: suppliers[0].id }));
    }
  }, [suppliers, form.supplierId]);
  useEffect(() => {
    if (!form.warehouseId && parentWarehouses.length > 0) {
      setForm((f) => (f.warehouseId ? f : { ...f, warehouseId: parentWarehouses[0].id }));
    }
  }, [parentWarehouses, form.warehouseId]);

  const { data: rateData, isFetching: rateFetching } = useExchangeRate(
    form.currency && form.currency !== baseCurrency ? form.currency : undefined,
    form.currency && form.currency !== baseCurrency ? baseCurrency : undefined
  );

  useEffect(() => {
    if (rateData?.rate && !rateManuallyEdited && form.currency !== baseCurrency) {
      const fetched = String(rateData.rate);
      if (fetched !== form.exchangeRate) {
        setForm((f) => ({ ...f, exchangeRate: fetched }));
      }
    }
    if (form.currency === baseCurrency && form.exchangeRate !== "1" && !rateManuallyEdited) {
      setForm((f) => ({ ...f, exchangeRate: "1" }));
    }
  }, [rateData?.rate, rateManuallyEdited, form.currency, baseCurrency, form.exchangeRate]);

  const resetForm = () => {
    if (!confirm("Hapus semua isian form ini?")) return;
    setNeedApprovalManuallySet(false);
    setForm({
      supplierId: "",
      warehouseId: "",
      orderDate: todayISO(),
      expectedDate: "",
      notes: "",
      department: "",
      costCenter: "",
      branchId: "",
      paymentTerms: "",
      priceListId: "",
      currency: (company as any)?.baseCurrency ?? "IDR",
      exchangeRate: "1",
      allowEditOrderDate: false,
      qcRequired: true,
      needApproval: hasDefaultPO,
      globalDiscountPercent: "0",
      additionalCharges: [],
      taxRate: "0",
      taxCategoryId: "",
    });
    setCurrencyManuallySet(false);
    setRateManuallyEdited(false);
    setLines([emptyOrderLine()]);
  };

  const submit = async () => {
    if (!form.orderDate) return setError("Order date is required.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Add at least one line item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Every line must have a qty > 0.");
    }
    try {
      const res = await create.mutateAsync({
        supplierId: form.supplierId || suppliers[0]?.id || null,
        warehouseId: form.warehouseId || parentWarehouses[0]?.id || null,
        orderDate: form.orderDate,
        expectedDate: form.expectedDate || null,
        notes: form.notes.trim() || null,
        department: form.department.trim() || null,
        costCenter: form.costCenter.trim() || null,
        branchId: form.branchId || null,
        paymentTerms: form.paymentTerms.trim() || null,
        priceListId: form.priceListId || null,
        currency: form.currency || baseCurrency,
        exchangeRate: form.exchangeRate || "1",
        allowEditOrderDate: form.allowEditOrderDate,
        qcRequired: form.qcRequired,
        needApproval: form.needApproval,
        globalDiscountPercent: form.globalDiscountPercent || "0",
        additionalCharges: form.additionalCharges,
        taxRate: form.taxRate || "0",
        taxCategoryId: form.taxCategoryId || null,
        lines: valid.map((l) => ({
          itemId: l.itemId,
          uomId: l.uomId,
          qty: l.qty,
          unitPrice: l.unitPrice || null,
          discount: l.discount || "0",
          batchNumber: l.batchNumber || null,
          note: l.note || null,
          deliveryDate: (l.deliveryDate || form.expectedDate) || null,
        })),
      });
      navigate(`/app/purchase-orders/${(res as any).id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase order.");
    }
  };

  const subtotal = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  const discountTotal = lines.reduce((s, l) => s + Number(l.discount || 0), 0);
  const globalDiscountPercentNum = Number(form.globalDiscountPercent || 0);
  const globalDiscountAmount = subtotal * (globalDiscountPercentNum / 100);
  const additionalChargesTotal = (form.additionalCharges ?? []).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const taxable = Math.max(0, subtotal - discountTotal - globalDiscountAmount);
  const taxRateNum = Number(form.taxRate || 0);
  const selectedCat = taxCategories.find((c) => c.id === form.taxCategoryId) ?? null;
  const hasTax = !!form.taxCategoryId && taxRateNum > 0;
  const tax = hasTax ? taxable * (taxRateNum / 100) : 0;
  const grandTotal = taxable + tax + additionalChargesTotal;
  const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalAmount = lines.reduce((s, l) => {
    const qty = Number(l.qty || 0);
    const price = Number(l.unitPrice || 0);
    const amt = qty * price;
    return s + (amt > 0 ? amt : 0);
  }, 0);
  const totalAmountIDR = (() => {
    const cur = (form.currency || baseCurrency || "IDR").toUpperCase();
    if (cur === "IDR") return totalAmount;
    const rate = Number(form.exchangeRate || 1);
    if (!isFinite(rate) || rate === 0) return totalAmount;
    return totalAmount * rate;
  })();

  if (suppliersLoading || warehousesLoading || uomsLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
        <FormSkeleton sections={[["half", "half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <FormPage
        title="New Purchase Order"
        actions={
          <div className="flex items-center gap-2">
            <DocMenu onCancel={() => navigate("/app/purchase-orders")} onDelete={resetForm} />
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <FormSection>
          <div className="grid gap-x-6 gap-y-6 sm:grid-cols-3">
            {/* Baris 1: Supplier (DB) | Order Date | No 3 */}
            <Select
              label="Supplier"
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
              className="h-8"
            >
              <option value="">Select supplier...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <DatePicker
              label="Order Date"
              value={form.orderDate}
              onChange={(v) => setForm({ ...form, orderDate: v })}
              disabled={!form.allowEditOrderDate}
            />
            <div className="row-span-2 flex flex-col justify-center gap-2 py-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={form.allowEditOrderDate}
                  onCheckedChange={(v) => setForm({ ...form, allowEditOrderDate: v === true })}
                />
                Edit Order Date
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={form.qcRequired}
                  onCheckedChange={(v) => setForm({ ...form, qcRequired: v === true })}
                />
                QC Required
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={form.needApproval}
                  onCheckedChange={(v) => {
                    setNeedApprovalManuallySet(true);
                    setForm({ ...form, needApproval: v === true });
                  }}
                />
                Need Approval
              </label>
            </div>

            {/* Baris 2: Purchaser Name | Expected Date */}
            <Input label="Purchaser Name" value={user?.name ?? ""} disabled placeholder="Auto dari akun" />
            <DatePicker
              label="Expected Date"
              value={form.expectedDate}
              onChange={(v) => setForm({ ...form, expectedDate: v })}
            />

            {/* Baris 2.5: dummy close for 3-col grid */}
          </div>
          <div className="border-t border-border my-4" />
          {/* Baris 3: Accounting Dimension (Department, Branch, Cost Center) - collapsible tanpa kotak */}
          <Collapsible open={accountingOpen} onOpenChange={setAccountingOpen} className="mt-6">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                <span>Accounting Dimension</span>
                <ChevronDown size={14} className={`transition-transform ${accountingOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Input
                  label="Department"
                  placeholder="e.g. Purchasing"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
                <Select
                  label="Branch"
                  value={form.branchId}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                  className="h-8"
                >
                  <option value="">Select branch...</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="mt-4 max-w-[260px]">
                <Input
                  label="Cost Center"
                  placeholder="e.g. CC-001"
                  value={form.costCenter}
                  onChange={(e) => setForm({ ...form, costCenter: e.target.value })}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="border-t border-border my-4" />
          {/* Baris 4: Currency dan Exchange Rate - collapsible tanpa kotak */}
          <Collapsible open={currencyOpen} onOpenChange={setCurrencyOpen} className="mt-6">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                <span>Currency & Exchange</span>
                <ChevronDown size={14} className={`transition-transform ${currencyOpen ? "rotate-180" : ""}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                <Select
                  label="Currency"
                  value={form.currency || baseCurrency}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCurrencyManuallySet(true);
                    setRateManuallyEdited(false);
                    setForm({ ...form, currency: v, exchangeRate: v === baseCurrency ? "1" : form.exchangeRate });
                  }}
                  className="h-8"
                >
                  {["IDR", "USD", "EUR", "SGD", "JPY", "CNY", "MYR", "THB", "AUD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none flex items-center gap-1">
                    Exchange Rate {rateFetching && <span className="text-[11px] text-muted-foreground">(fetching...)</span>}
                    {rateData && !rateFetching && <span className="text-[11px] text-emerald-600">• realtime</span>}
                  </label>
                  <Input
                    placeholder="1"
                    type="number"
                    step="0.000001"
                    value={form.exchangeRate}
                    onChange={(e) => {
                      setRateManuallyEdited(true);
                      setForm({ ...form, exchangeRate: e.target.value });
                    }}
                    disabled={form.currency === baseCurrency || form.currency === ""}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="border-t border-border my-4" />
          {/* Baris 5: Payment Terms | Price List */}
          <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Input
              label="Payment Terms"
              placeholder="e.g. NET 30"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
            />
            <Select
              label="Price List"
              value={form.priceListId}
              onChange={(e) => setForm({ ...form, priceListId: e.target.value })}
              className="h-8"
            >
              <option value="">— No Price List —</option>
              {priceLists
                .filter((p) => p.isActive && (p as any).type !== "SALES")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="border-t border-border my-4" />
          {/* Baris 6: Notes | Target Warehouse */}
          <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea
                placeholder="Optional notes..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <Select
              label="Target Warehouse"
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              className="h-8"
            >
              <option value="">Select warehouse...</option>
              {parentWarehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        </FormSection>

        <FormSection title="Lines">
          <OrderLineTable
            value={lines}
            onChange={setLines}
            headerDeliveryDate={form.expectedDate}
            currency={form.currency || baseCurrency}
            exchangeRate={form.exchangeRate}
            baseCurrency={baseCurrency}
            priceListId={form.priceListId}
            supplierId={form.supplierId}
          />
          {/* Summary total qty & amount - 1 baris dibagi 3, Total Quantity 1/3 kiri, Total Amount (IDR) 1/3 kanan */}
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input label="Total Quantity" value={formatNumber(totalQty)} disabled className="h-8 bg-zinc-100 text-sm" />
            <div className="hidden sm:block" aria-hidden="true" />
            <Input label="Total (IDR)" value={`Rp ${formatNumber(totalAmountIDR)}`} disabled className="h-8 bg-zinc-100 text-sm" />
          </div>
          <div className="border-t border-border my-4" />
          <Collapsible open={chargesOpen} onOpenChange={setChargesOpen}>
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
                <span>Additional Charges</span>
                <ChevronDown size={14} className={`transition-transform ${chargesOpen ? "rotate-180" : ""}`} />
                {additionalChargesTotal > 0 && (
                  <span className="text-xs text-muted-foreground">
                    • {sym(form.currency || baseCurrency)} {formatNumber(additionalChargesTotal)}
                  </span>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <Table className="min-w-[500px] table-fixed text-left text-[13px]">
                    <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                      <TableRow className="border-border hover:bg-transparent divide-x divide-border">
                        <TableHead className="w-8 px-2 text-center">
                          <Checkbox
                            checked={allChargesChecked ? true : someChargesChecked ? "indeterminate" : false}
                            onCheckedChange={(v) => toggleAllCharges(!!v)}
                            aria-label="select all charges"
                          />
                        </TableHead>
                        <TableHead className="w-10 px-3 text-left">No.</TableHead>
                        <TableHead className="w-1/2 px-3 text-left">Type</TableHead>
                        <TableHead className="w-1/2 px-3 text-left">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr]:border-border/70 divide-x divide-border">
                      {form.additionalCharges.map((c: any, idx: number) => (
                        <TableRow key={idx} className="border-border/70 hover:bg-transparent divide-x divide-border">
                          <TableCell className="px-2 text-center">
                            <Checkbox
                              checked={selectedCharges.has(idx)}
                              onCheckedChange={(v) => toggleCharge(idx, !!v)}
                              aria-label={`select charge ${idx + 1}`}
                            />
                          </TableCell>
                          <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell className="p-0 border-r border-border">
                            <ChargeTypeSelect
                              value={c.type}
                              onChange={(v) =>
                                setForm((f) => ({
                                  ...f,
                                  additionalCharges: f.additionalCharges.map((x, i) => (i === idx ? { ...x, type: v } : x)),
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell className="p-0">
                            <TableInput
                              value={c.amount}
                              onChange={(v) =>
                                setForm((f) => ({
                                  ...f,
                                  additionalCharges: f.additionalCharges.map((x, i) => (i === idx ? { ...x, amount: v } : x)),
                                }))
                              }
                              columnTitle="Amount"
                              isNumeric
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                      {form.additionalCharges.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                            No additional charges
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="border-t border-border p-2">
                  {selectedCharges.size > 0 ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 gap-1 px-2.5 text-xs"
                      onClick={deleteSelectedCharges}
                    >
                      <Trash2 size={13} /> Delete
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2.5 text-xs"
                      onClick={() => setForm((f) => ({ ...f, additionalCharges: [...f.additionalCharges, { type: "freight", amount: "" }] }))}
                    >
                      + Add Charge
                    </Button>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="mt-6 grid gap-4 sm:grid-cols-3 border-t border-border pt-6">
            <div className="space-y-4">
              <Select
                label="Tax Category"
                value={form.taxCategoryId}
                onChange={(e) => {
                  const v = e.target.value;
                  const cat = taxCategories.find((c) => c.id === v);
                  if (!v) setForm({ ...form, taxCategoryId: "", taxRate: "0" });
                  else setForm({ ...form, taxCategoryId: v, taxRate: cat ? String(cat.percentage) : "0" });
                }}
                className="h-8"
              >
                <option value="">— No Tax —</option>
                {taxCategories
                  .filter((t) => t.isActive)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </Select>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Discount (%)</label>
                <Input
                  value={form.globalDiscountPercent}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    if (v === "" || (/^\d*\.?\d*$/.test(v) && Number(v) <= 100)) {
                      setForm({ ...form, globalDiscountPercent: v });
                    }
                  }}
                  placeholder="0"
                  className="h-8 text-sm"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="hidden sm:block" aria-hidden="true" />
            <div className="flex flex-col items-end">
              <div className="w-full max-w-[320px] space-y-2 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums">
                    {sym(form.currency || baseCurrency)} {formatNumber(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium tabular-nums">
                    - {sym(form.currency || baseCurrency)} {formatNumber(discountTotal + globalDiscountAmount)}
                  </span>
                </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{Number(form.taxRate || 0) === 0 ? "Tax 0%" : `Tax (${Math.round(Number(form.taxRate))}%)`}</span>
                    <span className="font-medium tabular-nums">
                      {sym(form.currency || baseCurrency)} {formatNumber(tax)}
                    </span>
                  </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Additional Charges</span>
                  <span className="font-medium tabular-nums">
                    {sym(form.currency || baseCurrency)} {formatNumber(additionalChargesTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="font-semibold">Grand Total</span>
                  <span className="font-bold tabular-nums">
                    {sym(form.currency || baseCurrency)} {formatNumber(grandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </FormSection>

      </FormPage>
    </RoleGuard>
  );
}