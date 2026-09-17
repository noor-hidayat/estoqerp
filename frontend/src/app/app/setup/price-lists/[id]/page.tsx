import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { usePriceList, usePriceLists, usePriceListLines, useUpdate, useRemove, useInsert, useSuppliers, useCustomers } from "@/lib/api/query";
import { useItemsList, useUoms } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TableInput } from "@/components/ui/table-input";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ActivityTimeline } from "@/modules/activity/components/activity-timeline";
import { formatNumber } from "@/lib/utils";

export default function EditPriceListPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: pl, isLoading } = usePriceList(id);
  const { data: listsRaw = [] } = usePriceLists();
  const { data: linesRaw = [], refetch: refetchLines } = usePriceListLines(id);
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
  const { data: suppliers = [] } = useSuppliers();
  const { data: customers = [] } = useCustomers();
  const update = useUpdate("priceLists");
  const remove = useRemove("priceLists");
  const insertLine = useInsert("priceListLines");
  const updateLine = useUpdate("priceListLines");
  const removeLine = useRemove("priceListLines");

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"detail" | "items">("detail");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [itemPage, setItemPage] = useState(1);
  const itemPageSize = 10;
  const [addForm, setAddForm] = useState<{ itemId: string; unitPrice: string; supplierId: string; customerId: string }>({ itemId: "", unitPrice: "", supplierId: "", customerId: "" });

  useEffect(() => {
    if (pl) {
      const init = {
        code: pl.code,
        name: pl.name,
        currency: pl.currency,
        description: pl.description ?? "",
        isActive: pl.isActive,
        validFrom: pl.validFrom ? String(pl.validFrom).slice(0, 10) : "",
        validTo: pl.validTo ? String(pl.validTo).slice(0, 10) : "",
      };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [pl]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and name are required.");
      return;
    }
    if (listsRaw.some((p) => p.code.toLowerCase() === form.code.trim().toLowerCase() && p.id !== id)) {
      toast.error("Price list code already in use.");
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      toast.custom(
        (t) => (
          <div className="bg-background border border-border rounded-lg shadow-lg p-3 w-[300px]">
            <div className="font-semibold text-xs">Confirm</div>
            <div className="text-xs text-muted-foreground mt-1">This transaction will be made permanent, continue?</div>
            <div className="flex justify-end gap-1.5 mt-3">
              <Button variant="ghost" size="sm" className="h-6 px-2.5 text-xs" onClick={() => { toast.dismiss(t); resolve(false); }}>
                No
              </Button>
              <Button size="sm" className="h-6 px-2.5 text-xs" onClick={() => { toast.dismiss(t); resolve(true); }}>
                Yes
              </Button>
            </div>
          </div>
        ),
        { duration: Infinity }
      );
    });
    if (!confirmed) return;
    try {
      await update.mutateAsync({
        id: id!,
        patch: {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          currency: form.currency,
          description: form.description?.trim() || null,
          isActive: !!form.isActive,
          validFrom: form.validFrom || null,
          validTo: form.validTo || null,
        },
      });
      toast.success("Updated");
      setSnapshot(JSON.stringify(form));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus price list ini?")) return;
    try {
      await remove.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/price-lists");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleAddLine = async () => {
    const itemId = prompt("Item ID (publicId) ?")?.trim();
    if (!itemId) return;
    const priceStr = prompt("Unit price ?")?.trim();
    if (!priceStr) return;
    const price = Number(priceStr);
    if (!isFinite(price) || price < 0) {
      toast.error("Price harus >=0");
      return;
    }
    try {
      await insertLine.mutateAsync({ priceListId: id, itemId, unitPrice: String(price), currency: form.currency || "IDR", minQty: "1" });
      toast.success("Line added");
      refetchLines();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
        <FormSkeleton sections={[["half", "half"]]} />
      </RoleGuard>
    );
  }

  if (!pl) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
        <p className="py-20 text-center text-lg font-semibold">Price list not found</p>
        <div className="text-center">
          <Link to="/app/setup/price-lists" className="text-sm text-primary">
            Back to Price Lists
          </Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <FormPage
        title={form.name || pl.name}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && activeTab === "detail" && (
              <Button size="sm" onClick={handleSave} disabled={update.isPending}>
                {update.isPending ? "Saving..." : "Update"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setEditing(true)} className="gap-2">
                  <Pencil size={14} /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 size={14} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="detail">Detail</TabsTrigger>
            <TabsTrigger value="items">Item Pricelist</TabsTrigger>
          </TabsList>
          <TabsContent value="detail">
            <FormSection>
              <FormGrid>
                <Input label="Price list code" value={form.code || ""} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={!editing} />
                <Input label="Price list name" value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!editing} />
                <div className="flex flex-col gap-1.5">
                  <Label className="text-[13px] font-medium">Currency</Label>
                  <select
                    value={form.currency || "IDR"}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    disabled={!editing}
                    className="flex h-8 w-full items-center rounded-md border border-input bg-white px-3 text-sm disabled:bg-zinc-100"
                  >
                    {["IDR", "USD", "EUR", "SGD", "JPY", "CNY", "MYR", "THB", "AUD"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-[13px] font-medium">Status</Label>
                  <div className="flex h-8 items-center gap-2">
                    <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} disabled={!editing} />
                    <span className="text-xs text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</span>
                  </div>
                </div>
                <DatePicker label="Valid From" value={form.validFrom || ""} onChange={(v) => setForm({ ...form, validFrom: v })} disabled={!editing} />
                <DatePicker label="Valid To" value={form.validTo || ""} onChange={(v) => setForm({ ...form, validTo: v })} disabled={!editing} />
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium leading-none">Description</label>
                  <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={!editing} rows={2} />
                </div>
              </FormGrid>
            </FormSection>
          </TabsContent>
          <TabsContent value="items">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium">Items</h3>
              <Button size="sm" className="h-7 px-3 text-xs gap-1.5" onClick={() => setAddDialogOpen(true)}>
                <Plus size={14} /> Add Item Pricelist
              </Button>
            </div>
              <div className="overflow-hidden rounded-lg border border-border shadow-sm">
                <Table className="[&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0 border-collapse">
                  <TableHeader className="bg-zinc-100/80 dark:bg-zinc-800/50">
                    <TableRow className="hover:bg-transparent border-b divide-x divide-border">
                      <TableHead className="w-[40px] min-w-[40px] max-w-[40px] text-center border-r"> <Checkbox disabled /></TableHead>
                      <TableHead className="w-[40px] min-w-[40px] max-w-[40px] font-semibold text-xs text-center border-r">No</TableHead>
                      <TableHead className="min-w-[220px] font-semibold text-xs border-r">Item Code</TableHead>
                      <TableHead className="min-w-[160px] font-semibold text-xs border-r">{(pl as any)?.type === "PURCHASE" ? "Supplier" : "Customer"}</TableHead>
                      <TableHead className="w-[110px] font-semibold text-xs border-r">Currency</TableHead>
                      <TableHead className="w-[140px] font-semibold text-xs text-center border-r">Unit Price</TableHead>
                      <TableHead className="w-[100px] font-semibold text-xs">UOM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const page = itemPage;
                      const pageSize = itemPageSize;
                      const total = linesRaw.length;
                      const totalPages = Math.ceil(total / pageSize) || 1;
                      const paginated = linesRaw.slice((page-1)*pageSize, page*pageSize);
                      if (paginated.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={7} className="py-10 text-center">
                              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <div className="rounded-full bg-muted p-3">
                                  <Plus size={16} />
                                </div>
                                <p className="text-sm">No items yet</p>
                                <p className="text-xs">Click “Add Item Pricelist” at top right to add.</p>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      }
                      return paginated.map((l: any, idx: number) => {
                        const item = items.find((it: any) => it.id === l.itemId || String((it as any)._internalId) === String(l.itemId)) ?? { code: l.itemId, name: "" };
                        const uom = uoms.find((u: any) => u.id === l.uomId || String((u as any)._internalId) === String(l.uomId));
                        const lineSupplierName = (l as any)?.supplierId ? suppliers.find((s: any) => s.id === (l as any).supplierId)?.name ?? null : null;
                        const lineCustomerName = (l as any)?.customerId ? customers.find((c: any) => c.id === (l as any).customerId)?.name ?? null : null;
                        const plSupplierName = (pl as any)?.supplierId ? suppliers.find((s: any) => s.id === (pl as any).supplierId)?.name ?? null : null;
                        const plCustomerName = (pl as any)?.customerId ? customers.find((c: any) => c.id === (pl as any).customerId)?.name ?? null : null;
                        const supplierName = lineSupplierName ?? plSupplierName ?? "";
                        const customerName = lineCustomerName ?? plCustomerName ?? "";
                        const globalIdx = (page-1)*pageSize + idx;
                        return (
                          <TableRow key={l.id} className="hover:bg-muted/50">
                            <TableCell className="w-8 text-center">
                              <Checkbox />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{globalIdx + 1}</TableCell>
                            <TableCell className="min-w-[220px]">
                              <div className="text-sm font-normal">{(item as any).code ?? l.itemId}: {(item as any).name ?? ""}</div>
                            </TableCell>
                            <TableCell className="min-w-[160px]">
                              <span className="text-xs">{(pl as any)?.type === "PURCHASE" ? supplierName : customerName}</span>
                            </TableCell>
                            <TableCell className="w-[110px] text-left">
                              <Badge variant="secondary" className="text-xs font-mono">{l.currency}</Badge>
                            </TableCell>
                            <TableCell className="w-[140px] p-0">
                              <TableInput
                                value={String(l.unitPrice)}
                                onChange={async (v) => {
                                  try {
                                    await updateLine.mutateAsync({ id: l.id, patch: { unitPrice: v } });
                                    refetchLines();
                                  } catch (e: any) {
                                    toast.error(e.message);
                                  }
                                }}
                                isNumeric
                                columnTitle="Price"
                                className="text-right"
                              />
                            </TableCell>
                            <TableCell className="w-[100px] text-left">
                              <span className="text-xs">{uom?.name ?? ""}</span>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total items: {linesRaw.length}</span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={itemPage <= 1} onClick={() => setItemPage(p => Math.max(1, p - 1))}>Prev</Button>
                  <span className="text-xs text-muted-foreground">Page {itemPage} of {Math.ceil(linesRaw.length / itemPageSize) || 1}</span>
                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={itemPage >= Math.ceil(linesRaw.length / itemPageSize) || linesRaw.length === 0} onClick={() => setItemPage(p => p + 1)}>Next</Button>
                </div>
              </div>

              <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
                <DialogContent className="sm:max-w-[480px]">
                  <DialogHeader>
                    <DialogTitle>Add Item Pricelist</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-2">
                    <SearchableSelect
                      label="Itemcode"
                      placeholder="Pilih item..."
                      options={items.map((it: any) => ({ value: it.id, label: `${it.code} — ${it.name}` }))}
                      value={addForm.itemId}
                      onChange={(v) => {
                        const it = items.find((i: any) => i.id === v) as any;
                        setAddForm({ ...addForm, itemId: v });
                      }}
                    />
                    {(pl as any)?.type === "PURCHASE" ? (
                      <SearchableSelect
                        label="Supplier"
                        placeholder="Pilih supplier..."
                        options={suppliers.map((s: any) => ({ value: s.id, label: s.name }))}
                        value={addForm.supplierId}
                        onChange={(v) => setAddForm({ ...addForm, supplierId: v })}
                      />
                    ) : (
                      <SearchableSelect
                        label="Customer"
                        placeholder="Pilih customer..."
                        options={customers.map((c: any) => ({ value: c.id, label: c.name }))}
                        value={addForm.customerId}
                        onChange={(v) => setAddForm({ ...addForm, customerId: v })}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium">UOM</Label>
                        <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-xs">
                          {(() => {
                            const it = items.find((i: any) => i.id === addForm.itemId) as any;
                            const uom = it?.uomId ? uoms.find((u: any) => u.id === it.uomId)?.name : null;
                            return uom ?? "";
                          })()}
                        </div>
                        <span className="text-[11px] text-muted-foreground">Diambil dari master item</span>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs font-medium">Currency</Label>
                        <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-xs font-mono">
                          {form.currency || (pl as any)?.currency || "IDR"}
                        </div>
                        <span className="text-[11px] text-muted-foreground">Dari detail pricelist</span>
                      </div>
                    </div>
                    <Input
                      label="Unit Price"
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="e.g. 10000"
                      value={addForm.unitPrice}
                      onChange={(e) => setAddForm({ ...addForm, unitPrice: e.target.value })}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!addForm.itemId) {
                          toast.error("Pilih item terlebih dahulu.");
                          return;
                        }
                        if ((pl as any)?.type === "PURCHASE" && !addForm.supplierId) {
                          toast.error("Pilih supplier terlebih dahulu.");
                          return;
                        }
                        if ((pl as any)?.type === "SALES" && !addForm.customerId) {
                          toast.error("Pilih customer terlebih dahulu.");
                          return;
                        }
                        const price = Number(addForm.unitPrice);
                        if (!isFinite(price) || price < 0) {
                          toast.error("Price harus >=0");
                          return;
                        }
                        const it = items.find((i: any) => i.id === addForm.itemId) as any;
                        try {
                          await insertLine.mutateAsync({
                            priceListId: id,
                            itemId: addForm.itemId,
                            type: (pl as any)?.type ?? "PURCHASE",
                            supplierId: (pl as any)?.type === "PURCHASE" ? addForm.supplierId : null,
                            customerId: (pl as any)?.type === "SALES" ? addForm.customerId : null,
                            uomId: it?.uomId ?? null,
                            unitPrice: String(price),
                            currency: form.currency || (pl as any)?.currency || "IDR",
                            minQty: "1",
                          });
                          toast.success("Line added");
                          setAddForm({ itemId: "", unitPrice: "", supplierId: "", customerId: "" });
                          setAddDialogOpen(false);
                          refetchLines();
                        } catch (e: any) {
                          toast.error(e.message);
                        }
                      }}
                      disabled={insertLine.isPending}
                    >
                      {insertLine.isPending ? "Saving..." : "Add"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>
          </Tabs>
              <FormSection title="Aktivitas">
          <ActivityTimeline documentType="PRICE_LIST" documentId={id!} />
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
