import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useItemGroups, useInsert, useUoms } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
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
import { useErrorToast } from "@/hooks/use-error-toast";

const EMPTY = {
  code: "",
  name: "",
  uomId: "",
  itemGroupId: "",
  alternativeCode: "",
  uomQty: undefined as number | undefined,
  description: "",
  standardCost: undefined as number | undefined,
  isFinishGood: false,
};

export default function NewItemPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useErrorToast(error);

  const { data: itemGroups, isLoading: itemGroupsLoading } = useItemGroups();
  const { data: uoms = [], isLoading: uomsLoading } = useUoms();
  const insertItem = useInsert("items");

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.name.trim() || !form.itemGroupId) {
      setError("Code, name, and item group are required.");
      return false;
    }
    if (!form.uomId) {
      setError("UOM is required.");
      return false;
    }
    try {
      await insertItem.mutateAsync({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        uomId: form.uomId,
        alternativeCode: form.alternativeCode.trim() || null,
        description: form.description.trim() || null,
        standardCost: form.standardCost != null ? String(form.standardCost) : null,
        isFinishGood: form.isFinishGood,
        hue: Math.floor(Math.random() * 360),
      });
      setSaved(true);
      return true;    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item.");
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) navigate("/app/setup/items");
  };

  useSaveShortcut(save, true);

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
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/items")}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={save}>
              Save
            </Button>
            <Button variant="primary" size="sm" className="h-7 px-2.5 text-xs" onClick={handleSubmit}>
              Submit
            </Button>
          </div>
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
            <Input
              label="Standard cost"
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g.: 10000"
              value={form.standardCost ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  standardCost: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0),
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