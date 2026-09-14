import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useTaxCategory, useTaxCategories, useUpdate, useRemove } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ActivityTimeline } from "@/components/activity/activity-timeline";

export default function EditTaxCategoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: cat, isLoading } = useTaxCategory(id);
  const { data: catsRaw = [] } = useTaxCategories();
  const updateTax = useUpdate("taxCategories");
  const removeTax = useRemove("taxCategories");

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (cat) {
      const init = { code: cat.code, name: cat.name, percentage: String(cat.percentage), description: cat.description ?? "", isActive: (cat as any).isActive !== false };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [cat]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim() || !form.percentage?.trim()) {
      toast.error("Code, name and percentage are required.");
      return;
    }
    const pct = Number(form.percentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      toast.error("Percentage must be 0-100.");
      return;
    }
    if (catsRaw.some((t) => t.code.toLowerCase() === form.code.trim().toLowerCase() && t.id !== id)) {
      toast.error("Tax category code already in use.");
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
      await updateTax.mutateAsync({
        id: id!,
        patch: {
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
          percentage: String(pct),
          description: form.description?.trim() || null,
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
    if (!confirm("Hapus kategori pajak ini?")) return;
    try {
      await removeTax.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/tax-categories");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEdit = () => setEditing(true);

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
        <FormSkeleton sections={[["half", "half"]]} />
      </RoleGuard>
    );
  }

  if (!cat) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Tax category not found</p>
        <div className="text-center">
          <Link to="/app/setup/tax-categories" className="text-sm text-primary hover:text-primary/80">
            Back to Tax Categories
          </Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <FormPage
        title={form.name || cat.name}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={updateTax.isPending}>
                {updateTax.isPending ? "Saving..." : "Update"}
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
              label="Tax code"
              placeholder="PPN11"
              value={form.code || ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
            />
            <Input
              label="Tax category name"
              placeholder="PPN 11%"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!editing}
            />
            <Input
              label="Percentage (%)"
              placeholder="11"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.percentage || ""}
              onChange={(e) => setForm({ ...form, percentage: e.target.value })}
              disabled={!editing}
            />
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium leading-none">Active</div>
                <div className="text-xs text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</div>
              </div>
              <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} disabled={!editing} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Description</label>
              <Textarea
                placeholder="Optional description"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                disabled={!editing}
                rows={2}
              />
            </div>
          </FormGrid>
        </FormSection>
              <FormSection title="Aktivitas">
          <ActivityTimeline documentType="TAX_CATEGORY" documentId={id!} />
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
