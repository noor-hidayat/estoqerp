import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { X, Coins, ChevronDown, Briefcase, Printer, ChevronsUpDown, PackageCheck, FileText, Trash2, Truck, Building2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usePurchaseRequest,
  useSuppliers,
  useBranches,
  useAllWarehouses,
  useUoms,
  useTaxCategories,
  useCompanySettings,
  useExchangeRate,
  useUpdatePurchaseRequest,
  usePostPurchaseRequest,
  useApprovePurchaseRequest,
  useRejectPurchaseRequest,
  useCancelPurchaseRequest,
  useRemovePurchaseRequest,
  useCreatePOFromPR,
  useItemsList,
  useWorkflows,
  useWorkflowStates,
  useUserSignature,
  useDepartments,
} from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocMenu } from "@/components/ui/doc-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { ActivityTimeline } from "@/modules/activity/components/activity-timeline";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/modules/purchasing/components/order-line-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { useErrorToast } from "@/hooks/use-error-toast";
import { createPortal } from "react-dom";
import { useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatId, formatNumber } from "@/lib/utils";
import type { PurchaseRequest } from "@/types";

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

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function formatDdMmmYyyy(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
const CURRENCY_SYMBOLS: Record<string, string> = { IDR: "Rp", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", CNY: "¥", MYR: "RM", THB: "฿", AUD: "A$" };
function sym(cur?: string | null): string {
  if (!cur) return "Rp";
  return CURRENCY_SYMBOLS[cur.toUpperCase()] ?? cur.toUpperCase();
}

export default function PurchaseRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pr, isLoading } = usePurchaseRequest(id);
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: uoms = [] } = useUoms();
  const update = useUpdatePurchaseRequest();
  const post = usePostPurchaseRequest();
  const cancel = useCancelPurchaseRequest();
  const remove = useRemovePurchaseRequest();
  const createPO = useCreatePOFromPR();
  const [editing, setEditing] = useState(false);

  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "";

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
        <p className="py-20 text-center text-muted-foreground">Loading…</p>
      </RoleGuard>
    );
  }
  if (!pr) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
        <p className="py-20 text-center text-foreground">Purchase request not found.</p>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
      <PRBody
        pr={pr}
        editing={editing}
        setEditing={setEditing}
        warehouseName={warehouseName}
        suppliers={suppliers}
        warehouses={warehouses}
        uoms={uoms}
        update={update}
        post={post}
        cancel={cancel}
        remove={remove}
        createPO={createPO}
        navigate={navigate}
      />
    </RoleGuard>
  );
}

