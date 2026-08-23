"use client";

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
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
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
};

export default function NewItemPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  useErrorToast(error);

  const { data: itemGroups, isLoading: itemGroupsLoading } = useItemGroups();
  const { data: uoms = [], isLoading: uomsLoading } = useUoms();
  const insertItem = useInsert("items");

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.itemGroupId) {
      setError("Code, name, and item group are required.");
      return;
    }
    if (!form.uomId) {
      setError("UOM is required.");
      return;
    }
    try {
      await insertItem.mutateAsync({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        uomId: form.uomId,
        alternativeCode: form.alternativeCode.trim() || null,
        description: form.description.trim() || null,
        hue: Math.floor(Math.random() * 360),
      });
      navigate("/app/data-library/items");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item.");
    }
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
          </FormGrid>

        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/data-library/items")}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button variant="primary" onClick={save}>
            <Plus size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
