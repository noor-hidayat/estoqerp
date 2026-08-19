"use client";

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useLocation, useLocations, useAllWarehouses, useUpdate } from "@/lib/api/query";
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

export default function EditLocationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: location, isLoading: locationLoading } = useLocation(id);
  const { data: allLocations = [] } = useLocations();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const updateLocation = useUpdate("locations");

  const [form, setForm] = useState({ code: "", name: "", warehouseId: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (location) {
      setForm({ code: location.code, name: location.name, warehouseId: location.warehouseId });
    }
  }, [location]);

  const save = async () => {
    if (!form.code.trim() || !form.warehouseId) {
      setError("Location code and warehouse are required.");
      return;
    }
    if (
      allLocations.some(
        (l) =>
          l.code.toLowerCase() === form.code.trim().toLowerCase() &&
          l.id !== id
      )
    ) {
      setError("Location code already in use.");
      return;
    }
    if (!id) return;
    try {
      await updateLocation.mutateAsync({ id, patch: { ...form } });
      navigate("/app/data-library/locations");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  if (locationLoading || warehousesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
        <FormSkeleton
          sections={[["half", "half", "wide"]]}
        />
      </RoleGuard>
    );
  }

  if (!location) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Location not found</p>
        <div className="text-center">
          <Link href="/app/data-library/locations" className="text-sm text-primary hover:text-primary/80">Back to Warehouse Locations</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
      <FormPage
        title="Edit Location"
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
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
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
          <Button variant="ghost" onClick={() => navigate("/app/data-library/locations")}>
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
