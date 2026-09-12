import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useItem, useItemGroups, useUpdate, useRemove, useUoms } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormSkeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading: itemLoading } = useItem(id);
  const { data: itemGroups } = useItemGroups();
  const { data: uoms = [], isLoading: uomsLoading } = useUoms();
  const updateItem = useUpdate("items");
  const removeItem = useRemove("items");

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (item) {
      const init = {
        code: item.code,
        name: item.name,
        uomId: item.uomId ?? "",
        itemGroupId: item.itemGroupId,
        alternativeCode: item.alternativeCode ?? "",
        uomQty: item.uomQty,
        description: item.description ?? "",
        isFinishGood: (item as any).isFinishGood ?? false,
        isActive: (item as any).isActive !== false,
      };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [item]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim() || !form.itemGroupId) {
      toast.error("Code, name, and item group are required.");
      return;
    }
    if (!form.uomId) {
      toast.error("UOM is required.");
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
      await updateItem.mutateAsync({
        id: id!,
        patch: {
          code: form.code.trim(),
          name: form.name.trim(),
          uomId: form.uomId,
          itemGroupId: form.itemGroupId,
          alternativeCode: form.alternativeCode?.trim() || null,
          uomQty: form.uomQty,
          description: form.description?.trim() || null,
          isFinishGood: form.isFinishGood,
          isActive: !!form.isActive,
        },
      });
      toast.success("Updated");
      setSnapshot(JSON.stringify(form));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus item ini?")) return;
    try {
      await removeItem.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/items");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEdit = () => setEditing(true);

  if (itemLoading || uomsLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
        <FormSkeleton sections={[["half", "half", "wide", "half", "half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  if (!item) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Item not found</p>
        <div className="text-center">
          <Link to="/app/setup/items" className="text-sm text-primary hover:text-primary/80">Back to Items</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
      <FormPage
        title={form.name || item.name}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={updateItem.isPending}>
                {updateItem.isPending ? "Saving..." : "Update"}
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
              label="Item code"
              placeholder="00001"
              value={form.code || ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
            />
            <SearchableSelect
              label="UOM"
              placeholder="Type to search UOM..."
              options={uoms.map((u) => ({ value: u.id, label: u.name }))}
              value={form.uomId || ""}
              onChange={(v) => setForm({ ...form, uomId: v })}
              disabled={!editing}
            />
            <div className="sm:col-span-2">
              <Input
                label="Item name"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                disabled={!editing}
              />
            </div>
            <SearchableSelect
              label="Item Group"
              placeholder="Type to search item group..."
              options={(itemGroups ?? []).map((c) => ({ value: c.id, label: c.name }))}
              value={form.itemGroupId || ""}
              onChange={(v) => setForm({ ...form, itemGroupId: v })}
              disabled={!editing}
            />
            <Input
              label="Alternative code"
              placeholder="Enter alternative code"
              value={form.alternativeCode || ""}
              onChange={(e) => setForm({ ...form, alternativeCode: e.target.value })}
              disabled={!editing}
            />
            <Input
              label="UOM qty"
              type="number"
              min={0}
              placeholder="e.g.: 1 UOM = 12 pcs"
              value={form.uomQty ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  uomQty: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0),
                })
              }
              disabled={!editing}
            />
            <Input
              label="Valuation rate (auto)"
              type="number"
              value={item?.valuationRate != null ? String(item.valuationRate) : "0"}
              disabled
              placeholder="Auto dari GR"
            />
            <div className="sm:col-span-2">
              <Input
                label="Description"
                placeholder="Optional description"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={!editing}
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-2 pt-2">
              <Checkbox id="isFinishGoodEdit" checked={!!form.isFinishGood} onCheckedChange={(v) => setForm({ ...form, isFinishGood: v === true })} disabled={!editing} />
              <Label htmlFor="isFinishGoodEdit" className="text-sm font-medium leading-none cursor-pointer">
                Finish Good (bisa di-return customer)
              </Label>
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
