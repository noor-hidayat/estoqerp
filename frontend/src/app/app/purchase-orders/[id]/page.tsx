import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useNavigate, useParams } from "react-router-dom";
import { X, Coins, ChevronDown, Briefcase, Printer } from "lucide-react";
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
  useCancelPurchaseOrder,
  useRemovePurchaseOrder,
  useCreateReceiptFromPo,
  useItemsList,
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
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { OrderLineTable, emptyOrderLine, type OrderLineInput } from "@/components/supply/order-line-table";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId, formatNumber } from "@/lib/utils";
import type { PurchaseOrder } from "@/types";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
  const supplierName = (sid?: string) => suppliers.find((s) => s.id === sid)?.name ?? "—";
  const warehouseName = (wid?: string) => warehouses.find((w) => w.id === wid)?.name ?? "—";

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
    taxRate: String((po as any).taxRate ?? "0"),
    taxCategoryId: (po as any).taxCategoryId ?? "",
  });

  const baseCurrency = (company as any)?.baseCurrency ?? "IDR";
  const [rateManuallyEdited, setRateManuallyEdited] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [accountingOpen, setAccountingOpen] = useState(false);
  const { data: rateData, isFetching: rateFetching } = useExchangeRate(
    editing && form.currency && form.currency !== baseCurrency ? form.currency : undefined,
    editing && form.currency && form.currency !== baseCurrency ? baseCurrency : undefined
  );
  useEffect(() => {
    if (editing && rateData?.rate && !rateManuallyEdited && form.currency !== baseCurrency) {
      const fetched = String(rateData.rate);
      if (fetched !== form.exchangeRate) setForm((f) => ({ ...f, exchangeRate: fetched }));
    }
    if (editing && form.currency === baseCurrency && form.exchangeRate !== "1" && !rateManuallyEdited) {
      setForm((f) => ({ ...f, exchangeRate: "1" }));
    }
  }, [rateData?.rate, editing, form.currency, baseCurrency, form.exchangeRate, rateManuallyEdited]);
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

  const saveEdit = async () => {
    const valid = lines.filter((l) => l.itemId);
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
  const taxable = Math.max(0, subtotal - discountTotal);
  const taxRateNum = Number(form.taxRate || 0);
  const selectedCat = taxCategories.find((c) => c.id === form.taxCategoryId) ?? null;
  const hasTax = !!form.taxCategoryId && taxRateNum > 0;
  const tax = hasTax ? taxable * (taxRateNum / 100) : 0;
  const grandTotal = taxable + tax;
  const totalQty = lines.reduce((s, l) => s + Number(l.qty || 0), 0);
  const totalAmount = lines.reduce((s, l) => {
    const qty = Number(l.qty || 0);
    const price = Number(l.unitPrice || 0);
    const amt = qty * price;
    return s + (amt > 0 ? amt : 0);
  }, 0);
  const totalAmountIDR = (() => {
    const cur = (editing ? form.currency : (po as any).currency || baseCurrency || "IDR").toUpperCase();
    if (cur === "IDR") return totalAmount;
    const rate = Number(editing ? form.exchangeRate : (po as any).exchangeRate || 1);
    if (!isFinite(rate) || rate === 0) return totalAmount;
    return totalAmount * rate;
  })();

  const viewTaxRate = editing ? form.taxRate : String((po as any).taxRate ?? "0");
  const viewTaxRateNum = Number(viewTaxRate || 0);
  const viewCatName = (po as any).taxCategoryName ?? null;
  const viewHasTax = !!((po as any).taxCategoryId) && viewTaxRateNum > 0;
  const viewSubtotal = editing ? subtotal : (po.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty || 0) * Number(l.unitPrice || 0), 0);
  const viewDiscountTotal = editing ? discountTotal : (po.lines ?? []).reduce((s: number, l: any) => s + Number((l as any).discount || 0), 0);
  const viewTaxable = Math.max(0, viewSubtotal - viewDiscountTotal);
  const viewTax = viewHasTax ? viewTaxable * (viewTaxRateNum / 100) : 0;
  const viewGrandTotal = viewTaxable + viewTax;
  const viewTotalQty = editing ? totalQty : (po.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty || 0), 0);
  const viewTotalAmount = editing
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

  const isDraft = po.status === "DRAFT";

  const supplier = suppliers.find((s) => s.id === po.supplierId);
  const warehouse = warehouses.find((w) => w.id === po.warehouseId);
  return (
    <>
      <div className="print:hidden">
        <FormPage
          title={`PO ${po.documentNo ?? (po as any).poNo ?? formatId(po.id)}`}
          titleBadge={<DocStatusBadge status={po.status} />}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!editing && (
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Print" onClick={() => window.print()}>
                  <Printer size={16} />
                </Button>
              )}
              {!editing && (
                <DocMenu
                  onEdit={isDraft ? () => setEditing(true) : undefined}
                  editDisabled={!isDraft}
                  onCancel={onCancel}
                  onDelete={onDelete}
                  cancelDisabled={po.status === "CANCELED" || post.isPending}
                />
              )}
              {!editing && isDraft && (
                <Button variant="primary" size="sm" onClick={onPost} disabled={post.isPending}>
                  Submit
                </Button>
              )}
              {editing && (
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X size={14} strokeWidth={2} /> Discard
                </Button>
              )}
              {editing && (
                <Button variant="primary" size="sm" onClick={saveEdit} disabled={update.isPending}>
                  Save
                </Button>
              )}
            </div>
          }
        >
      <FormSection>
        <div className="grid gap-x-6 gap-y-6 sm:grid-cols-3">
          {editing ? (
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
            disabled={!editing || !form.allowEditOrderDate}
          />
          <div className="row-span-2 flex flex-col justify-center gap-2 py-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={form.allowEditOrderDate}
                onCheckedChange={(v) => setForm({ ...form, allowEditOrderDate: v === true })}
                disabled={!editing}
              />
              Edit Order Date
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={form.qcRequired}
                onCheckedChange={(v) => setForm({ ...form, qcRequired: v === true })}
                disabled={!editing}
              />
              QC Required
            </label>
          </div>

          <Input
            label="Purchaser Name"
            value={editing ? (user?.name ?? "—") : ((po as unknown as { createdByName?: string }).createdByName ?? supplierName(po.supplierId) ?? "—")}
            disabled
            placeholder="Auto dari akun"
          />
          <DatePicker
            label="Expected Date"
            value={form.expectedDate}
            onChange={(v) => setForm({ ...form, expectedDate: v })}
            disabled={!editing}
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
              {editing ? (
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
                    {(po as any).department ?? "—"}
                  </div>
                </div>
              )}
              {editing ? (
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
                    {branches.find((b) => b.id === (po as any).branchId)?.name ?? (po as any).branchId ?? "—"}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 max-w-[260px]">
              {editing ? (
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
                    {(po as any).costCenter ?? "—"}
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
              {editing ? (
                <Select
                  label="Currency"
                  value={form.currency || baseCurrency}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRateManuallyEdited(false);
                    setForm({ ...form, currency: v, exchangeRate: v === baseCurrency ? "1" : form.exchangeRate });
                  }}
                  disabled={!editing}
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
              {editing ? (
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
          {editing ? (
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
                {(po as any).paymentTerms ?? "—"}
              </div>
            </div>
          )}
          {editing ? (
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
                {(po as any).priceListName ?? priceLists.find((p) => p.id === (po as any).priceListId)?.name ?? "—"}
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
              disabled={!editing}
              placeholder={editing ? "Optional notes..." : "—"}
            />
          </div>
          {editing ? (
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
          onChange={editing ? setLines : () => {}}
          readOnly={!editing}
          headerDeliveryDate={form.expectedDate}
          currency={editing ? form.currency : (po as any).currency}
          exchangeRate={editing ? form.exchangeRate : (po as any).exchangeRate}
          baseCurrency={baseCurrency}
          priceListId={editing ? form.priceListId : (po as any).priceListId}
          supplierId={editing ? form.supplierId : po.supplierId}
        />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Input label="Total Quantity" value={formatNumber(editing ? totalQty : viewTotalQty)} disabled className="h-8 bg-zinc-100 text-sm" />
          <div className="hidden sm:block" aria-hidden="true" />
          <Input label="Total Amount (IDR)" value={`Rp ${formatNumber(editing ? totalAmountIDR : viewTotalAmountIDR)}`} disabled className="h-8 bg-zinc-100 text-sm" />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3 sm:divide-x sm:divide-border border-t border-border pt-6">
          <div className="space-y-4 sm:pr-4">
            {editing ? (
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
                  {(po as any).taxCategoryName ?? "—"}
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium leading-none">Tax Rate</label>
              {editing ? (
                <Input
                  value={form.taxRate ? String(Math.round(Number(form.taxRate))) : form.taxRate}
                  onChange={(e) => setForm({ ...form, taxRate: e.target.value.replace(/[^0-9]/g, "") })}
                  placeholder="0"
                  className="h-8 text-sm"
                  type="text"
                  inputMode="numeric"
                />
              ) : (
                <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">
                  {viewTaxRate ? String(Math.round(Number(viewTaxRate))) : viewTaxRate}
                </div>
              )}
            </div>
          </div>
          <div className="hidden sm:block sm:px-4" aria-hidden="true" />
          {(editing ? hasTax : viewHasTax) ? (
            <div className="flex flex-col items-end sm:pl-8">
              <div className="w-full max-w-[320px] space-y-2 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-medium tabular-nums">
                    {sym(editing ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editing ? subtotal : viewSubtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium tabular-nums">
                    {sym(editing ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editing ? discountTotal : viewDiscountTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{editing ? (selectedCat?.name ?? "Tax") : (viewCatName ?? "Tax")}</span>
                  <span className="font-medium tabular-nums">
                    {sym(editing ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editing ? tax : viewTax)}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span className="font-semibold">Grand Total</span>
                  <span className="font-bold tabular-nums">
                    {sym(editing ? form.currency : (po as any).currency || baseCurrency)} {formatNumber(editing ? grandTotal : viewGrandTotal)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div />
          )}
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
                <div className="mt-0.5 text-[10px] text-black">{(company as any)?.address ?? "Jl. Industri Raya No. 45, Jakarta Selatan 12345"}</div>
                <div className="text-[10px] text-black">Telp: {(company as any)?.phone ?? "(021) 123-4567"}</div>
                <div className="text-[10px] text-black">Email: {(company as any)?.email ?? "purchasing@contoh.co.id"}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold tracking-[0.15em] text-black">PURCHASE ORDER</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 text-[11px]">
            <div className="space-y-1">
              <div className="flex"><span className="w-24 text-black">No. PO</span><span className="font-medium text-black">{po.documentNo ?? (po as any).poNo ?? formatId(po.id)}</span></div>
              <div className="flex"><span className="w-24 text-black">Referensi PR</span><span className="text-zinc-700">{(po as any).prNo ?? (po as any).referenceNo ?? (po as any).reference ?? "-"}</span></div>
              <div className="flex"><span className="w-24 text-black">Payment Terms</span><span className="text-zinc-700">{(po as any).paymentTerms ?? "-"}</span></div>
            </div>
            <div className="space-y-1">
              <div className="flex"><span className="w-24 text-black">Order Date</span><span className="text-zinc-700">{po.orderDate ? new Date(po.orderDate).toLocaleDateString("id-ID").replace(/\//g, "-") : "-"}</span></div>
              <div className="flex"><span className="w-24 text-black">Delivery Date</span><span className="text-zinc-700">{po.expectedDate ? new Date(po.expectedDate).toLocaleDateString("id-ID").replace(/\//g, "-") : "-"}</span></div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-zinc-200 pt-4 text-[11px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-black">TO</div>
              <div className="mt-2 font-medium text-black">{supplier?.name ?? supplierName(po.supplierId)}</div>
              <div className="mt-1 leading-snug text-zinc-600">{(supplier as any)?.address ?? "-"}</div>
              <div className="mt-2 space-y-0.5 text-zinc-600"><div>PIC : {(supplier as any)?.contactPerson ?? "-"}</div><div>Telp : {(supplier as any)?.phone ?? "-"}</div><div>Email : {(supplier as any)?.email ?? "-"}</div></div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-black">SHIP TO</div>
              <div className="mt-2 font-medium text-black">{warehouse?.name ?? warehouseName(po.warehouseId)}</div>
              <div className="mt-1 leading-snug text-zinc-600">{(warehouse as any)?.address ?? (company as any)?.address ?? "-"}</div>
              <div className="mt-2 space-y-0.5 text-zinc-600"><div>PIC : {(warehouse as any)?.pic ?? (warehouse as any)?.contactPerson ?? "-"}</div><div>Telp : {(warehouse as any)?.phone ?? "-"}</div></div>
            </div>
          </div>
          <table className="mt-6 w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-y border-zinc-200 bg-zinc-50">
                <th className="px-2 py-2 text-center font-medium text-black w-8">No</th>
                <th className="px-2 py-2 text-left font-medium text-zinc-500">Item Name</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-500 w-16">Qty</th>
                <th className="px-2 py-2 text-center font-medium text-zinc-500 w-16">UOM</th>
                <th className="px-2 py-2 text-right font-medium text-zinc-500 w-28">Rate</th>
                <th className="px-2 py-2 text-right font-medium text-zinc-500 w-32">Amount</th>
              </tr>
            </thead>
            <tbody className="text-[10px]">
              {(po.lines ?? []).map((l: any, idx: number) => {
                const it = (lines as any)[idx] ?? l;
                const qty = Number(it.qty || l.qty || 0);
                const price = Number(it.unitPrice ?? l.unitPrice ?? 0);
                const amt = qty * price;
                const itemRec = (typeof items !== "undefined" ? (items as any).find((x: any) => x.id === l.itemId) : null) ?? null;
                const uomRec = (typeof uoms !== "undefined" ? (uoms as any).find((x: any) => x.id === (l.uomId ?? it.uomId)) : null) ?? null;
                return (
                  <tr key={idx} className="hover:bg-zinc-50/50">
                    <td className="px-2 py-2 text-center text-zinc-500">{idx + 1}</td>
                    <td className="px-2 py-2">{itemRec ? `${itemRec.code}: ${itemRec.name}` : l.itemId}</td>
                    <td className="px-2 py-2 text-center tabular-nums">{formatNumber(qty)}</td>
                    <td className="px-2 py-2 text-center text-zinc-600">{uomRec?.name ?? "UOM"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{sym((po as any).currency || baseCurrency)} {formatNumber(price)}</td>
                    <td className="px-2 py-2 text-right tabular-nums font-medium">{sym((po as any).currency || baseCurrency)} {formatNumber(amt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end">
            <div className="w-[280px] space-y-0 text-[11px]">
              <div className="flex justify-between px-2 py-1.5 text-black"><span>Subtotal</span><span className="tabular-nums text-black">{sym((po as any).currency || baseCurrency)} {formatNumber(viewSubtotal)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span>Discount</span><span className="tabular-nums text-black">{sym((po as any).currency || baseCurrency)} {formatNumber(viewDiscountTotal)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-zinc-600"><span>PPN</span><span className="tabular-nums text-black">{sym((po as any).currency || baseCurrency)} {formatNumber(viewTax)}</span></div>
              <div className="flex justify-between px-2 py-1.5 text-black"><span>Ongkir</span><span className="tabular-nums text-black">{sym((po as any).currency || baseCurrency)} {formatNumber(0)}</span></div>
              <div className="flex justify-between border-t border-zinc-900 px-2 py-2 font-semibold text-black"><span>TOTAL</span><span className="tabular-nums">{sym((po as any).currency || baseCurrency)} {formatNumber(viewGrandTotal)}</span></div>
            </div>
          </div>
          <div className="mt-6 border-t border-zinc-200 pt-3 text-[11px]">
            <div className="font-bold uppercase tracking-wide">Notes</div>
            <div className="mt-1 whitespace-pre-wrap leading-relaxed text-zinc-700">{(po as any).notes?.trim() ? (po as any).notes : po.notes?.trim() ? po.notes : "-"}</div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4 text-center text-[11px]">
            <div><div className="border-t border-zinc-300 pt-10 mt-16">Prepared By</div></div>
            <div><div className="border-t border-zinc-300 pt-10 mt-16">Approved By</div></div>
            <div><div className="border-t border-zinc-300 pt-10 mt-16">Supplier</div></div>
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
