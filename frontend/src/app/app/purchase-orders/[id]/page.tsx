import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { X, Coins, ChevronDown, Briefcase, Printer, ChevronsUpDown, PackageCheck, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  usePurchaseOrder,
  useSuppliers,
  useBranches,
  useAllWarehouses,
  useUoms,
  useTaxCategories,
  usePriceLists,
  useCompanySettings,
  useExchangeRate,
  useUpdatePurchaseOrder,
  usePostPurchaseOrder,
  useApprovePurchaseOrder,
  useRejectPurchaseOrder,
  useCancelPurchaseOrder,
  useRemovePurchaseOrder,
  useCreateReceiptFromPo,
  useItemsList,
  useWorkflows,
  useWorkflowStates,
  useUserSignature,
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
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { ActivityTimeline } from "@/components/activity/activity-timeline";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { useErrorToast } from "@/hooks/use-error-toast";
import { createPortal } from "react-dom";
import { useRef } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatId, formatNumber } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";

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
          // allow free typing, update value directly for free text
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
          // keep typed value if not picking
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

export default function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: uoms = [] } = useUoms();
  const update = useUpdatePurchaseOrder();
  const post = usePostPurchaseOrder();
  const cancel = useCancelPurchaseOrder();
  const remove = useRemovePurchaseOrder();
  const createReceipt = useCreateReceiptFromPo();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [editing, setEditing] = useState(false);

  const lines = po?.lines ?? [];
  const supplierName = (sid?: string) => suppliers.find((s) => s.id === sid)?.name ?? "";
  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "";

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
        <p className="py-20 text-center text-muted-foreground">Loading…</p>
      </RoleGuard>
    );
  }
  if (!po) {
    return (
      <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
        <p className="py-20 text-center text-foreground">Purchase order not found.</p>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <POBody
        po={po}
        editing={editing}
        setEditing={setEditing}
        supplierName={supplierName}
        warehouseName={warehouseName}
        suppliers={suppliers}
        warehouses={warehouses}
        uoms={uoms}
        update={update}
        post={post}
        cancel={cancel}
        remove={remove}
        createReceipt={createReceipt}
        navigate={navigate}
      />
    </RoleGuard>
  );
}

