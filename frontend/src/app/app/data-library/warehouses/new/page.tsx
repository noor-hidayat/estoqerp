"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useAllWarehouses, useBranches, useInsert } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";

export default function NewWarehousePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", branchId: "" });
  const [error, setError] = useState("");

  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const insertWarehouse = useInsert("warehouses");

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.branchId) {
      setError("Code, warehouse name, and branch are required.");
      return;
    }
    if (
      warehouses.some(
        (w) => w.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Warehouse code already in use.");
      return;
    }
    try {
      await insertWarehouse.mutateAsync({ ...form });
      navigate("/app/data-library/warehouses");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  if (branchesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
        <FormSkeleton
          sections={[["half", "half", "wide"]]}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
      <FormPage
        title="Add Warehouse"
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Warehouse code"
              placeholder="BND-01"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Select
              label="Branch"
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="">Select branch...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Input
                label="Warehouse name"
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
          <Button variant="ghost" onClick={() => navigate("/app/data-library/warehouses")}>
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
