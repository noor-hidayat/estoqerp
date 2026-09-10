import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useItemGroups, useInsert, useUoms } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { toast } from "sonner";

const EMPTY = {
  code: "",
  name: "",
  uomId: "",
  itemGroupId: "",
  alternativeCode: "",
  uomQty: undefined as number | undefined,
  description: "",
  isFinishGood: false,
};

export default function NewItemPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);

  const { data: itemGroups, isLoading: itemGroupsLoading } = useItemGroups();
  const { data: uoms = [], isLoading: uomsLoading } = useUoms();
  const insertItem = useInsert("items");

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.itemGroupId) {
      toast.error("Code, name, and item group are required.");
      return;
    }
    if (!form.uomId) {
      toast.error("UOM is required.");
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
      await insertItem.mutateAsync({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        uomId: form.uomId,
        alternativeCode: form.alternativeCode.trim() || null,
        description: form.description.trim() || null,
        isFinishGood: form.isFinishGood,
        hue: Math.floor(Math.random() * 360),
      });
      toast.success("Created");
      navigate("/app/setup/items");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (itemGroupsLoading || uomsLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
        <FormSkeleton
          sections={[
            ["half", "half", "wide", "half", "half", "half", "half"],
          ]}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
      <FormPage
        title="Add Item"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insertItem.isPending}>
            {insertItem.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Item code"
              placeholder="00001"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <SearchableSelect
              label="UOM"
              placeholder="Type to search UOM..."
              options={uoms.map((u) => ({ value: u.id, label: u.name }))}
              value={form.uomId}
              onChange={(v) => setForm({ ...form, uomId: v })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Item name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <SearchableSelect
              label="Item Group"
              placeholder="Type to search item group..."
              options={(itemGroups ?? []).map((c) => ({ value: c.id, label: c.name }))}
              value={form.itemGroupId}
              onChange={(v) => setForm({ ...form, itemGroupId: v })}
            />
            <Input
              label="Alternative code"
              placeholder="Enter alternative code"
              value={form.alternativeCode}
              onChange={(e) => setForm({ ...form, alternativeCode: e.target.value })}
            />
            <Input
              label="UOM qty"
              type="number"
              min={0}
              placeholder="e.g.: 1 UOM = 12 pcs"
              value={form.uomQty ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  uomQty: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
            <div className="sm:col-span-2">
              <Input
                label="Description"
                placeholder="Optional description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 pt-2">
              <Checkbox id="isFinishGood" checked={form.isFinishGood} onCheckedChange={(v) => setForm({ ...form, isFinishGood: v === true })} />
              <Label htmlFor="isFinishGood" className="text-sm font-medium leading-none cursor-pointer">
                Finish Good (bisa di-return customer)
              </Label>
            </div>
          </FormGrid>

        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