function POBody({
  po,
  editing,
  setEditing,
  supplierName,
  warehouseName,
  suppliers,
  warehouses,
  uoms,
  update,
  post,
  cancel,
  remove,
  createReceipt,
  navigate,
}: {
  po: PurchaseOrder;
  editing: boolean;
  setEditing: (v: boolean) => void;
  supplierName: (id?: string) => string;
  warehouseName: (id?: string) => string;
  suppliers: { id: string; name: string }[];
  warehouses: { id: string; name: string }[];
  uoms: { id: string; name: string }[];
  update: ReturnType<typeof useUpdatePurchaseOrder>;
  post: ReturnType<typeof usePostPurchaseOrder>;
  cancel: ReturnType<typeof useCancelPurchaseOrder>;
  remove: ReturnType<typeof useRemovePurchaseOrder>;
  createReceipt: ReturnType<typeof useCreateReceiptFromPo>;
  navigate: (to: string) => void;
}) {
  const [err, setErr] = useState("");
  useErrorToast(err);
  const { user } = useSession();
  const { data: taxCategories = [] } = useTaxCategories();
  const { data: priceLists = [] } = usePriceLists();
  const { data: branches = [] } = useBranches();
  const { data: company } = useCompanySettings();
  const { data: items = [] } = useItemsList();
  const { data: workflows = [] } = useWorkflows();
  const workflowIdForPO = (po as any).approvalWorkflowId || (workflows as any[]).find((w: any) => String(w.documentType).toUpperCase() === "PO" && w.isDefault)?.id;
  const { data: workflowStates = [] } = useWorkflowStates(workflowIdForPO);
  const { data: mySignature } = useUserSignature();
  const [optimisticDraft, setOptimisticDraft] = useState(false);
  useEffect(() => {
    if (po.status === "DRAFT") setOptimisticDraft(false);
  }, [po.status]);
  const isDraft = po.status === "DRAFT" || optimisticDraft;
  const isPendingApproval = String(po.status ?? "").toUpperCase() === "PENDING_APPROVAL";
  const isApproved = String(po.status ?? "").toUpperCase() === "APPROVED" || (! (po as any).needApproval && (String(po.status ?? "").toUpperCase() === "POSTED" || String(po.status ?? "").toUpperCase() === "POST"));
  const isRejected = String(po.status ?? "").toUpperCase() === "REJECTED";
  const isPosted = isApproved; // legacy alias untuk tombol Create/Print
  const editable = isDraft || editing;
  const approve = useApprovePurchaseOrder();
  const rejectHook = useRejectPurchaseOrder();
  const pendingRoleName = useMemo(() => {
    if (!isPendingApproval || !(po as any).needApproval) return null;
    const level = Number((po as any).currentApprovalLevel || 1);
    const sorted = [...(workflowStates as any[])].sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
    const intermediate = sorted.filter((s: any) => s.type === "intermediate");
    const levels = intermediate.length > 0 ? intermediate : sorted;
    const st = levels[level - 1];
    return st?.name ?? `Level ${level}`;
  }, [isPendingApproval, po, workflowStates]);
  const pendingRequiresSignature = useMemo(() => {
    if (!isPendingApproval || !(po as any).needApproval) return false;
    const level = Number((po as any).currentApprovalLevel || 1);
    const sorted = [...(workflowStates as any[])].sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
    const intermediate = sorted.filter((s: any) => s.type === "intermediate");
    const levels = intermediate.length > 0 ? intermediate : sorted;
    const st = levels[level - 1];
    return !!st?.requiresSignature;
  }, [isPendingApproval, po, workflowStates]);
  const [form, setForm] = useState({
    supplierId: po.supplierId,
    warehouseId: po.warehouseId,
    orderDate: po.orderDate?.slice(0, 10) ?? todayISO(),
    expectedDate: po.expectedDate?.slice(0, 10) ?? "",
    notes: po.notes ?? "",
    department: (po as any).department ?? "",
    costCenter: (po as any).costCenter ?? "",
    branchId: (po as any).branchId ?? "",
    paymentTerms: (po as any).paymentTerms ?? "",
    priceListId: (po as any).priceListId ?? "",
    currency: (po as any).currency ?? (company as any)?.baseCurrency ?? "IDR",
    exchangeRate: String((po as any).exchangeRate ?? "1"),
    allowEditOrderDate: (po as any).allowEditOrderDate ?? false,
    qcRequired: (po as any).qcRequired ?? true,
    needApproval: (po as any).needApproval ?? false,
    globalDiscountPercent: String((po as any).globalDiscountPercent ?? "0"),
    additionalCharges: ((po as any).additionalCharges ?? []) as { type: string; amount: string }[],
    taxRate: String((po as any).taxRate ?? "0"),
    taxCategoryId: (po as any).taxCategoryId ?? "",
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
    (po.lines ?? []).map((l) => ({
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

  // Sync form/lines when PO refetched (after save/post) — keep UI consistent
  useEffect(() => {
    setForm({
      supplierId: po.supplierId,
      warehouseId: po.warehouseId,
      orderDate: po.orderDate?.slice(0, 10) ?? todayISO(),
      expectedDate: po.expectedDate?.slice(0, 10) ?? "",
      notes: po.notes ?? "",
      department: (po as any).department ?? "",
      costCenter: (po as any).costCenter ?? "",
      branchId: (po as any).branchId ?? "",
      paymentTerms: (po as any).paymentTerms ?? "",
      priceListId: (po as any).priceListId ?? "",
      currency: (po as any).currency ?? baseCurrency ?? "IDR",
      exchangeRate: String((po as any).exchangeRate ?? "1"),
      allowEditOrderDate: (po as any).allowEditOrderDate ?? false,
      qcRequired: (po as any).qcRequired ?? true,
      needApproval: (po as any).needApproval ?? false,
      globalDiscountPercent: String((po as any).globalDiscountPercent ?? "0"),
      additionalCharges: ((po as any).additionalCharges ?? []) as { type: string; amount: string }[],
      taxRate: String((po as any).taxRate ?? "0"),
      taxCategoryId: (po as any).taxCategoryId ?? "",
    });
    setLines(
      (po.lines ?? []).map((l) => ({
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
  }, [po.publicId, po.updatedAt]);

  const initialSnapshot = useMemo(() => {
    const f = {
      supplierId: po.supplierId,
      warehouseId: po.warehouseId,
      orderDate: po.orderDate?.slice(0, 10) ?? "",
      expectedDate: po.expectedDate?.slice(0, 10) ?? "",
      notes: po.notes ?? "",
      department: (po as any).department ?? "",
      costCenter: (po as any).costCenter ?? "",
      branchId: (po as any).branchId ?? "",
      paymentTerms: (po as any).paymentTerms ?? "",
      priceListId: (po as any).priceListId ?? "",
      currency: (po as any).currency ?? "IDR",
      exchangeRate: String((po as any).exchangeRate ?? "1"),
      allowEditOrderDate: (po as any).allowEditOrderDate ?? false,
      qcRequired: (po as any).qcRequired ?? true,
      needApproval: (po as any).needApproval ?? false,
      globalDiscountPercent: String((po as any).globalDiscountPercent ?? "0"),
      additionalCharges: ((po as any).additionalCharges ?? []) as { type: string; amount: string }[],
      taxRate: String((po as any).taxRate ?? "0"),
      taxCategoryId: (po as any).taxCategoryId ?? "",
    };
    const l = (po.lines ?? []).map((x: any) => ({
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
  }, [po]);

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
    const wasCanceled = po.status === "CANCELED";
    try {
      await update.mutateAsync({
        id: po.id,
        patch: {
          supplierId: form.supplierId,
          warehouseId: form.warehouseId,
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
        },
      });
      if (wasCanceled) setOptimisticDraft(true);
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
    const cur = (editable ? form.currency : (po as any).currency || baseCurrency || "IDR").toUpperCase();
    if (cur === "IDR") return totalAmount;
    const rate = Number(editable ? form.exchangeRate : (po as any).exchangeRate || 1);
    if (!isFinite(rate) || rate === 0) return totalAmount;
    return totalAmount * rate;
  })();

  const viewTaxRate = editable ? form.taxRate : String((po as any).taxRate ?? "0");
  const viewTaxRateNum = Number(viewTaxRate || 0);
  const viewCatName = (po as any).taxCategoryName ?? null;
  const viewHasTax = !!((po as any).taxCategoryId) && viewTaxRateNum > 0;
  const viewSubtotal = editable ? subtotal : (po.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  const viewDiscountTotal = editable ? discountTotal : (po.lines ?? []).reduce((s: number, l: any) => s + Number((l as any).discount || 0), 0);
  const viewGlobalDiscountPercent = editable ? form.globalDiscountPercent : String((po as any).globalDiscountPercent ?? "0");
  const viewGlobalDiscountPercentNum = Number(viewGlobalDiscountPercent || 0);
  const viewGlobalDiscountAmount = viewSubtotal * (viewGlobalDiscountPercentNum / 100);
  const viewAdditionalCharges = editable ? form.additionalCharges : ((po as any).additionalCharges ?? []);
  const viewAdditionalChargesTotal = (viewAdditionalCharges ?? []).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
  const viewTaxable = Math.max(0, viewSubtotal - viewDiscountTotal - viewGlobalDiscountAmount);
  const viewTax = viewHasTax ? viewTaxable * (viewTaxRateNum / 100) : 0;
  const viewGrandTotal = viewTaxable + viewTax + viewAdditionalChargesTotal;
  const viewTotalQty = editable ? totalQty : (po.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty || 0), 0);
  const viewTotalAmount = editable
    ? totalAmount
    : (po.lines ?? []).reduce((s: number, l: any) => {
        const qty = Number(l.qty || 0);
        const price = Number(l.unitPrice || 0);
        const amt = qty * price;
        return s + (amt > 0 ? amt : 0);
      }, 0);
  const viewTotalAmountIDR = (() => {
    const cur = ((po as any).currency || baseCurrency || "IDR").toUpperCase();
    const amt = viewTotalAmount;
    if (cur === "IDR") return amt;
    const rate = Number((po as any).exchangeRate || 1);
    if (!isFinite(rate) || rate === 0) return amt;
    return amt * rate;
  })();

  const onPost = async () => {
    if (!confirm("Post this purchase order?")) return;
    try {
      await post.mutateAsync(po.id);
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
    if (!confirm("Approve this purchase order?")) return;
    try {
      await approve.mutateAsync(po.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to approve.");
    }
  };
  const onReject = async () => {
    if (!confirm("Reject this purchase order?")) return;
    try {
      await rejectHook.mutateAsync(po.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reject.");
    }
  };
  const onCancel = async () => {
    if (!confirm("Cancel this purchase order?")) return;
    try {
      await cancel.mutateAsync(po.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to cancel.");
    }
  };
  const onDelete = async () => {
    if (!confirm("Delete this purchase order? Data akan dihapus dari database.")) return;
    try {
      await remove.mutateAsync(po.id);
      navigate("/app/purchase-orders");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete.");
    }
  };
  const onReceipt = async () => {
    if (!confirm("Create a Goods Receipt from this PO?")) return;
    try {
      const res = await createReceipt.mutateAsync({ id: po.id, receiptDate: todayISO() });
      navigate(`/app/goods-receipts/${res.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create receipt.");
    }
  };

  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const warehouse = warehouses.find((w) => w.id === po.warehouseId);
  return (
    <>
      <div className="print:hidden">
        <FormPage
          title={po.documentNo ?? (po as any).poNo ?? `PO ${formatId(po.id)}`}
          titleBadge={
            ((isDraft && dirty && !optimisticDraft) || (po.status === "CANCELED" && editing && !optimisticDraft)) ? (
              <Badge tone="destructive">Not save</Badge>
            ) : isPendingApproval && (po as any).needApproval && pendingRoleName ? (
              <Badge tone="warning">Pending for {pendingRoleName}</Badge>
            ) : (
              <DocStatusBadge status={optimisticDraft ? "DRAFT" : po.status} />
            )
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!editing && isApproved && (
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Print" onClick={() => window.print()}>
                  <Printer size={16} />
                </Button>
              )}
              {!editing && isApproved && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-7 gap-1 bg-black px-3 text-xs text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200" aria-label="Create">
                      Create <ChevronsUpDown size={14} className="opacity-80" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => navigate(`/app/receiving/new?purchaseOrderId=${po.id}`)}
                    >
                      <PackageCheck size={14} /> Purchase Receipt
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2"
                      onClick={() => toast.info("Purchase Invoice belum tersedia")}
                    >
                      <FileText size={14} /> Purchase Invoice
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {!editing && isPendingApproval && (po as any).needApproval && (
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
                  onEdit={undefined}
                  onCancel={onCancel}
                  onDelete={onDelete}
                  cancelDisabled={po.status === "CANCELED" || post.isPending}
                />
              )}
              {po.status === "CANCELED" && !editing && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditing(true)}>
                  Amend
                </Button>
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
                <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setOptimisticDraft(false); }}>
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
        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-3">
          {editable ? (
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
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Supplier</label>
              <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                {supplierName(po.supplierId)}
              </div>
            </div>
          )}
          <DatePicker
            label="Order Date"
            value={form.orderDate}
            onChange={(v) => setForm({ ...form, orderDate: v })}
            disabled={!editable || !form.allowEditOrderDate}
          />
          <div className="row-span-2 flex flex-col justify-center gap-2 py-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={form.allowEditOrderDate}
                onCheckedChange={(v) => setForm({ ...form, allowEditOrderDate: v === true })}
                disabled={!editable}
              />
              Edit Order Date
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={form.qcRequired}
                onCheckedChange={(v) => setForm({ ...form, qcRequired: v === true })}
                disabled={!editable}
              />
              QC Required
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={form.needApproval}
                onCheckedChange={(v) => setForm({ ...form, needApproval: v === true })}
                disabled={!editable}
              />
              Need Approval
            </label>
          </div>

          <Input
            label="Purchaser Name"
            value={editable ? (user?.name ?? "") : ((po as unknown as { createdByName?: string }).createdByName ?? supplierName(po.supplierId) ?? "")}
            disabled
            placeholder="Auto dari akun"
          />
          <DatePicker
            label="Expected Date"
            value={form.expectedDate}
            onChange={(v) => setForm({ ...form, expectedDate: v })}
            disabled={!editable}
          />
          <div />
        </div>
        <div className="border-t border-border my-4" />
        <Collapsible open={accountingOpen} onOpenChange={setAccountingOpen} className="mt-6">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
              <span>Accounting Dimension</span>
              <ChevronDown size={14} className={`transition-transform ${accountingOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2">
              {editable ? (
                <Input
                  label="Department"
                  placeholder="e.g. Purchasing"
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Department</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {(po as any).department ?? ""}
                  </div>
                </div>
              )}
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
                    {branches.find((b) => b.id === (po as any).branchId)?.name ?? (po as any).branchId ?? ""}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 max-w-[260px]">
              {editable ? (
                <Input
                  label="Cost Center"
                  placeholder="e.g. CC-001"
                  value={form.costCenter}
                  onChange={(e) => setForm({ ...form, costCenter: e.target.value })}
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Cost Center</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {(po as any).costCenter ?? ""}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <div className="border-t border-border my-4" />
        <Collapsible open={currencyOpen} onOpenChange={setCurrencyOpen} className="mt-6">
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
              <span>Currency & Exchange</span>
              <ChevronDown size={14} className={`transition-transform ${currencyOpen ? "rotate-180" : ""}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
              {editable ? (
                <Select
                  label="Currency"
                  value={form.currency || baseCurrency}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRateManuallyEdited(false);
                    setForm({ ...form, currency: v, exchangeRate: v === baseCurrency ? "1" : form.exchangeRate });
                  }}
                  disabled={!editable}
                  className="h-8"
                >
                  {["IDR", "USD", "EUR", "SGD", "JPY", "CNY", "MYR", "THB", "AUD"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Currency</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {(po as any).currency ?? baseCurrency}
                  </div>
                </div>
              )}
              {editable ? (
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
                    disabled={form.currency === baseCurrency}
                    className="h-8 text-sm"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Exchange Rate</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {(po as any).exchangeRate ?? "1"}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <div className="border-t border-border my-4" />
        <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {editable ? (
            <Input
              label="Payment Terms"
              placeholder="e.g. NET 30"
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Payment Terms</label>
              <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                {(po as any).paymentTerms ?? ""}
              </div>
            </div>
          )}
          {editable ? (
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
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Price List</label>
              <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                {(po as any).priceListName ?? priceLists.find((p) => p.id === (po as any).priceListId)?.name ?? ""}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-border my-4" />
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
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Target Warehouse</label>
              <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                {warehouseName(po.warehouseId)}
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
          headerDeliveryDate={form.expectedDate}
          currency={editable ? form.currency : (po as any).currency}
          exchangeRate={editable ? form.exchangeRate : (po as any).exchangeRate}
          baseCurrency={baseCurrency}
          priceListId={editable ? form.priceListId : (po as any).priceListId}
          supplierId={editable ? form.supplierId : po.supplierId}
        />
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Input label="Total Quantity" value={formatNumber(editable ? totalQty : viewTotalQty)} disabled className="h-8 bg-zinc-100 text-sm" />
            <div className="hidden sm:block" aria-hidden="true" />
            <Input label="Total (IDR)" value={`Rp ${formatNumber(editable ? totalAmountIDR : viewTotalAmountIDR)}`} disabled className="h-8 bg-zinc-100 text-sm" />
          </div>
          <div className="border-t border-border my-4" />
          <Collapsible open={chargesOpen} onOpenChange={setChargesOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className="flex items-center gap-2 text-sm font-medium hover:text-primary">
              <span>Additional Charges</span>
              <ChevronDown size={14} className={`transition-transform ${chargesOpen ? "rotate-180" : ""}`} />
              {additionalChargesTotal > 0 && (
                <span className="text-xs text-muted-foreground">
                  • {sym(editable ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editable ? additionalChargesTotal : viewAdditionalChargesTotal)}
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
                          disabled={!editable}
                          aria-label="select all charges"
                        />
                      </TableHead>
                      <TableHead className="w-10 px-3 text-left">No.</TableHead>
                      <TableHead className="w-1/2 px-3 text-left">Type</TableHead>
                      <TableHead className="w-1/2 px-3 text-left">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-border/70 divide-x divide-border">
                    {(editable ? form.additionalCharges : viewAdditionalCharges).map((c: any, idx: number) => (
                      <TableRow key={idx} className="border-border/70 hover:bg-transparent divide-x divide-border">
                        <TableCell className="px-2 text-center">
                          <Checkbox
                            checked={selectedCharges.has(idx)}
                            onCheckedChange={(v) => toggleCharge(idx, !!v)}
                            disabled={!editable}
                            aria-label={`select charge ${idx + 1}`}
                          />
                        </TableCell>
                        <TableCell className="px-3 text-center text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="p-0 border-r border-border">
                          {editable ? (
                            <ChargeTypeSelect
                              value={c.type}
                              onChange={(v) =>
                                setForm((f) => ({
                                  ...f,
                                  additionalCharges: f.additionalCharges.map((x, i) => (i === idx ? { ...x, type: v } : x)),
                                }))
                              }
                            />
                          ) : (
                            <div className="px-3 py-2 text-[13px] capitalize">{c.type || ""}</div>
                          )}
                        </TableCell>
                        <TableCell className="p-0">
                          {editable ? (
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
                          ) : (
                            <div className="px-3 py-2 text-right tabular-nums">{c.amount ? formatNumber(c.amount) : "0"}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(editable ? form.additionalCharges : viewAdditionalCharges).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No additional charges
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {editable && (
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
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
        <div className="mt-6 grid gap-4 sm:grid-cols-3 border-t border-border pt-6">
          <div className="space-y-4">
            {editable ? (
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
            ) : (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium leading-none">Tax Category</label>
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                  {(po as any).taxCategoryName ?? ""}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Discount (%)</label>
              {editable ? (
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
              ) : (
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                  {viewGlobalDiscountPercent && Number(viewGlobalDiscountPercent) !== 0 ? `${Number(viewGlobalDiscountPercent).toString()}%` : "0%"}
                </div>
              )}
            </div>
          </div>
          <div className="hidden sm:block" aria-hidden="true" />
          <div className="flex flex-col items-end">
            <div className="w-full max-w-[320px] space-y-2 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">
                  {sym(editable ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editable ? subtotal : viewSubtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium tabular-nums">
                  - {sym(editable ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editable ? discountTotal + globalDiscountAmount : viewDiscountTotal + viewGlobalDiscountAmount)}
                </span>
              </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {editable
                      ? Number(form.taxRate || 0) === 0
                        ? "Tax 0%"
                        : `Tax (${Math.round(Number(form.taxRate))}%)`
                      : Number(viewTaxRate || 0) === 0
                        ? "Tax 0%"
                        : `Tax (${Math.round(Number(viewTaxRate))}%)`}
                  </span>
                  <span className="font-medium tabular-nums">
                    {sym(editable ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editable ? tax : viewTax)}
                  </span>
                </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Additional Charges</span>
                <span className="font-medium tabular-nums">
                  {sym(editable ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editable ? additionalChargesTotal : viewAdditionalChargesTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="font-semibold">Grand Total</span>
                <span className="font-bold tabular-nums">
                  {sym(editable ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editable ? grandTotal : viewGrandTotal)}
                </span>
              </div>
              </div>
            </div>
        </div>
      </FormSection>

      {!editing && po.receipts && po.receipts.length > 0 && (
        <FormSection title="Linked Goods Receipts">
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {po.receipts.map((r) => (
              <Link key={r.id} to={`/app/goods-receipts/${r.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/60">
                <span className="text-[13px] font-semibold">GR {(r as any).documentNo ?? (r as any).grNo ?? formatId(r.id)}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{r.receiptDate?.slice(0, 10)}</span>
                  <DocStatusBadge status={r.status} />
                </div>
              </Link>
            ))}
          </div>
        </FormSection>
      )}

      <FormSection title="Activity Log">
        <ActivityTimeline documentType="PO" documentId={po.id} />
      </FormSection>
    </FormPage>
      </div>
      {/* Print view - dokumen resmi A4, hanya PO (tanpa header aplikasi, tanpa URL/jam browser) */}
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
              <div className="text-base font-bold tracking-[0.15em] text-black">PURCHASE ORDER</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
            <div className="space-y-1">
              <div className="flex"><span className="w-24 text-zinc-600">No. PO</span><span className="text-black">{po.documentNo ?? (po as any).poNo ?? formatId(po.id)}</span></div>
              <div className="flex"><span className="w-24 text-zinc-600">Referensi PR</span><span className="text-black">{(po as any).prNo ?? (po as any).referenceNo ?? (po as any).reference ?? ""}</span></div>
              <div className="flex"><span className="w-24 text-zinc-600">Payment Terms</span><span className="text-black">{(po as any).paymentTerms ?? ""}</span></div>
            </div>
            <div className="space-y-1">
              <div className="flex"><span className="w-24 text-zinc-600">Order Date</span><span className="text-black">{po.orderDate ? new Date(po.orderDate).toLocaleDateString("id-ID").replace(/\//g, "-") : ""}</span></div>
              <div className="flex"><span className="w-24 text-zinc-600">Delivery Date</span><span className="text-black">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString("id-ID").replace(/\//g, "-") : ""}</span></div>
              <div className="flex"><span className="w-24 text-zinc-600">Currency</span><span className="text-black">{(po as any).currency ?? baseCurrency ?? "IDR"}</span></div>
              {String((po as any).currency ?? baseCurrency).toUpperCase() !== String((company as any)?.baseCurrency ?? baseCurrency).toUpperCase() ? (
                <div className="flex"><span className="w-24 text-zinc-600">Exchange Rate</span><span className="text-black">{(po as any).exchangeRate ?? "1"}</span></div>
              ) : null}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-zinc-200 pt-4 text-[11px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-black">TO</div>
              <div className="mt-2 font-medium text-black">{supplier?.name ?? supplierName(po.supplierId)}</div>
              <div className="mt-1 leading-snug text-zinc-600">{(supplier as any)?.address ?? ""}</div>
              <div className="mt-2 space-y-0.5 text-zinc-600"><div>PIC : {(supplier as any)?.contactPerson ?? ""}</div><div>Telp : {(supplier as any)?.phone ?? ""}</div><div>Email : {(supplier as any)?.email ?? ""}</div></div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-black">SHIP TO</div>
              <div className="mt-2 font-medium text-black">{warehouse?.name ?? warehouseName(po.warehouseId)}</div>
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
              {(po.lines ?? []).map((l: any, idx: number) => {
                const it = (lines as any)[idx] ?? l;
                const qty = Number(it.qty || l.qty || 0);
                const price = Number(it.unitPrice ?? l.unitPrice ?? 0);
                const amt = qty * price;
                const itemRec = (typeof items !== "undefined" ? (items as any).find((x: any) => x.id === l.itemId) : null) ?? null;
                const uomRec = (typeof uoms !== "undefined" ? (uoms as any).find((x: any) => x.id === (l.uomId ?? it.uomId)) : null) ?? null;
                return (
                  <tr key={idx} className="hover:bg-zinc-50/50">
                    <td className="px-2 py-2 text-center tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-2">{itemRec ? `${itemRec.code}: ${itemRec.name}` : l.itemId}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{formatNumber(qty)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{uomRec?.name ?? "UOM"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{sym((po as any).currency || baseCurrency)} {formatNumber(price)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{sym((po as any).currency || baseCurrency)} {formatNumber(amt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <div className="w-[280px] space-y-0 text-[11px]">
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Subtotal</span><span className="tabular-nums font-medium text-black">{sym((po as any).currency || baseCurrency)} {formatNumber(viewSubtotal)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Discount</span><span className="tabular-nums font-medium text-black">- {sym((po as any).currency || baseCurrency)} {formatNumber(viewDiscountTotal + viewGlobalDiscountAmount)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">{Number(viewTaxRate || 0) === 0 ? "Tax 0%" : `Tax (${Math.round(Number(viewTaxRate))}%)`}</span><span className="tabular-nums font-medium text-black">{sym((po as any).currency || baseCurrency)} {formatNumber(viewTax)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span className="text-zinc-600">Additional Charges</span><span className="tabular-nums font-medium text-black">{sym((po as any).currency || baseCurrency)} {formatNumber(viewAdditionalChargesTotal)}</span></div>
              <div className="flex justify-between border-t border-zinc-900 px-2 py-2 font-semibold text-black"><span>Grand Total</span><span className="tabular-nums">{sym((po as any).currency || baseCurrency)} {formatNumber(viewGrandTotal)}</span></div>
            </div>
          </div>
          <div className="mt-6 border-t border-zinc-200 pt-3 text-[11px]">
            <div className="font-bold uppercase tracking-wide">Notes</div>
            <div className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-700">{(po as any).notes?.trim() ? (po as any).notes : po.notes?.trim() ? po.notes : ""}</div>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-8 text-center text-[11px]">
            <div className="flex flex-col items-center">
              <div className="font-semibold tracking-wide text-black">Prepared By</div>
              <div className="mt-3 flex h-[64px] w-[180px] items-center justify-center">
                {(po as any).preparedSignature ? (
                  <img src={(po as any).preparedSignature} alt="Prepared signature" className="max-h-[64px] max-w-[180px] object-contain" />
                ) : null}
              </div>
              <div className="h-px w-[180px] bg-zinc-900" />
              <div className="mt-2 text-[10px] font-medium text-black">{(po as any).preparedByName ?? (po as any).createdByName ?? supplierName(po.supplierId) ?? ""}</div>
              <div className="text-[10px] text-zinc-600">{formatDdMmmYyyy((po as any).preparedSignedAt ?? po.orderDate)}</div>
            </div>
            <div className="flex flex-col items-center">
              <div className="font-semibold tracking-wide text-black">Approved By</div>
              <div className="mt-3 flex h-[64px] w-[180px] items-center justify-center">
                {(po as any).approvedSignature ? (
                  <img src={(po as any).approvedSignature} alt="Approved signature" className="max-h-[64px] max-w-[180px] object-contain" />
                ) : null}
              </div>
              <div className="h-px w-[180px] bg-zinc-900" />
              <div className="mt-2 text-[10px] font-medium text-black">{(po as any).approvedByName ?? ""}</div>
              {(po as any).approvedByRole ? <div className="text-[10px] text-zinc-600">{(po as any).approvedByRole}</div> : null}
              <div className="text-[10px] text-zinc-600">{(po as any).approvedSignedAt ? formatDdMmmYyyy((po as any).approvedSignedAt) : (po as any).status === "APPROVED" ? formatDdMmmYyyy((po as any).updatedAt) : ""}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
