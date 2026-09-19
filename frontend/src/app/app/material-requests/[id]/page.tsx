import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { X, Coins, ChevronDown, Briefcase, Printer, ChevronsUpDown, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  useMaterialRequest,
  useBranches,
  useAllWarehouses,
  useUoms,
  useTaxCategories,
  useCompanySettings,
  useExchangeRate,
  useUpdateMaterialRequest,
  usePostMaterialRequest,
  useApproveMaterialRequest,
  useRejectMaterialRequest,
  useCancelMaterialRequest,
  useRemoveMaterialRequest,
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
import type { MaterialRequest } from "@/types";

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
const CURRENCY_SYMBOLS: Record<string, string> = { IDR: "Rp", USD: "$", EUR: "€", SGD: "S$", JPY: "¥", CNY: "¥", MYR: "RM", THB: "฿", AUD: "A$" };
function sym(cur?: string | null): string {
  if (!cur) return "Rp";
  return CURRENCY_SYMBOLS[cur.toUpperCase()] ?? cur.toUpperCase();
}

export default function MaterialRequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pr, isLoading } = useMaterialRequest(id);
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: uoms = [] } = useUoms();
  const update = useUpdateMaterialRequest();
  const post = usePostMaterialRequest();
  const cancel = useCancelMaterialRequest();
  const remove = useRemoveMaterialRequest();
  const [editing, setEditing] = useState(false);

  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "";

  if (isLoading) {
    return (
      <RoleGuard roles={[]} menus={["supply.materialRequests"]}>
        <p className="py-20 text-center text-muted-foreground">Loading…</p>
      </RoleGuard>
    );
  }
  if (!pr) {
    return (
      <RoleGuard roles={[]} menus={["supply.materialRequests"]}>
        <p className="py-20 text-center text-foreground">Material request not found.</p>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={[]} menus={["supply.materialRequests"]}>
      <PRBody
        pr={pr}
        editing={editing}
        setEditing={setEditing}
        warehouseName={warehouseName}
        warehouses={warehouses}
        uoms={uoms}
        update={update}
        post={post}
        cancel={cancel}
        remove={remove}
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
  warehouses,
  uoms,
  update,
  post,
  cancel,
  remove,
  navigate,
}: {
  pr: MaterialRequest;
  editing: boolean;
  setEditing: (v: boolean) => void;
  warehouseName: (id?: string) => string;
  warehouses: { id: string; name: string }[];
  uoms: { id: string; name: string }[];
  update: ReturnType<typeof useUpdateMaterialRequest>;
  post: ReturnType<typeof usePostMaterialRequest>;
  cancel: ReturnType<typeof useCancelMaterialRequest>;
  remove: ReturnType<typeof useRemoveMaterialRequest>;
  navigate: (to: string) => void;
}) {
  const [err, setErr] = useState("");
  const [paperSize, setPaperSize] = useState<"A4" | "CONTINUOUS">("A4");
  const handlePrint = (size: "A4" | "CONTINUOUS") => {
    setPaperSize(size);
    setTimeout(() => window.print(), 60);
  };
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
  const isRejected = String(pr.status ?? "").toUpperCase() === "REJECTED";
  const editable = isDraft || editing;
  const approve = useApproveMaterialRequest();
  const rejectHook = useRejectMaterialRequest();
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
  const [form, setForm] = useState({    warehouseId: pr.warehouseId,
    requestDate: pr.requestDate?.slice(0, 10) ?? todayISO(),
    expectedDate: pr.expectedDate?.slice(0, 10) ?? "",    notes: pr.notes ?? "",
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
    setForm({      warehouseId: pr.warehouseId,
      requestDate: pr.requestDate?.slice(0, 10) ?? todayISO(),
      expectedDate: pr.expectedDate?.slice(0, 10) ?? "",      notes: pr.notes ?? "",
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
    const f = {      warehouseId: pr.warehouseId,
      requestDate: pr.requestDate?.slice(0, 10) ?? "",
      expectedDate: pr.expectedDate?.slice(0, 10) ?? "",      notes: pr.notes ?? "",
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
        patch: {          warehouseId: form.warehouseId,
          requestDate: form.requestDate,
          expectedDate: form.expectedDate || null,          notes: form.notes.trim() || null,
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
            deliveryDate: (l.deliveryDate || form.expectedDate) || null,
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
    if (!confirm("Post this material request?")) return;
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
    if (!confirm("Approve this material request?")) return;
    try {
      await approve.mutateAsync(pr.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to approve.");
    }
  };
  const onReject = async () => {
    if (!confirm("Reject this material request?")) return;
    try {
      await rejectHook.mutateAsync(pr.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to reject.");
    }
  };
  const onCancel = async () => {
    if (!confirm("Cancel this material request?")) return;
    try {
      await cancel.mutateAsync(pr.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to cancel.");
    }
  };
  const onDelete = async () => {
    if (!confirm("Delete this material request? Data akan dihapus dari database.")) return;
    try {
      await remove.mutateAsync(pr.id);
      navigate("/app/material-requests");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete.");
    }
  };
  const warehouse = warehouses.find((w) => w.id === pr.warehouseId);
  // Print: approval steps mengikuti Approval Flow (intermediate + final).
  // Created By selalu tampil; step selain terakhir = Checked By; step terakhir = Approved By.
  const printApprovalSteps = (() => {
    const sorted = [...((workflowStates as any[]) ?? [])].sort((a: any, b: any) => (a.orderNo ?? 0) - (b.orderNo ?? 0));
    const withFinal = sorted.filter((s: any) => s.type === "intermediate" || s.type === "final");
    const steps = withFinal.length > 0 ? withFinal : sorted.filter((s: any) => s.type !== "initial" && s.type !== "rejected");
    return (pr as any).needApproval ? steps : [];
  })();
  const printCreatorName = (pr as any).createdByName ?? (pr as any).preparedByName ?? requestByName ?? "";
  const printCreatorDate = (pr as any).createdAt ?? (pr as any).preparedSignedAt ?? pr.requestDate;
  const printSlashDate = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB"); // DD/MM/YYYY untuk continuous form
  };
  const printDashDate = (iso?: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("id-ID").replace(/\//g, "-"); // DD-MM-YYYY untuk A4
  };
  const formatDdMmmYyyy = (dateStr?: string | null): string => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };
  const printReqDate = printSlashDate;
  return (
    <>
      <div className="print:hidden">
        <FormPage
          title={pr.documentNo ?? (pr as any).mrNo ?? `MR ${formatId(pr.id)}`}
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
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Print">
                      <Printer size={16} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem className="gap-2" onClick={() => handlePrint("A4")}>
                      <Printer size={14} /> Print A4
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2" onClick={() => handlePrint("CONTINUOUS")}>
                      <Printer size={14} /> Print Continuous 9.5&quot; x 11&quot;
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
            {/* Row 3: Requesting Dept | Target Dept */}
            <div className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
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
              {editable ? (
                <SearchableSelect
                  label="Target Dept"
                  options={departmentOptions}
                  value={form.toDepartment}
                  onChange={(v) => setForm({ ...form, toDepartment: v })}
                  placeholder="Select department..."
                  emptyText="No department found"
                  emptyLabel=""
                />
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Target Dept</label>
                  <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                    {deptLabel((pr as any).toDepartment)}
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
              headerDeliveryDate={form.expectedDate}
              currency={editable ? form.currency : (pr as any).currency}
              exchangeRate={editable ? form.exchangeRate : (pr as any).exchangeRate}
              baseCurrency={baseCurrency}
              variant="material-request"
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Input label="Total Quantity" value={formatNumber(editable ? totalQty : viewTotalQty)} disabled className="h-8 bg-zinc-100 text-sm" />
            </div>
          </FormSection>

          <FormSection title="Activity Log">
            <ActivityTimeline documentType="MR" documentId={pr.id} />
          </FormSection>
        </FormPage>
      </div>
      {/* Print view for MR — template menyesuaikan kertas: A4 biasa / Continuous 9.5 x 11 inch */}
      <style>{`@media print { @page { size: ${paperSize === "CONTINUOUS" ? "9.5in 11in" : "A4"}; margin: ${paperSize === "CONTINUOUS" ? "0.25in 0.3in" : "0"}; } html, body { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } body * { visibility: hidden; } .print-doc, .print-doc * { visibility: visible; } .print-doc { position: absolute; left: 0; top: 0; width: 100%; height: auto; } header, nav, aside { display: none !important; } table { page-break-inside: auto; } tr { page-break-inside: avoid; page-break-after: auto; } }`}</style>
      <div className="hidden print:block print-doc bg-white text-black print:absolute print:inset-0 print:p-0">
        {paperSize === "A4" ? (
        <div className="mx-auto w-[190mm] max-w-[190mm] bg-white p-[10mm] text-black">
          <div className="flex items-start justify-between gap-6 border-b border-zinc-900 pb-3">
            <div className="flex items-start gap-3">
              {(company as any)?.logo ? (
                <img src={(company as any).logo} alt="Logo" className="h-auto w-auto max-h-[64px] max-w-[200px] object-contain" />
              ) : (
                <div className="flex h-[52px] w-[120px] items-center justify-center border border-black text-[11px] font-bold tracking-widest">LOGO</div>
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
              <div className="text-base font-bold tracking-[0.15em] text-black">MATERIAL REQUEST</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
            <div className="space-y-1">
              <div className="flex"><span className="w-28 shrink-0 text-zinc-600">MR No.</span><span className="font-medium text-black">{pr.documentNo ?? (pr as any).mrNo ?? formatId(pr.id)}</span></div>
              <div className="flex"><span className="w-28 shrink-0 text-zinc-600">Requester</span><span className="text-black">{printCreatorName}</span></div>
              <div className="flex"><span className="w-28 shrink-0 text-zinc-600">Requesting Dept.</span><span className="text-black">{deptLabel((pr as any).department)}</span></div>
            </div>
            <div className="space-y-1">
              <div className="flex"><span className="w-28 shrink-0 text-zinc-600">Date</span><span className="text-black">{printDashDate(pr.requestDate)}</span></div>
              <div className="flex"><span className="w-28 shrink-0 text-zinc-600">Target Dept.</span><span className="text-black">{deptLabel((pr as any).toDepartment)}</span></div>
            </div>
          </div>
          <table className="mt-6 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-50">
                <th className="px-2 py-2 text-center font-medium text-zinc-600 w-8">No</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-600">Item Code</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-600 w-28">Required Date</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-600 w-24">QTY Request</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-600 w-16">UOM</th>
              </tr>
            </thead>
            <tbody className="text-[10px] text-black">
              {(pr.lines ?? []).map((l: any, idx: number) => {
                const qty = Number(l.qty || 0);
                const itemRec = (typeof items !== "undefined" ? (items as any).find((x: any) => x.id === l.itemId) : null) ?? null;
                const uomRec = (typeof uoms !== "undefined" ? (uoms as any).find((x: any) => x.id === (l.uomId ?? "")) : null) ?? null;
                const reqDate = (l as any).deliveryDate ?? pr.expectedDate;
                return (
                  <tr key={idx} className="border-b border-zinc-100">
                    <td className="px-2 py-2 text-center tabular-nums">{idx + 1}</td>
                    <td className="px-2 py-2">{itemRec ? `${itemRec.code}: ${itemRec.name}` : l.itemId}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{printDashDate(reqDate)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{formatNumber(qty)}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{uomRec?.name ?? ""}</td>
                  </tr>
                );
              })}
              {(pr.lines ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-zinc-500">No items.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="mt-6 border-t border-zinc-200 pt-3 text-[11px]">
            <div className="font-bold uppercase tracking-wide">Notes</div>
            <div className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-700">{(pr as any).notes?.trim() ? (pr as any).notes : pr.notes?.trim() ? pr.notes : ""}</div>
          </div>
          {(() => {
            const sigCells = [
              {
                key: "created",
                label: "Created By",
                sig: (pr as any).preparedSignature ?? null,
                name: printCreatorName,
                date: formatDdMmmYyyy(printCreatorDate),
              },
              ...printApprovalSteps.map((st: any, idx: number) => {
                const isLast = idx === printApprovalSteps.length - 1;
                const approverName = isLast ? ((pr as any).approvedByName ?? "") : "";
                return {
                  key: st.id ?? `step-${idx}`,
                  label: isLast ? "Approved By" : "Checked By",
                  sig: isLast ? (pr as any).approvedSignature : null,
                  name: approverName || st.name || "",
                  date: isLast
                    ? ((pr as any).approvedSignedAt ? formatDdMmmYyyy((pr as any).approvedSignedAt) : (pr as any).status === "APPROVED" ? formatDdMmmYyyy((pr as any).updatedAt) : "")
                    : "",
                  sub: isLast && approverName && st.name ? st.name : "",
                };
              }),
            ];
            if (sigCells.length === 1) {
              const only = sigCells[0];
              return (
                <div className="mt-10 flex justify-end text-center text-[11px]">
                  <div className="flex w-full max-w-[180px] flex-col items-center">
                    <div className="font-semibold tracking-wide text-black">{only.label}</div>
                    <div className="mt-3 flex h-[64px] w-full items-center justify-center">
                      {only.sig ? (
                        <img src={only.sig} alt={`${only.label} signature`} className="max-h-[64px] max-w-[180px] object-contain" />
                      ) : null}
                    </div>
                    <div className="h-px w-full bg-zinc-900" />
                    <div className="mt-2 text-[10px] font-medium text-black">{only.name}</div>
                    <div className="text-[10px] text-zinc-600">{only.date}</div>
                  </div>
                </div>
              );
            }
            return (
              <div className="mt-10 grid gap-8 text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${sigCells.length}, minmax(0, 1fr))` }}>
                {sigCells.map((c: any) => (
                  <div key={c.key} className="flex flex-col items-center">
                    <div className="font-semibold tracking-wide text-black">{c.label}</div>
                    <div className="mt-3 flex h-[64px] w-full max-w-[180px] items-center justify-center">
                      {c.sig ? (
                        <img src={c.sig} alt={`${c.label} signature`} className="max-h-[64px] max-w-[180px] object-contain" />
                      ) : null}
                    </div>
                    <div className="h-px w-full max-w-[180px] bg-zinc-900" />
                    <div className="mt-2 text-[10px] font-medium text-black">{c.name}</div>
                    <div className="text-[10px] text-zinc-600">{[c.date, c.sub].filter(Boolean).join(" • ")}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        ) : (
        <div className="mx-auto w-full max-w-[8.9in] bg-white font-mono text-black" style={{ fontSize: "11px", lineHeight: 1.4 }}>
          {/* Header: logo + company | title */}
          <div className="flex items-start justify-between gap-4 border-2 border-black px-3 py-2">
            <div className="flex min-w-0 items-start gap-3">
              {(company as any)?.logo ? (
                <img src={(company as any).logo} alt="Logo" className="h-auto w-auto max-h-[64px] max-w-[200px] object-contain" />
              ) : (
                <div className="flex h-[52px] w-[120px] items-center justify-center border border-black text-[11px] font-bold tracking-widest">LOGO</div>
              )}
              <div className="min-w-0 leading-tight">
                <div className="text-[14px] font-bold tracking-tight">{(company as any)?.companyName ?? "PT CONTOH SUKSES MAKMUR"}</div>
                <div className="mt-0.5 max-w-[4.5in] whitespace-pre-wrap break-words text-[10px] leading-snug">{(company as any)?.address ?? "Jl. Industri Raya No. 45, Jakarta Selatan 12345"}</div>
                <div className="mt-0.5 text-[10px]">
                  {[
                    `Telp. ${(company as any)?.phone ?? "+62 86746678829"}`,
                    (company as any)?.email ?? "info@trijaya.co.id",
                    (company as any)?.website ? String((company as any).website).replace(/^https?:\/\//, "") : "www.trijaya.co.id",
                  ].join(" | ")}
                </div>
              </div>
            </div>
            <div className="shrink-0 pt-1 text-right">
              <div className="text-[15px] font-bold tracking-widest">MATERIAL</div>
              <div className="text-[15px] font-bold tracking-widest">REQUEST</div>
            </div>
          </div>
          {/* Meta: MR NO / DATE / REQUESTER / DEPT + TARGET DEPT */}
          <div className="grid grid-cols-2 gap-x-6 border-2 border-t-0 border-black px-3 py-2 text-[11px]">
            <div className="flex gap-2"><span className="w-[92px] shrink-0">MR NO</span><span className="shrink-0">:</span><span className="font-bold">{pr.documentNo ?? (pr as any).mrNo ?? formatId(pr.id)}</span></div>
            <div className="flex gap-2"><span className="w-[92px] shrink-0">DATE</span><span className="shrink-0">:</span><span>{printReqDate(pr.requestDate)}</span></div>
            <div className="flex gap-2"><span className="w-[92px] shrink-0">REQUESTER</span><span className="shrink-0">:</span><span className="truncate">{printCreatorName}</span></div>
            <div className="flex gap-2"><span className="w-[92px] shrink-0">REQ DEPT</span><span className="shrink-0">:</span><span className="truncate">{deptLabel((pr as any).department)}</span></div>
            <div className="col-span-2 flex gap-2"><span className="w-[92px] shrink-0">TARGET DEPT</span><span className="shrink-0">:</span><span className="truncate">{deptLabel((pr as any).toDepartment)}</span></div>
          </div>
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr>
                <th className="w-[36px] border-2 border-t-0 border-black px-1 py-1 text-center font-bold">No</th>
                <th className="border-2 border-l-0 border-t-0 border-black px-2 py-1 text-left font-bold">Item Code</th>
                <th className="w-[110px] border-2 border-l-0 border-t-0 border-black px-1 py-1 text-center font-bold">Required Date</th>
                <th className="w-[100px] border-2 border-l-0 border-t-0 border-black px-1 py-1 text-center font-bold">QTY Request</th>
                <th className="w-[64px] border-2 border-l-0 border-t-0 border-black px-1 py-1 text-center font-bold">UOM</th>
              </tr>
            </thead>
            <tbody>
              {(pr.lines ?? []).map((l: any, idx: number) => {
                const qty = Number(l.qty || 0);
                const itemRec = (typeof items !== "undefined" ? (items as any).find((x: any) => x.id === l.itemId) : null) ?? null;
                const uomRec = (typeof uoms !== "undefined" ? (uoms as any).find((x: any) => x.id === (l.uomId ?? "")) : null) ?? null;
                const reqDate = (l as any).deliveryDate ?? pr.expectedDate;
                return (
                  <tr key={idx}>
                    <td className="border-2 border-t-0 border-black px-1 py-1 text-center tabular-nums">{idx + 1}</td>
                    <td className="border-2 border-l-0 border-t-0 border-black px-2 py-1">{itemRec ? `${itemRec.code}: ${itemRec.name}` : l.itemId}</td>
                    <td className="border-2 border-l-0 border-t-0 border-black px-1 py-1 text-center tabular-nums">{printReqDate(reqDate)}</td>
                    <td className="border-2 border-l-0 border-t-0 border-black px-1 py-1 text-right tabular-nums">{formatNumber(qty)}</td>
                    <td className="border-2 border-l-0 border-t-0 border-black px-1 py-1 text-center">{uomRec?.name ?? ""}</td>
                  </tr>
                );
              })}
              {(pr.lines ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="border-2 border-t-0 border-black px-2 py-4 text-center">No items.</td>
                </tr>
              )}
            </tbody>
          </table>
          {/* Notes */}
          <div className="border-2 border-t-0 border-black px-3 py-2 text-[11px]">
            <div className="flex gap-2">
              <span className="shrink-0 font-bold">NOTES:</span>
              <span className="min-h-[28px] whitespace-pre-wrap break-words">{(pr as any).notes?.trim() ? (pr as any).notes : pr.notes?.trim() ? pr.notes : ""}</span>
            </div>
          </div>
          {/* Signatures — dinamis mengikuti approval flow; 1 ttd saja rata kanan */}
          {(() => {
            const sigCells = [
              {
                key: "created",
                label: "Created By",
                sig: (pr as any).preparedSignature ?? null,
                name: printCreatorName,
                date: printSlashDate(printCreatorDate),
              },
              ...printApprovalSteps.map((st: any, idx: number) => {
                const isLast = idx === printApprovalSteps.length - 1;
                const approverName = isLast ? ((pr as any).approvedByName ?? "") : "";
                const sig = isLast ? (pr as any).approvedSignature : null;
                const signedRaw = isLast
                  ? ((pr as any).approvedSignedAt ?? ((pr as any).status === "APPROVED" ? (pr as any).updatedAt : ""))
                  : "";
                return {
                  key: st.id ?? `step-${idx}`,
                  label: isLast ? "Approved By" : "Checked By",
                  sig,
                  name: approverName || st.name || "",
                  date: printSlashDate(signedRaw),
                  sub: approverName && st.name ? st.name : "",
                };
              }),
            ];
            if (sigCells.length === 1) {
              const only = sigCells[0];
              return (
                <div className="mt-3 flex justify-end">
                  <div className="w-[2.4in] border-2 border-black text-center">
                    <div className="border-b-2 border-black py-1 text-[11px] font-bold">{only.label}</div>
                    <div className="flex h-[72px] items-center justify-center px-2">
                      {only.sig ? <img src={only.sig} alt={`${only.label} signature`} className="max-h-[68px] max-w-full object-contain" /> : null}
                    </div>
                    <div className="border-t border-black px-1 pt-1 text-[11px] font-bold">{only.name}</div>
                    <div className="px-1 pb-1 text-[10px]">{only.date}</div>
                  </div>
                </div>
              );
            }
            return (
              <div className="mt-3 grid text-center" style={{ gridTemplateColumns: `repeat(${sigCells.length}, minmax(0, 1fr))` }}>
                {sigCells.map((c: any) => (
                  <div key={c.key} className="border-2 border-l-0 border-black first:border-l-2">
                    <div className="border-b-2 border-black py-1 text-[11px] font-bold">{c.label}</div>
                    <div className="flex h-[72px] items-center justify-center px-2">
                      {c.sig ? <img src={c.sig} alt={`${c.label} signature`} className="max-h-[68px] max-w-full object-contain" /> : null}
                    </div>
                    <div className="border-t border-black px-1 pt-1 text-[11px] font-bold">{c.name}</div>
                    <div className="px-1 pb-1 text-[10px]">{[c.date, c.sub].filter(Boolean).join(" | ")}</div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        )}
      </div>
    </>
  );
}
