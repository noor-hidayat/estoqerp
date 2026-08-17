"use client";

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useWarehouse, useAllWarehouses, useBranches, useUpdate } from "@/lib/api/query";
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
import Link from "next/link";

export default function EditWarehousePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: warehouse, isLoading: warehouseLoading } = useWarehouse(id);
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const updateWarehouse = useUpdate("warehouses");

  const [form, setForm] = useState({ code: "", name: "", branchId: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (warehouse) {
      setForm({ code: warehouse.code, name: warehouse.name, branchId: warehouse.branchId });
    }
  }, [warehouse]);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.branchId) {
      setError("Code, warehouse name, and branch are required.");
      return;
    }
    if (
      warehouses.some(
        (w) =>
          w.code.toLowerCase() === form.code.trim().toLowerCase() &&
          w.id !== id
      )
    ) {
      setError("Warehouse code already in use.");
      return;
    }
    if (!id) return;
    try {
      await updateWarehouse.mutateAsync({ id, patch: { ...form } });
      navigate("/app/data-library/warehouses");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  if (warehouseLoading || branchesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
        <FormSkeleton
          sections={[["half", "half", "wide"]]}
        />
      </RoleGuard>
    );
  }

  if (!warehouse) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Warehouse not found</p>
        <div className="text-center">
          <Link href="/app/data-library/warehouses" className="text-sm text-primary hover:text-primary/80">Back to Warehouses</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
      <FormPage
        title="Edit Warehouse"
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
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
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
            <Save size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
