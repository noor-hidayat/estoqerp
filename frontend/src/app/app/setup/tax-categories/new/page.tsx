import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTaxCategories, useInsert } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { toast } from "sonner";

export default function NewTaxCategoryPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", percentage: "", description: "", isActive: true });

  const { data: taxCatsRaw = [] } = useTaxCategories();
  const insertTax = useInsert("taxCategories");

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.percentage.trim()) {
      toast.error("Code, name and percentage are required.");
      return;
    }
    const pct = Number(form.percentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Percentage must be 0-100.");
      return;
    }
    if (taxCatsRaw.some((t) => t.code.toLowerCase() === form.code.trim().toLowerCase())) {
      toast.error("Tax category code already in use.");
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
      await insertTax.mutateAsync({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        percentage: String(pct),
        description: form.description.trim() || null,
        isActive: form.isActive,
      });
      toast.success("Created");
      navigate("/app/setup/tax-categories");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <FormPage
        title="Add Tax Category"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insertTax.isPending}>
            {insertTax.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Tax code"
              placeholder="PPN11"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Tax category name"
              placeholder="PPN 11%"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              label="Percentage (%)"
              placeholder="11"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.percentage}
              onChange={(e) => setForm({ ...form, percentage: e.target.value })}
            />
            <div className="flex flex-col gap-2">
              <Label className="text-[13px] font-medium">Status</Label>
              <div className="flex h-8 items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <span className="text-xs text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</span>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Description</label>
              <Textarea
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
