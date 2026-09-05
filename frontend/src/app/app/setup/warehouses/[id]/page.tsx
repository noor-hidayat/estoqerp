import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWarehouse, useAllWarehouses, useBranches, useUpdate, useRemove } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function EditWarehousePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: warehouse, isLoading: warehouseLoading } = useWarehouse(id);
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const updateWarehouse = useUpdate("warehouses");
  const removeWarehouse = useRemove("warehouses");

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (warehouse) {
      const init = { code: warehouse.code, name: warehouse.name, branchId: warehouse.branchId };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [warehouse]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim() || !form.branchId) {
      toast.error("Code, warehouse name, and branch are required.");
      return;
    }
    if (
      warehouses.some(
        (w) =>
          w.code.toLowerCase() === form.code.trim().toLowerCase() &&
          w.id !== id
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
      await updateWarehouse.mutateAsync({ id: id!, patch: { code: form.code.trim(), name: form.name.trim(), branchId: form.branchId } });
      toast.success("Updated");
      setSnapshot(JSON.stringify(form));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus warehouse ini?")) return;
    try {
      await removeWarehouse.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/warehouses");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEdit = () => setEditing(true);

  if (warehouseLoading || branchesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
        <FormSkeleton sections={[["half", "half", "wide"]]} />
      </RoleGuard>
    );
  }

  if (!warehouse) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Warehouse not found</p>
        <div className="text-center">
          <Link to="/app/setup/warehouses" className="text-sm text-primary hover:text-primary/80">Back to Warehouses</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
      <FormPage
        title={form.name || warehouse.name}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={updateWarehouse.isPending}>
                {updateWarehouse.isPending ? "Saving..." : "Update"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={handleEdit} className="gap-2">
                  <Pencil size={14} /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 size={14} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Warehouse code"
              placeholder="BND-01"
              value={form.code || ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
            />
            <Select
              label="Branch"
              value={form.branchId || ""}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              disabled={!editing}
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
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!editing}
              />
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
