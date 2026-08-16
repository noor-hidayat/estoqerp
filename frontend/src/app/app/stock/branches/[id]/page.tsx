"use client";

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useBranch, useBranches, useUpdate } from "@/lib/api/query";
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

export default function EditBranchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: branch, isLoading: branchLoading } = useBranch(id);
  const { data: branches = [] } = useBranches();
  const updateBranch = useUpdate("branches");

  const [form, setForm] = useState({ code: "", name: "", city: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (branch) {
      setForm({ code: branch.code, name: branch.name, city: branch.city });
    }
  }, [branch]);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and plant name are required.");
      return;
    }
    if (
      branches.some(
        (b) =>
          b.code.toLowerCase() === form.code.trim().toLowerCase() &&
          b.id !== id
      )
    ) {
      setError("Plant code already in use.");
      return;
    }
    if (!id) return;
    try {
      await updateBranch.mutateAsync({ id, patch: { ...form } });
      navigate("/app/stock/branches");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  if (branchLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
        <FormSkeleton
          sections={[["half", "half", "wide"]]}
        />
      </RoleGuard>
    );
  }

  if (!branch) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Plant not found</p>
        <div className="text-center">
          <Link href="/app/stock/branches" className="text-sm text-primary hover:text-primary/80">Back to Plants</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <FormPage
        title="Edit Plant"
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
            <Save size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
