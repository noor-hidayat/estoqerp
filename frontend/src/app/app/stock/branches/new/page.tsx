"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useBranches, useInsert } from "@/lib/api/query";
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

export default function NewBranchPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", city: "" });
  const [error, setError] = useState("");

  const { data: branches = [] } = useBranches();
  const insertBranch = useInsert("branches");

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and plant name are required.");
      return;
    }
    if (
      branches.some(
        (b) => b.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Plant code already in use.");
      return;
    }
    try {
      await insertBranch.mutateAsync({ ...form });
      navigate("/app/stock/branches");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <FormPage
        title="Add Plant"
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Plant code"
              placeholder="PBG"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="City"
              placeholder="Bandung"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Plant name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
          </FormGrid>
          {error && (
            <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/stock/branches")}>
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
