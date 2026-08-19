"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useItemGroups, useInsert } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";

export default function NewItemGroupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");

  const { data: itemGroupsRaw = [] } = useItemGroups();
  const insertItemGroup = useInsert("itemGroups");

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and item group name are required.");
      return;
    }
    if (
      itemGroupsRaw.some(
        (c) => c.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Item group code already in use.");
      return;
    }
    try {
      await insertItemGroup.mutateAsync({ ...form });
      navigate("/app/data-library/item-groups");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
      <FormPage
        title="Add Item Group"
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Item group code"
              placeholder="GROUP"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Item group name"
              placeholder="Snacks"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormGrid>
          {error && (
            <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/data-library/item-groups")}>
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
