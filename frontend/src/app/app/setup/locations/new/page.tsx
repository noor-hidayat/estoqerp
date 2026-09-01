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
} from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";

export default function NewLocationPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", warehouseId: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useErrorToast(error);

  const { data: allLocations = [] } = useLocations();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const insertLocation = useInsert("locations");

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.warehouseId) {
      setError("Location code and warehouse are required.");
      return false;
    }
    if (
      allLocations.some(
        (l) => l.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Location code already in use.");
      return false;
    }
    try {
      await insertLocation.mutateAsync({ ...form });
      setSaved(true);
      return true;    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) navigate("/app/setup/locations");
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
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/locations")}>
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
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}