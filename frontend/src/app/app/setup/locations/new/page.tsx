import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocations, useAllWarehouses, useInsert } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { toast } from "sonner";

export default function NewLocationPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", warehouseId: "", isActive: true });

  const { data: allLocations = [] } = useLocations();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const insertLocation = useInsert("locations");

  const handleCreate = async () => {
    if (!form.code.trim() || !form.warehouseId) {
      toast.error("Location code and warehouse are required.");
      return;
    }
    if (
      allLocations.some(
        (l) => l.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      toast.error("Location code already in use.");
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      toast.custom(
        (t) => (
          <div className="bg-background border border-border rounded-lg shadow-lg p-3 w-[300px]">
            <div className="font-semibold text-xs">Confirm</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">This transaction will be made permanent, continue?</div>
            <div className="flex justify-end gap-1.5 mt-3">
              <Button variant="ghost" size="sm" className="h-6 px-2.5 text-xs" onClick={() => { toast.dismiss(t); resolve(false); }}>
                No
              </Button>
              <Button size="sm" className="h-6 px-2.5 text-xs" onClick={() => { toast.dismiss(t); resolve(true); }}>
                Yes
              </Button>
            </div>
          </div>
        ),
        { duration: Infinity }
      );
    });
    if (!confirmed) return;
    try {
      await insertLocation.mutateAsync({ code: form.code.trim(), name: form.name, warehouseId: form.warehouseId, isActive: !!form.isActive });
      toast.success("Created");
      navigate("/app/setup/locations");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

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
          <Button size="sm" onClick={handleCreate} disabled={insertLocation.isPending}>
            {insertLocation.isPending ? "Saving..." : "Create"}
          </Button>
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
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium leading-none">Active</div>
                <div className="text-xs text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</div>
              </div>
              <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} />
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
