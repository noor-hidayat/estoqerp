"use client";

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useItemGroup, useItemGroups, useUpdate } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";
import Link from "next/link";

export default function EditItemGroupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: itemGroup, isLoading: itemGroupLoading } = useItemGroup(id);
  const { data: itemGroupsRaw = [] } = useItemGroups();
  const updateItemGroup = useUpdate("itemGroups");

  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (itemGroup) {
      setForm({ code: itemGroup.code, name: itemGroup.name });
    }
  }, [itemGroup]);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and item group name are required.");
      return;
    }
    if (
      itemGroupsRaw.some(
        (c) =>
          c.code.toLowerCase() === form.code.trim().toLowerCase() &&
          c.id !== id
      )
    ) {
      setError("Item group code already in use.");
      return;
    }
    if (!id) return;
    try {
      await updateItemGroup.mutateAsync({ id, patch: { ...form } });
      navigate("/app/data-library/item-groups");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  if (itemGroupLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
        <FormSkeleton
          sections={[["half", "half"]]}
        />
      </RoleGuard>
    );
  }

  if (!itemGroup) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Item group not found</p>
        <div className="text-center">
          <Link href="/app/data-library/item-groups" className="text-sm text-primary hover:text-primary/80">Back to Item Groups</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
      <FormPage
        title="Edit Item Group"
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
            <Save size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
