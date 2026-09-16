import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Coins, ChevronDown, Briefcase, X, Check, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import {
  useBranches,
  useAllWarehouses,
  useUoms,
  useTaxCategories,
  useCompanySettings,
  useExchangeRate,
  useCreatePurchaseRequest,
  useWorkflows,
  useDepartments,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocMenu } from "@/components/ui/doc-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
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

export default function NewPurchaseRequestPage() {
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const { isLoading: uomsLoading } = useUoms();
  const { data: taxCategories = [] } = useTaxCategories();
  const { data: company } = useCompanySettings();
  const { data: workflows = [] } = useWorkflows();
  const { data: departments = [] } = useDepartments();
  const departmentOptions = useMemo(
    () =>
      (departments as any[])
        .filter((d) => d.isActive !== false)
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map((d) => ({ value: d.name, label: d.code ? `${d.code} - ${d.name}` : d.name })),
    [departments]
  );
  const hasDefaultPR = useMemo(
    () => (workflows as any[]).some((w) => String(w.documentType).toUpperCase() === "PR" && !!w.isDefault && w.isActive !== false),
    [workflows]
  );
  const create = useCreatePurchaseRequest();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [needApprovalManuallySet, setNeedApprovalManuallySet] = useState(false);

  const [form, setForm] = useState({
    warehouseId: "",
    requestDate: todayISO(),
    urgency: "MEDIUM" as string,
    notes: "",
    department: "",
    toDepartment: "",
    costCenter: "",
    branchId: "",
    currency: "",
    exchangeRate: "1",
    needApproval: false,
    globalDiscountPercent: "0",
    additionalCharges: [] as { type: string; amount: string }[],
    taxRate: "0",
    taxCategoryId: "",
  });
  const [lines, setLines] = useState<OrderLineInput[]>([emptyOrderLine()]);

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

  // Need Approval default true if hasDefaultPR workflow for PR
  useEffect(() => {
    if (needApprovalManuallySet) return;
    const should = hasDefaultPR;
    setForm((f) => (f.needApproval === should ? f : { ...f, needApproval: should }));
  }, [hasDefaultPR, needApprovalManuallySet]);

  // auto-select first warehouse if empty (supplier optional so don't auto-select)
  useEffect(() => {
    if (!form.warehouseId && warehouses.length > 0) {
      setForm((f) => (f.warehouseId ? f : { ...f, warehouseId: warehouses[0].id }));
    }
  }, [warehouses, form.warehouseId]);

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
      warehouseId: "",
      requestDate: todayISO(),
      urgency: "MEDIUM",
      notes: "",
      department: "",
      toDepartment: "",
      costCenter: "",
      branchId: "",
      currency: (company as any)?.baseCurrency ?? "IDR",
      exchangeRate: "1",
      needApproval: hasDefaultPR,
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
    if (!form.requestDate) return setError("Request date is required.");
    if (!form.warehouseId) return setError("Target Warehouse is required.");
    const valid = lines.filter((l) => l.itemId);
    if (valid.length === 0) return setError("Add at least one line item.");
    for (const l of valid) {
      if (!l.qty || Number(l.qty) <= 0) return setError("Every line must have a qty > 0.");
    }
    try {
      const res = await create.mutateAsync({
        warehouseId: form.warehouseId || warehouses[0]?.id || null,
        requestDate: form.requestDate,
        expectedDate: null,
        urgency: form.urgency || "MEDIUM",
        notes: form.notes.trim() || null,
        department: form.department.trim() || null,
        toDepartment: form.toDepartment.trim() || null,
        costCenter: form.costCenter.trim() || null,
        branchId: form.branchId || null,
        currency: form.currency || baseCurrency,
        exchangeRate: form.exchangeRate || "1",
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
          deliveryDate: l.deliveryDate || null,
        })),
      });
      navigate(`/app/purchase-requests/${(res as any).id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase request.");
    }
  };

  const subtotal = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  const discountTotal = lines.reduce((s, l) => s + Number(l.discount || 0), 0);
  const globalDiscountPercentNum = Number(form.globalDiscountPercent || 0);
  const globalDiscountAmount = subtotal * (globalDiscountPercentNum / 100);
  const additionalChargesTotal = (form.additionalCharges ?? []).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const taxable = Math.max(0, subtotal - discountTotal - globalDiscountAmount);
  const taxRateNum = Number(form.taxRate || 0);
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

  if (warehousesLoading || uomsLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
        <FormSkeleton sections={[["half", "half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
      <FormPage
        title="New Purchase Request"
        actions={
          <div className="flex items-center gap-2">
            <DocMenu onCancel={() => navigate("/app/purchase-requests")} onDelete={resetForm} />
            <Button size="sm" onClick={submit} disabled={create.isPending}>
              {create.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <FormSection>
          <div className="grid gap-x-6 gap-y-6 sm:grid-cols-3">
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
            <DatePicker
              label="Request Date"
              value={form.requestDate}
              onChange={(v) => setForm({ ...form, requestDate: v })}
            />
            <div className="flex flex-col justify-center gap-2 py-1">
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
          </div>
          <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <SearchableSelect
              label="Request By"
              options={departmentOptions}
              value={form.department}
              onChange={(v) => setForm({ ...form, department: v })}
              placeholder="Select department..."
              emptyText="No department found"
              emptyLabel=""
            />
            <SearchableSelect
              label="Request To"
              options={departmentOptions}
              value={form.toDepartment}
              onChange={(v) => setForm({ ...form, toDepartment: v })}
              placeholder="Select department..."
              emptyText="No department found"
              emptyLabel=""
            />
          </div>
          {/* Notes | Urgency */}
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
              label="Urgency"
              value={form.urgency}
              onChange={(e) => setForm({ ...form, urgency: e.target.value })}
              className="h-8"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </Select>
          </div>
        </FormSection>

        <FormSection title="Lines">
          <OrderLineTable
            value={lines}
            onChange={setLines}
            currency={form.currency || baseCurrency}
            exchangeRate={form.exchangeRate}
            baseCurrency={baseCurrency}
            variant="purchase-request"
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input label="Total Quantity" value={formatNumber(totalQty)} disabled className="h-8 bg-zinc-100 text-sm" />
          </div>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
