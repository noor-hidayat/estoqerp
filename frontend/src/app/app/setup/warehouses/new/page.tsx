import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAllWarehouses, useBranches, useInsert } from "@/lib/api/query";
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
import { toast } from "sonner";

export default function NewWarehousePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", branchId: "" });

  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const insertWarehouse = useInsert("warehouses");

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.branchId) {
      toast.error("Code, warehouse name, and branch are required.");
      return;
    }
    if (
      warehouses.some(
        (w) => w.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      toast.error("Warehouse code already in use.");
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
      await insertWarehouse.mutateAsync({ code: form.code.trim(), name: form.name.trim(), branchId: form.branchId });
      toast.success("Created");
      navigate("/app/setup/warehouses");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

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
          <Button size="sm" onClick={handleCreate} disabled={insertWarehouse.isPending}>
            {insertWarehouse.isPending ? "Saving..." : "Create"}
          </Button>
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
