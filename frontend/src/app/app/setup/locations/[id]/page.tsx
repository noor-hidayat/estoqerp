import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLocation, useLocations, useAllWarehouses, useUpdate, useRemove } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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

export default function EditLocationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: location, isLoading: locationLoading } = useLocation(id);
  const { data: allLocations = [] } = useLocations();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const updateLocation = useUpdate("locations");
  const removeLocation = useRemove("locations");

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (location) {
      const init = { code: location.code, name: location.name, warehouseId: location.warehouseId, isActive: (location as any).isActive !== false };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [location]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.code?.trim() || !form.warehouseId) {
      toast.error("Location code and warehouse are required.");
      return;
    }
    if (
      allLocations.some(
        (l) =>
          l.code.toLowerCase() === form.code.trim().toLowerCase() &&
          l.id !== id
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
      await updateLocation.mutateAsync({ id: id!, patch: { code: form.code.trim(), name: form.name, warehouseId: form.warehouseId, isActive: !!form.isActive } });
      toast.success("Updated");
      setSnapshot(JSON.stringify(form));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus location ini?")) return;
    try {
      await removeLocation.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/locations");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEdit = () => setEditing(true);

  if (locationLoading || warehousesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
        <FormSkeleton sections={[["half", "half", "wide"]]} />
      </RoleGuard>
    );
  }

  if (!location) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Location not found</p>
        <div className="text-center">
          <Link to="/app/setup/locations" className="text-sm text-primary hover:text-primary/80">Back to Warehouse Locations</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
      <FormPage
        title={form.name || form.code || location.name || location.code}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={updateLocation.isPending}>
                {updateLocation.isPending ? "Saving..." : "Update"}
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
              label="Location code"
              placeholder="H1 AB1"
              value={form.code || ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
            />
            <Select
              label="Warehouse"
              value={form.warehouseId || ""}
              onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
              disabled={!editing}
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
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!editing}
              />
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium leading-none">Active</div>
                <div className="text-xs text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</div>
              </div>
              <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} disabled={!editing} />
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
