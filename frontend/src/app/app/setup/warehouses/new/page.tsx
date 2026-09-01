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
} from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";

export default function NewWarehousePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", branchId: "" });
  const [error, setError] = useState("");
  useErrorToast(error);

  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const insertWarehouse = useInsert("warehouses");
  const [saved, setSaved] = useState(false);

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.name.trim() || !form.branchId) {
      setError("Code, warehouse name, and branch are required.");
      return false;
    }
    if (
      warehouses.some(
        (w) => w.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Warehouse code already in use.");
      return false;
    }
    try {
      await insertWarehouse.mutateAsync({ ...form });
      setSaved(true);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) navigate("/app/setup/warehouses");
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
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/warehouses")}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={save} disabled={insertWarehouse.isPending}>
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
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}