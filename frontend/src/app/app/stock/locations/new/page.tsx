"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useLocations, useAllWarehouses, useInsert } from "@/lib/api/query";
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

export default function NewLocationPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", warehouseId: "" });
  const [error, setError] = useState("");

  const { data: allLocations = [] } = useLocations();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const insertLocation = useInsert("locations");

  const save = async () => {
    if (!form.code.trim() || !form.warehouseId) {
      setError("Location code and warehouse are required.");
      return;
    }
    if (
      allLocations.some(
        (l) => l.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Location code already in use.");
      return;
    }
    try {
      await insertLocation.mutateAsync({ ...form });
      navigate("/app/stock/locations");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  if (warehousesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
        <FormSkeleton
          sections={[["half", "half", "wide"]]}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
      <FormPage
        title="Add Location"
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Location code"
              placeholder="H1 AB1"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Select
              label="Warehouse"
              value={form.warehouseId}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
            >
              <option value="">Select warehouse...</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Input
              label="Location name (optional)"
              placeholder="Rack H1, Block A, Aisle 1"
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
          <Button variant="ghost" onClick={() => navigate("/app/stock/locations")}>
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
