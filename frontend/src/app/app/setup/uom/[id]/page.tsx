import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUom, useUoms, useUpdate, useRemove } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function EditUomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: uom, isLoading } = useUom(id);
  const { data: uomsRaw = [] } = useUoms();
  const updateUom = useUpdate("uom");
  const removeUom = useRemove("uom");

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (uom) {
      const init = { code: uom.code, name: uom.name };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [uom]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error("Code and UOM name are required.");
      return;
    }
    if (
      uomsRaw.some(
        (u) => u.code.toLowerCase() === form.code.trim().toLowerCase() && u.id !== id
      )
    ) {
      toast.error("UOM code already in use.");
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
      await updateUom.mutateAsync({ id: id!, patch: { code: form.code.trim(), name: form.name.trim() } });
      toast.success("Updated");
      setSnapshot(JSON.stringify(form));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus UOM ini?")) return;
    try {
      await removeUom.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/uom");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEdit = () => setEditing(true);

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.uom"]}>
        <FormSkeleton sections={[["half", "half"]]} />
      </RoleGuard>
    );
  }

  if (!uom) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.uom"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">UOM not found</p>
        <div className="text-center">
          <Link to="/app/setup/uom" className="text-sm text-primary hover:text-primary/80">
            Back to UOM
          </Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.uom"]}>
      <FormPage
        title={form.name || uom.name}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={updateUom.isPending}>
                {updateUom.isPending ? "Saving..." : "Update"}
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
              label="UOM code"
              placeholder="PCS"
              value={form.code || ""}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={!editing}
            />
            <Input
              label="UOM name"
              placeholder="Pieces"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!editing}
            />
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
