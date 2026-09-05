import { useParams, useNavigate } from "react-router-dom";
import { useDocumentSeriesOne, useUpdateDocumentSeries, useRemoveDocumentSeries } from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { Field, FieldLabel } from "@/components/ui/field";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";
import { ShellLoader } from "@/components/ui/loader";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function EditDocumentSeriesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: series, isLoading } = useDocumentSeriesOne(id);
  const update = useUpdateDocumentSeries();
  const remove = useRemoveDocumentSeries();
  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (series) {
      const init = { ...series };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [series]);

  const dirty = JSON.stringify(form) !== snapshot;

  if (isLoading) return <ShellLoader />;
  if (!series) return <div className="p-6">Series tidak ditemukan</div>;

  const handleSave = async () => {
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
      await update.mutateAsync({
        id: id!,
        patch: {
          name: form.name,
          prefix: form.prefix,
          format: form.format,
          padding: Number(form.padding),
          resetPolicy: form.resetPolicy,
          isDefault: form.isDefault,
          branchSpecific: form.branchSpecific,
          isActive: form.isActive,
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
    if (!confirm("Hapus series ini?")) return;
    try {
      await remove.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/document-types");
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const handleEdit = () => setEditing(true);

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <FormPage
        title={form.name || series.name}
        titleBadge={
          editing && dirty ? (
            <Badge tone="destructive">Not save</Badge>
          ) : null
        }
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={update.isPending}>
                {update.isPending ? "Saving..." : "Update"}
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
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!editing} />
            </Field>
            <Field>
              <FieldLabel>Prefix</FieldLabel>
              <Input value={form.prefix || ""} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} disabled={!editing} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Format</FieldLabel>
              <Input value={form.format || ""} onChange={(e) => setForm({ ...form, format: e.target.value })} placeholder="{PREFIX}-{YYMM}-{SEQ:4}" disabled={!editing} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection>
          <FormGrid>
            <Field>
              <FieldLabel>Reset Policy</FieldLabel>
              <Select value={form.resetPolicy} onChange={(e) => setForm({ ...form, resetPolicy: e.target.value })} disabled={!editing}>
                <option value="MONTHLY">MONTHLY</option>
                <option value="YEARLY">YEARLY</option>
                <option value="DAILY">DAILY</option>
                <option value="NEVER">NEVER</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} disabled={!editing} /> Default
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.branchSpecific} onChange={(e) => setForm({ ...form, branchSpecific: e.target.checked })} disabled={!editing} /> Branch specific
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} disabled={!editing} /> Active
                </label>
              </div>
            </Field>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