function PRBody({
  pr,
  editing,
  setEditing,
  warehouseName,
  suppliers,
  warehouses,
  uoms,
  update,
  post,
  cancel,
  remove,
  createPO,
  navigate,
}: {
  pr: PurchaseRequest;
  editing: boolean;
  setEditing: (v: boolean) => void;
  warehouseName: (id?: string) => string;
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  uoms: { id: string; name: string }[];
  update: ReturnType<typeof useUpdatePurchaseRequest>;
  post: ReturnType<typeof usePostPurchaseRequest>;
  cancel: ReturnType<typeof useCancelPurchaseRequest>;
  remove: ReturnType<typeof useRemovePurchaseRequest>;
  createPO: ReturnType<typeof useCreatePOFromPR>;
  navigate: (to: string) => void;
}) {
  const [err, setErr] = useState("");
  useErrorToast(err);
  const { user } = useSession();
  const { data: taxCategories = [] } = useTaxCategories();
  const { data: branches = [] } = useBranches();
  const { data: departments = [] } = useDepartments();
  const departmentOptions = useMemo(
    () =>
      (departments as any[])
        .filter((d) => d.isActive !== false)
        .sort((a, b) => String(a.code).localeCompare(String(b.code)))
        .map((d) => ({ value: d.name, label: d.code ? `${d.code} - ${d.name}` : d.name })),
    [departments]
  );
  const { data: company } = useCompanySettings();
  const { data: items = [] } = useItemsList();
  const subWarehouses = useMemo(() => {
    const subs = (warehouses as any[]).filter((w: any) => (w as any).parentId);
    return subs.length > 0 ? subs : (warehouses as any[]);
  }, [warehouses]);
  const requestByName =
    (pr as any).createdByName ?? (user as any)?.name ?? (user as any)?.email ?? "";
  const deptLabel = (val?: string | null) => {
    if (!val) return "";
    const d = (departments as any[]).find((x: any) => x.name === val);
    return d ? (d.code ? `${d.code} - ${d.name}` : d.name) : val;
  };
  const { data: workflows = [] } = useWorkflows();
  const workflowIdForPR = (pr as any).approvalWorkflowId || (workflows as any[]).find((w: any) => String(w.documentType).toUpperCase() === "PR" && w.isDefault)?.id;
  const { data: workflowStates = [] } = useWorkflowStates(workflowIdForPR);
  const { data: mySignature } = useUserSignature();
  const isDraft = pr.status === "DRAFT";
  const isPendingApproval = String(pr.status ?? "").toUpperCase() === "PENDING_APPROVAL";
  const isApproved = String(pr.status ?? "").toUpperCase() === "APPROVED" || (! (pr as any).needApproval && (String(pr.status ?? "").toUpperCase() === "POSTED" || String(pr.status ?? "").toUpperCase() === "POST"));
  const isPosted = String(pr.status ?? "").toUpperCase() === "POSTED" || isApproved;
  const isRejected = String(pr.status ?? "").toUpperCase() === "REJECTED";
  const editable = isDraft || editing;
  const approve = useApprovePurchaseRequest();
  const rejectHook = useRejectPurchaseRequest();
  const pendingRoleName = useMemo(() => {
    if (!isPendingApproval || !(pr as any).needApproval) return null;
    const level = Number((pr as any).currentApprovalLevel || 1);
    const sorted = [...(workflowStates as any[])].sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
    const intermediate = sorted.filter((s: any) => s.type === "intermediate");
    const levels = intermediate.length > 0 ? intermediate : sorted;
    const st = levels[level - 1];
    return st?.name ?? `Level ${level}`;
  }, [isPendingApproval, pr, workflowStates]);
  const pendingRequiresSignature = useMemo(() => {
    if (!isPendingApproval || !(pr as any).needApproval) return false;
    const level = Number((pr as any).currentApprovalLevel || 1);
    const sorted = [...(workflowStates as any[])].sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
    const intermediate = sorted.filter((s: any) => s.type === "intermediate");
    const levels = intermediate.length > 0 ? intermediate : sorted;
    const st = levels[level - 1];
    return !!st?.requiresSignature;
  }, [isPendingApproval, pr, workflowStates]);
  const [form, setForm] = useState({
    warehouseId: pr.warehouseId,
    requestDate: pr.requestDate?.slice(0, 10) ?? todayISO(),
    expectedDate: pr.expectedDate?.slice(0, 10) ?? "",
    urgency: String((pr as any).urgency ?? "MEDIUM"),
    notes: pr.notes ?? "",
    department: (pr as any).department ?? "",
    toDepartment: (pr as any).toDepartment ?? "",
    costCenter: (pr as any).costCenter ?? "",
    branchId: (pr as any).branchId ?? "",
    currency: (pr as any).currency ?? (company as any)?.baseCurrency ?? "IDR",
    exchangeRate: String((pr as any).exchangeRate ?? "1"),
    needApproval: (pr as any).needApproval ?? false,
    globalDiscountPercent: String((pr as any).globalDiscountPercent ?? "0"),
    additionalCharges: ((pr as any).additionalCharges ?? []) as { type: string; amount: string }[],
    taxRate: String((pr as any).taxRate ?? "0"),
    taxCategoryId: (pr as any).taxCategoryId ?? "",
  });

  const baseCurrency = (company as any)?.baseCurrency ?? "IDR";
  const [rateManuallyEdited, setRateManuallyEdited] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [selectedCharges, setSelectedCharges] = useState<Set<number>>(new Set());
  const allChargesChecked = editable && form.additionalCharges.length > 0 && selectedCharges.size === form.additionalCharges.length;
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
  const { data: rateData, isFetching: rateFetching } = useExchangeRate(
    editable && form.currency && form.currency !== baseCurrency ? form.currency : undefined,
    editable && form.currency && form.currency !== baseCurrency ? baseCurrency : undefined
  );
  useEffect(() => {
    if (editable && rateData?.rate && !rateManuallyEdited && form.currency !== baseCurrency) {
      const fetched = String(rateData.rate);
      if (fetched !== form.exchangeRate) setForm((f) => ({ ...f, exchangeRate: fetched }));
    }
    if (editable && form.currency === baseCurrency && form.exchangeRate !== "1" && !rateManuallyEdited) {
      setForm((f) => ({ ...f, exchangeRate: "1" }));
    }
  }, [rateData?.rate, editable, form.currency, baseCurrency, form.exchangeRate, rateManuallyEdited]);
  const [lines, setLines] = useState<OrderLineInput[]>(
    (pr.lines ?? []).map((l) => ({
      itemId: l.itemId,
      uomId: l.uomId,
      qty: String(l.qty),
      unitPrice: l.unitPrice ?? "",
      discount: (l as any).discount ?? "",
      batchNumber: l.batchNumber ?? "",
      note: l.note ?? "",
      deliveryDate: (l as unknown as { deliveryDate?: string | null }).deliveryDate ?? "",
    }))
  );

  useEffect(() => {
    setForm({
      warehouseId: pr.warehouseId,
      requestDate: pr.requestDate?.slice(0, 10) ?? todayISO(),
      expectedDate: pr.expectedDate?.slice(0, 10) ?? "",
      urgency: String((pr as any).urgency ?? "MEDIUM"),
      notes: pr.notes ?? "",
      department: (pr as any).department ?? "",
      toDepartment: (pr as any).toDepartment ?? "",
      costCenter: (pr as any).costCenter ?? "",
      branchId: (pr as any).branchId ?? "",
      currency: (pr as any).currency ?? baseCurrency ?? "IDR",
      exchangeRate: String((pr as any).exchangeRate ?? "1"),
      needApproval: (pr as any).needApproval ?? false,
      globalDiscountPercent: String((pr as any).globalDiscountPercent ?? "0"),
      additionalCharges: ((pr as any).additionalCharges ?? []) as { type: string; amount: string }[],
      taxRate: String((pr as any).taxRate ?? "0"),
      taxCategoryId: (pr as any).taxCategoryId ?? "",
    });
    setLines(
      (pr.lines ?? []).map((l) => ({
        itemId: l.itemId,
        uomId: l.uomId,
        qty: String(l.qty),
        unitPrice: l.unitPrice ?? "",
        discount: (l as any).discount ?? "",
        batchNumber: l.batchNumber ?? "",
        note: l.note ?? "",
        deliveryDate: (l as unknown as { deliveryDate?: string | null }).deliveryDate ?? "",
      }))
    );
  }, [pr.publicId, pr.updatedAt]);

  const initialSnapshot = useMemo(() => {
    const f = {
      warehouseId: pr.warehouseId,
      requestDate: pr.requestDate?.slice(0, 10) ?? "",
      expectedDate: pr.expectedDate?.slice(0, 10) ?? "",
      urgency: String((pr as any).urgency ?? "MEDIUM"),
      notes: pr.notes ?? "",
      department: (pr as any).department ?? "",
      toDepartment: (pr as any).toDepartment ?? "",
      costCenter: (pr as any).costCenter ?? "",
      branchId: (pr as any).branchId ?? "",
      currency: (pr as any).currency ?? "IDR",
      exchangeRate: String((pr as any).exchangeRate ?? "1"),
      needApproval: (pr as any).needApproval ?? false,
      globalDiscountPercent: String((pr as any).globalDiscountPercent ?? "0"),
      additionalCharges: ((pr as any).additionalCharges ?? []) as { type: string; amount: string }[],
      taxRate: String((pr as any).taxRate ?? "0"),
      taxCategoryId: (pr as any).taxCategoryId ?? "",
    };
    const l = (pr.lines ?? []).map((x: any) => ({
      itemId: x.itemId,
      uomId: x.uomId,
      qty: String(x.qty),
      unitPrice: x.unitPrice ?? "",
      discount: (x as any).discount ?? "",
      batchNumber: x.batchNumber ?? "",
      note: x.note ?? "",
      deliveryDate: (x as any).deliveryDate ?? "",
    }));
    return JSON.stringify({ form: f, lines: l });
  }, [pr]);

  const dirty = useMemo(() => {
    const cur = JSON.stringify({
      form,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        uomId: l.uomId,
        qty: String(l.qty),
        unitPrice: l.unitPrice ?? "",
        discount: (l as any).discount ?? "",
        batchNumber: l.batchNumber ?? "",
        note: l.note ?? "",
        deliveryDate: (l as any).deliveryDate ?? "",
      })),
    });
    return cur !== initialSnapshot;
  }, [form, lines, initialSnapshot]);

  const saveEdit = async () => {
    const valid = lines.filter((l) => l.itemId);
    try {
      await update.mutateAsync({
        id: pr.id,
        patch: {
          warehouseId: form.warehouseId,
          requestDate: form.requestDate,
          expectedDate: form.expectedDate || null,
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
        },
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  const subtotal = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  const discountTotal = lines.reduce((s, l) => s + Number((l as any).discount || 0), 0);
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
    const cur = (editable ? form.currency : (pr as any).currency || baseCurrency || "IDR").toUpperCase();
    if (cur === "IDR") return totalAmount;
    const rate = Number(editable ? form.exchangeRate : (pr as any).exchangeRate || 1);
    if (!isFinite(rate) || rate === 0) return totalAmount;
    return totalAmount * rate;
  })();

  const viewTaxRate = editable ? form.taxRate : String((pr as any).taxRate ?? "0");
  const viewTaxRateNum = Number(viewTaxRate || 0);
  const viewHasTax = !!((pr as any).taxCategoryId) && viewTaxRateNum > 0;
  const viewSubtotal = editable ? subtotal : (pr.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  const viewDiscountTotal = editable ? discountTotal : (pr.lines ?? []).reduce((s: number, l: any) => s + Number((l as any).discount || 0), 0);
  const viewGlobalDiscountPercent = editable ? form.globalDiscountPercent : String((pr as any).globalDiscountPercent ?? "0");
  const viewGlobalDiscountPercentNum = Number(viewGlobalDiscountPercent || 0);
  const viewGlobalDiscountAmount = viewSubtotal * (viewGlobalDiscountPercentNum / 100);
  const viewAdditionalCharges = editable ? form.additionalCharges : ((pr as any).additionalCharges ?? []);
  const viewAdditionalChargesTotal = (viewAdditionalCharges ?? []).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const viewTaxable = Math.max(0, viewSubtotal - viewDiscountTotal - viewGlobalDiscountAmount);
  const viewTax = viewHasTax ? viewTaxable * (viewTaxRateNum / 100) : 0;
  const viewGrandTotal = viewTaxable + viewTax + viewAdditionalChargesTotal;
  const viewTotalQty = editable ? totalQty : (pr.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty || 0), 0);
  const viewTotalAmount = editable
    ? totalAmount
    : (pr.lines ?? []).reduce((s: number, l: any) => {
        const qty = Number(l.qty || 0);
        const price = Number(l.unitPrice || 0);
        const amt = qty * price;
        return s + (amt > 0 ? amt : 0);
      }, 0);
  const viewTotalAmountIDR = (() => {
    const cur = ((pr as any).currency || baseCurrency || "IDR").toUpperCase();
    const amt = viewTotalAmount;
    if (cur === "IDR") return amt;
    const rate = Number((pr as any).exchangeRate || 1);
    if (!isFinite(rate) || rate === 0) return amt;
    return amt * rate;
  })();

  const onPost = async () => {
    if (!confirm("Post this purchase request?")) return;
    try {
      await post.mutateAsync(pr.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to post.");
    }
  };
  const onApprove = async () => {
    if (pendingRequiresSignature && !mySignature?.signatureData) {
      toast.error("Anda belum memiliki signature — buat di My Account → My Signature.");
      navigate("/app/settings/account");
      return;
    }
    if (!confirm("Approve this purchase request?")) return;
    try {
      await approve.mutateAsync(pr.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to approve.");
    }
  };
  const onReject = async () => {
    if (!confirm("Reject this purchase request?")) return;
    try {
      await rejectHook.mutateAsync(pr.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reject.");
    }
  };
  const onCancel = async () => {
    if (!confirm("Cancel this purchase request?")) return;
    try {
      await cancel.mutateAsync(pr.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to cancel.");
    }
  };
  const onDelete = async () => {
    if (!confirm("Delete this purchase request? Data akan dihapus dari database.")) return;
    try {
      await remove.mutateAsync(pr.id);
      navigate("/app/purchase-requests");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete.");
    }
  };
  const [showSupplierDialog, setShowSupplierDialog] = useState(false);
  const [selectedSupplierForPO, setSelectedSupplierForPO] = useState("");

  const onCreatePO = async () => {
    if (!selectedSupplierForPO) {
      setShowSupplierDialog(true);
      return;
    }
    try {
      const res = await (createPO as any).mutateAsync({ id: pr.id, supplierId: selectedSupplierForPO });
      setShowSupplierDialog(false);
      setSelectedSupplierForPO("");
      navigate(`/app/purchase-orders/${res.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create PO.");
    }
  };

  const handleConfirmCreatePO = async () => {
    if (!selectedSupplierForPO) {
      setErr("Pilih supplier untuk PO.");
      return;
    }
    await onCreatePO();
  };

  const warehouse = warehouses.find((w) => w.id === pr.warehouseId);
  return (
    <>
      <div className="print:hidden">
        <FormPage
          title={pr.documentNo ?? (pr as any).prNo ?? `PR ${formatId(pr.id)}`}
          titleBadge={
            isDraft && dirty ? (
              <Badge tone="destructive">Not save</Badge>
            ) : isPendingApproval && (pr as any).needApproval && pendingRoleName ? (
              <Badge tone="warning">Pending for {pendingRoleName}</Badge>
            ) : (
              <DocStatusBadge status={pr.status} />
            )
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!editing && isApproved && (
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Print" onClick={() => window.print()}>
                  <Printer size={16} />
                </Button>
              )}
              {!editing && isPosted && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-7 gap-1 bg-black px-3 text-xs text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200" aria-label="Create">
                      Create <ChevronsUpDown size={14} className="opacity-80" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={onCreatePO}
                    >
                      <PackageCheck size={14} /> Purchase Order
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => navigate(`/app/rfq/new?prId=${pr.id}`)}
                    >
                      <FileText size={14} /> Request for Quotation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!editing && isPendingApproval && (pr as any).needApproval && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-7 gap-1 bg-black px-3 text-xs text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200" aria-label="Action">
                      Action <ChevronsUpDown size={14} className="opacity-80" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem className="gap-2" onClick={onApprove} disabled={approve.isPending}>
                      <Check size={14} /> Approve
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={onReject} disabled={rejectHook.isPending}>
                      <X size={14} /> Reject
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {(isDraft || !editing) && (
                <DocMenu
                  onCancel={onCancel}
                  onDelete={onDelete}
                  cancelDisabled={pr.status === "CANCELED" || post.isPending}
                />
              )}
              {isDraft && (
                dirty ? (
                  <Button variant="primary" size="sm" onClick={saveEdit} disabled={update.isPending}>
                    Save
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={onPost} disabled={post.isPending}>
                    Submit
                  </Button>
                )
              )}
              {editing && !isDraft && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X size={14} strokeWidth={2} /> Discard
                </Button>
              )}
              {editing && !isDraft && (
                <Button variant="primary" size="sm" onClick={saveEdit} disabled={update.isPending}>
                  Save
                </Button>
              )}
            </div>
          }
        >
          <FormSection>
            {/* Row 1: Branch | Request By (user) | Request Date */}
            <div className="grid gap-x-6 gap-y-6 sm:grid-cols-3">
              {editable ? (
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
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Branch</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {branches.find((b) => b.id === (pr as any).branchId)?.name ?? ""}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Request By</label>
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                  {requestByName || "—"}
                </div>
              </div>
              <DatePicker
                label="Request Date"
                value={form.requestDate}
                onChange={(v) => setForm({ ...form, requestDate: v })}
                disabled={!editable}
              />
            </div>
            {/* Row 2: Need Approval | (empty) | Required Date */}
            <div className="mt-6 grid gap-x-6 gap-y-6 sm:grid-cols-3">
              <div className="flex flex-col justify-center gap-2 py-1">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox
                    checked={form.needApproval}
                    onCheckedChange={(v) => setForm({ ...form, needApproval: v === true })}
                    disabled={!editable}
                  />
                  Need Approval
                </label>
              </div>
              <div />
              <DatePicker
                label="Required Date"
                value={form.expectedDate}
                onChange={(v) => setForm({ ...form, expectedDate: v })}
                disabled={!editable}
              />
            </div>
            {/* Row 3: Urgency | Requesting Dept */}
            <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {editable ? (
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
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Urgency</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {String((pr as any).urgency ?? "MEDIUM")}
                  </div>
                </div>
              )}
              {editable ? (
                <SearchableSelect
                  label="Requesting Dept"
                  options={departmentOptions}
                  value={form.department}
                  onChange={(v) => setForm({ ...form, department: v })}
                  placeholder="Select department..."
                  emptyText="No department found"
                  emptyLabel=""
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Requesting Dept</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {deptLabel((pr as any).department)}
                  </div>
                </div>
              )}
            </div>
            {/* Row 4: Notes | Target Warehouse (sub-warehouse) */}
            <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  disabled={!editable}
                  placeholder={editable ? "Optional notes..." : ""}
                />
              </div>
              {editable ? (
                <Select
                  label="Target Warehouse"
                  value={form.warehouseId}
                  onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
                  className="h-8"
                >
                  <option value="">Select warehouse...</option>
                  {subWarehouses.map((w: any) => {
                    const parent = (warehouses as any[]).find((x: any) => x.id === w.parentId);
                    return (
                      <option key={w.id} value={w.id}>
                        {w.parentId ? `↳ ${w.name} (induk: ${parent?.name ?? ""})` : w.name}
                      </option>
                    );
                  })}
                </Select>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Target Warehouse</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {warehouseName(pr.warehouseId)}
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          <FormSection title="Lines">
            <OrderLineTable
              value={lines}
              onChange={editable ? setLines : () => {}}
              readOnly={!editable}
              headerDeliveryDate={undefined}
              currency={editable ? form.currency : (pr as any).currency}
              exchangeRate={editable ? form.exchangeRate : (pr as any).exchangeRate}
              baseCurrency={baseCurrency}
              variant="purchase-request"
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Input label="Total Quantity" value={formatNumber(editable ? totalQty : viewTotalQty)} disabled className="h-8 bg-zinc-100 text-sm" />
            </div>
          </FormSection>

          <FormSection title="Activity Log">
            <ActivityTimeline documentType="PR" documentId={pr.id} />
          </FormSection>
        </FormPage>
      </div>

      <Dialog open={showSupplierDialog} onOpenChange={(o) => setShowSupplierDialog(o)}>
        <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Truck size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-[15px] font-semibold leading-tight">Buat Purchase Order</DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-relaxed">
                  Pilih supplier untuk membuat PO dari <span className="font-medium text-foreground">{pr.documentNo ?? formatId(pr.id)}</span> — {pr.lines?.length ?? 0} item akan disalin.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="border-y border-border bg-muted/30 px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Building2 size={12} strokeWidth={2} />
                  Purchase Request
                </div>
                <div className="mt-1 truncate text-sm font-medium text-foreground">{pr.documentNo ?? formatId(pr.id)}</div>
                <div className="text-xs text-muted-foreground">{warehouse?.name ?? warehouseName(pr.warehouseId)} • {pr.lines?.length ?? 0} item • Qty {formatNumber((pr.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty || 0), 0))}</div>
              </div>
              <div className="hidden sm:flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
                <PackageCheck size={16} strokeWidth={2} />
              </div>
            </div>
          </div>

          <div className="px-6 py-5 space-y-4">
            {suppliers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
                <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-muted">
                  <Search size={16} className="text-muted-foreground" />
                </div>
                <p className="mt-3 text-sm font-medium">Belum ada supplier aktif</p>
                <p className="mt-1 text-xs text-muted-foreground">Tambahkan supplier di master data sebelum membuat PO.</p>
                <Button variant="outline" size="sm" className="mt-4 h-8" onClick={() => { setShowSupplierDialog(false); navigate("/app/suppliers"); }}>
                  Ke Master Supplier
                </Button>
              </div>
            ) : (
              <>
                <SearchableSelect
                  label="Supplier"
                  placeholder="Cari supplier (kode / nama)..."
                  emptyText="Supplier tidak ditemukan"
                  options={suppliers
                    .filter((s: any) => s.isActive !== false)
                    .map((s: any) => ({
                      value: s.id,
                      label: s.code ? `${s.code} — ${s.name}` : s.name,
                    }))}
                  value={selectedSupplierForPO}
                  onChange={setSelectedSupplierForPO}
                />

                {(() => {
                  const sel = suppliers.find((s: any) => s.id === selectedSupplierForPO) as any;
                  if (!sel) {
                    return (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Ketik untuk mencari supplier. PO akan dibuat dengan seluruh line dari PR ini. Supplier bisa diganti lagi di halaman PO (Draft).
                      </p>
                    );
                  }
                  return (
                    <div className="rounded-lg border border-border bg-card overflow-hidden">
                      <div className="flex items-center gap-2 border-b border-border bg-zinc-50 px-3 py-2 dark:bg-zinc-900/50">
                        <div className="flex size-7 items-center justify-center rounded-md bg-background border border-border text-muted-foreground">
                          <Building2 size={14} strokeWidth={2} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-foreground">{sel.code ? `${sel.code} — ${sel.name}` : sel.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">{sel.code ? `Kode: ${sel.code}` : "Supplier terpilih"}</div>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">Terpilih</span>
                      </div>
                      <div className="grid gap-2 px-3 py-3 text-xs leading-relaxed">
                        {(sel.contactPerson || sel.phone || sel.email) && (
                          <div className="grid gap-1">
                            {sel.contactPerson && <div><span className="text-muted-foreground">Kontak:</span> <span className="font-medium text-foreground">{sel.contactPerson}</span> {sel.phone ? <span className="text-muted-foreground">• {sel.phone}</span> : null}</div>}
                            {!sel.contactPerson && sel.phone && <div><span className="text-muted-foreground">Telp:</span> <span className="font-medium text-foreground">{sel.phone}</span></div>}
                            {sel.email && <div><span className="text-muted-foreground">Email:</span> <span className="font-medium text-foreground">{sel.email}</span></div>}
                          </div>
                        )}
                        {sel.address && <div className="text-muted-foreground line-clamp-2">Alamat: <span className="text-foreground">{sel.address}</span></div>}
                        {!sel.contactPerson && !sel.phone && !sel.email && !sel.address && (
                          <div className="text-muted-foreground">Tidak ada detail kontak — lanjutkan untuk membuat PO.</div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          <DialogFooter className="px-6 py-4 bg-zinc-50 dark:bg-zinc-900/50 border-t sm:justify-between gap-2">
            <p className="hidden sm:block text-xs text-muted-foreground">
              {suppliers.length} supplier tersedia
            </p>
            <div className="flex w-full sm:w-auto justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-8" onClick={() => setShowSupplierDialog(false)} disabled={createPO.isPending}>
                Batal
              </Button>
              <Button
                variant="default"
                size="sm"
                className="h-8 min-w-[110px]"
                onClick={handleConfirmCreatePO}
                disabled={!selectedSupplierForPO || createPO.isPending || suppliers.length === 0}
              >
                {createPO.isPending ? (
                  <>
                    <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Membuat...
                  </>
                ) : (
                  <>
                    <PackageCheck size={14} strokeWidth={2} />
                    Buat PO
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Print view for PR */}
      <style>{`@media print { @page { size: A4; margin: 0; } html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body * { visibility: hidden; } .print-doc, .print-doc * { visibility: visible; } .print-doc { position: absolute; left: 0; top: 0; width: 100%; height: auto; } header, nav, aside { display: none !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } }`}</style>
      <div className="hidden print:block print-doc bg-white text-black print:absolute print:inset-0 print:p-0">
        <div className="mx-auto w-[190mm] max-w-[190mm] bg-white p-[10mm] text-black">
          <div className="flex items-start justify-between gap-6 border-b border-zinc-900 pb-3">
            <div className="flex items-start gap-3">
              {(company as any)?.logo ? (
                <img src={(company as any).logo} alt="Logo" className="h-10 w-10 object-contain" />
              ) : (
                <div className="h-10 w-10 border border-black flex items-center justify-center text-[10px] font-bold text-black">LOGO</div>
              )}
              <div className="leading-tight">
                <div className="text-[15px] font-bold tracking-tight text-black">{(company as any)?.companyName ?? "PT CONTOH SUKSES MAKMUR"}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-zinc-600 max-w-[360px] whitespace-pre-wrap break-words">{(company as any)?.address ?? "Jl. Industri Raya No. 45, Jakarta Selatan 12345"}</div>
                <div className="mt-1 text-[10px] text-zinc-600">
                  {[
                    `Telp. ${(company as any)?.phone ?? "+62 86746678829"}`,
                    (company as any)?.email ?? "info@trijaya.co.id",
                    (company as any)?.website ? String((company as any).website).replace(/^https?:\/\//, "") : "www.trijaya.co.id",
                  ].join(" · ")}
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-base font-bold tracking-[0.15em] text-black">PURCHASE REQUEST</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
            <div className="space-y-1">
              <div className="flex"><span className="w-24 text-zinc-600">No. PR</span><span className="text-black">{pr.documentNo ?? (pr as any).prNo ?? formatId(pr.id)}</span></div>
              <div className="flex"><span className="w-24 text-zinc-600">Urgency</span><span className="text-black">{String((pr as any).urgency ?? "MEDIUM")}</span></div>
            </div>
            <div className="space-y-1">
              <div className="flex"><span className="w-24 text-zinc-600">Request Date</span><span className="text-black">{pr.requestDate ? new Date(pr.requestDate).toLocaleDateString("id-ID").replace(/\//g, "-") : ""}</span></div>
              <div className="flex"><span className="w-24 text-zinc-600">Expected Date</span><span className="text-black">{pr.expectedDate ? new Date(pr.expectedDate).toLocaleDateString("id-ID").replace(/\//g, "-") : ""}</span></div>
              <div className="flex"><span className="w-24 text-zinc-600">Currency</span><span className="text-black">{(pr as any).currency ?? baseCurrency ?? "IDR"}</span></div>
            </div>
          </div>
          <div className="mt-4 border-t border-zinc-200 pt-4 text-[11px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-black">SHIP TO</div>
              <div className="mt-2 font-medium text-black">{warehouse?.name ?? warehouseName(pr.warehouseId)}</div>
              <div className="mt-1 leading-snug text-zinc-600">{(warehouse as any)?.address ?? (company as any)?.address ?? ""}</div>
              <div className="mt-2 space-y-0.5 text-zinc-600"><div>PIC : {(warehouse as any)?.pic ?? (warehouse as any)?.contactPerson ?? ""}</div><div>Telp : {(warehouse as any)?.phone ?? ""}</div></div>
            </div>
          </div>
          <table className="mt-6 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-50">
                <th className="px-2 py-2 text-center font-medium text-zinc-600 w-8">No</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-600">Item Name</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-600 w-16">Qty</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-600 w-16">UOM</th>
                <th className="px-2 py-2 text-right font-medium text-zinc-600 w-28">Rate</th>
                <th className="px-2 py-2 text-right font-medium text-zinc-600 w-32">Amount</th>
              </tr>
            </thead>
            <tbody className="text-[10px] text-black">
              {(pr.lines ?? []).map((l: any, idx: number) => {
                const qty = Number(l.qty || 0);
                const price = Number(l.unitPrice ?? 0);
                const amt = qty * price;
                const itemRec = (typeof items !== "undefined" ? (items as any).find((x: any) => x.id === l.itemId) : null) ?? null;
                const uomRec = (typeof uoms !== "undefined" ? (uoms as any).find((x: any) => x.id === (l.uomId ?? "")) : null) ?? null;
                return (
                  <tr key={idx} className="hover:bg-zinc-50/50">
                    <td className="px-2 py-2 text-center tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-2">{itemRec ? `${itemRec.code}: ${itemRec.name}` : l.itemId}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{formatNumber(qty)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{uomRec?.name ?? "UOM"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{sym((pr as any).currency || baseCurrency)} {formatNumber(price)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{sym((pr as any).currency || baseCurrency)} {formatNumber(amt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <div className="w-[280px] space-y-0 text-[11px]">
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Subtotal</span><span className="tabular-nums font-medium text-black">{sym((pr as any).currency || baseCurrency)} {formatNumber(viewSubtotal)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Discount</span><span className="tabular-nums font-medium text-black">- {sym((pr as any).currency || baseCurrency)} {formatNumber(viewDiscountTotal + viewGlobalDiscountAmount)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">{Number(viewTaxRate || 0) === 0 ? "Tax 0%" : `Tax (${Math.round(Number(viewTaxRate))}%)`}</span><span className="tabular-nums font-medium text-black">{sym((pr as any).currency || baseCurrency)} {formatNumber(viewTax)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Additional Charges</span><span className="tabular-nums font-medium text-black">{sym((pr as any).currency || baseCurrency)} {formatNumber(viewAdditionalChargesTotal)}</span></div>
              <div className="flex justify-between border-t border-zinc-900 px-2 py-2 font-semibold text-black"><span>Grand Total</span><span className="tabular-nums">{sym((pr as any).currency || baseCurrency)} {formatNumber(viewGrandTotal)}</span></div>
            </div>
          </div>
          <div className="mt-6 border-t border-zinc-200 pt-3 text-[11px]">
            <div className="font-bold uppercase tracking-wide">Notes</div>
            <div className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-700">{(pr as any).notes?.trim() ? (pr as any).notes : pr.notes?.trim() ? pr.notes : ""}</div>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-8 text-center text-[11px]">
            <div className="flex flex-col items-center">
              <div className="font-semibold tracking-wide text-black">Prepared By</div>
              <div className="mt-3 flex h-[64px] w-[180px] items-center justify-center">
                {(pr as any).preparedSignature ? (
                  <img src={(pr as any).preparedSignature} alt="Prepared signature" className="max-h-[64px] max-w-[180px] object-contain" />
                ) : null}
              </div>
              <div className="h-px w-[180px] bg-zinc-900" />
              <div className="mt-2 text-[10px] font-medium text-black">{(pr as any).preparedByName ?? (pr as any).createdByName ?? ""}</div>
              <div className="text-[10px] text-zinc-600">{formatDdMmmYyyy((pr as any).preparedSignedAt ?? pr.requestDate)}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="font-semibold tracking-wide text-black">Approved By</div>
              <div className="mt-3 flex h-[64px] w-[180px] items-center justify-center">
                {(pr as any).approvedSignature ? (
                  <img src={(pr as any).approvedSignature} alt="Approved signature" className="max-h-[64px] max-w-[180px] object-contain" />
                ) : null}
              </div>
              <div className="h-px w-[180px] bg-zinc-900" />
              <div className="mt-2 text-[10px] font-medium text-black">{(pr as any).approvedByName ?? ""}</div>
              <div className="text-[10px] text-zinc-600">{(pr as any).approvedSignedAt ? formatDdMmmYyyy((pr as any).approvedSignedAt) : (pr as any).status === "APPROVED" ? formatDdMmmYyyy((pr as any).updatedAt) : ""}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
