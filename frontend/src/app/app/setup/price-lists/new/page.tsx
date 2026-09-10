import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePriceLists, useInsert, useCustomers, useSuppliers } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { toast } from "sonner";

export default function NewPriceListPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    type: "PURCHASE" as "PURCHASE" | "SALES",
    supplierId: "",
    customerId: "",
    currency: "IDR",
    description: "",
    isActive: true,
    validFrom: "",
    validTo: "",
  });

  const { data: listsRaw = [] } = usePriceLists();
  const { data: customers = [] } = useCustomers();
  const { data: suppliers = [] } = useSuppliers();
  const insert = useInsert("priceLists");

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (form.type === "SALES" && !form.customerId) {
      toast.error("Customer wajib untuk type Sales.");
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      toast.custom(
        (t) => (
          <div className="bg-background border border-border rounded-lg shadow-lg p-3 w-[300px]">
            <div className="font-semibold text-xs">Confirm</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">This transaction will be made permanent, continue?</div>
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
      const autoCode = `PL-${Date.now().toString().slice(-6)}`;
      await insert.mutateAsync({
        code: autoCode,
        name: form.name.trim(),
        type: form.type,
        supplierId: form.type === "PURCHASE" ? form.supplierId || null : null,
        customerId: form.type === "SALES" ? form.customerId : null,
        currency: form.currency,
        description: form.description.trim() || null,
        isActive: form.isActive,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
      });
      toast.success("Created");
      navigate("/app/setup/price-lists");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <FormPage
        title="Add Price List"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insert.isPending}>
            {insert.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Input label="Price list name" placeholder="pricelist import" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px] font-medium">Type</Label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as any, customerId: "", supplierId: "" })}
                className="flex h-8 w-full items-center rounded-md border border-input bg-white px-3 text-sm"
              >
                <option value="PURCHASE">Purchase (Import)</option>
                <option value="SALES">Sales</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[13px] font-medium">Currency</Label>
              <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="flex h-8 w-full items-center rounded-md border border-input bg-white px-3 text-sm">
                {["IDR", "USD", "EUR", "SGD", "JPY", "CNY", "MYR", "THB", "AUD"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {form.type === "PURCHASE" && (
              <SearchableSelect
                label="Supplier"
                placeholder="Pilih supplier..."
                options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                value={form.supplierId}
                onChange={(v) => setForm({ ...form, supplierId: v })}
              />
            )}
            {form.type === "SALES" && (
              <SearchableSelect
                label="Customer"
                placeholder="Pilih customer..."
                options={customers.map((c) => ({ value: c.id, label: c.name }))}
                value={form.customerId}
                onChange={(v) => setForm({ ...form, customerId: v })}
              />
            )}
            <div className="flex flex-col gap-2">
              <Label className="text-[13px] font-medium">Status</Label>
              <div className="flex h-8 items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <span className="text-xs text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</span>
              </div>
            </div>
            <DatePicker label="Valid From" value={form.validFrom} onChange={(v) => setForm({ ...form, validFrom: v })} />
            <DatePicker label="Valid To" value={form.validTo} onChange={(v) => setForm({ ...form, validTo: v })} />
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Description</label>
              <Textarea placeholder="Optional description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
