import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDepartment, useDepartments, useUpdate, useRemove } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { ActivityTimeline } from "@/modules/activity/components/activity-timeline";

export default function EditDepartmentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: department, isLoading } = useDepartment(id);
  const { data: departmentsRaw = [] } = useDepartments();
  const updateDepartment = useUpdate("departments");
  const removeDepartment = useRemove("departments");

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (department) {
      const init = { code: department.code, name: department.name, isActive: (department as any).isActive !== false };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [department]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and department name are required.");
      return;
    }
    if (
      departmentsRaw.some(
        (d) => d.code.toLowerCase() === form.code.trim().toLowerCase() && d.id !== id
      )
    ) {
      toast.error("Department code already in use.");
      return;
    }
    if (
      departmentsRaw.some(
        (d) => d.name.toLowerCase() === form.name.trim().toLowerCase() && d.id !== id
      )
    ) {
      toast.error("Department name already in use.");
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
      await updateDepartment.mutateAsync({ id: id!, patch: { code: form.code.trim().toUpperCase(), name: form.name.trim(), isActive: !!form.isActive } });
      toast.success("Updated");
      setSnapshot(JSON.stringify(form));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus departemen ini?")) return;
    try {
      await removeDepartment.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/departments");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEdit = () => setEditing(true);

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.departments"]}>
        <FormSkeleton sections={[["half", "half"]]} />
      </RoleGuard>
    );
  }

  if (!department) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.departments"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Department not found</p>
        <div className="text-center">
          <Link to="/app/setup/departments" className="text-sm text-primary hover:text-primary/80">
            Back to Departments
          </Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.departments"]}>
      <FormPage
        title={form.name || department.name}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={updateDepartment.isPending}>
                {updateDepartment.isPending ? "Saving..." : "Update"}
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
              label="Department code"
              placeholder="PRC"
              value={form.code || ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
            />
            <Input
              label="Department name"
              placeholder="Purchasing"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!editing}
            />
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium leading-none">Active</div>
                <div className="text-xs text-muted-foreground">{form.isActive ? "Active" : "Inactive"}</div>
              </div>
              <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} disabled={!editing} />
            </div>
          </FormGrid>
        </FormSection>
              <FormSection title="Aktivitas">
          <ActivityTimeline documentType="DEPARTMENT" documentId={id!} />
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
