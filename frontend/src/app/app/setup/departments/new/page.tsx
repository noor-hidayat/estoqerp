import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDepartments, useInsert } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { toast } from "sonner";

export default function NewDepartmentPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", isActive: true });

  const { data: departmentsRaw = [] } = useDepartments();
  const insertDepartment = useInsert("departments");

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and department name are required.");
      return;
    }
    if (departmentsRaw.some((d) => d.code.toLowerCase() === form.code.trim().toLowerCase())) {
      toast.error("Department code already in use.");
      return;
    }
    if (departmentsRaw.some((d) => d.name.toLowerCase() === form.name.trim().toLowerCase())) {
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
      await insertDepartment.mutateAsync({ code: form.code.trim().toUpperCase(), name: form.name.trim(), isActive: !!form.isActive });
      toast.success("Created");
      navigate("/app/setup/departments");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.departments"]}>
      <FormPage
        title="Add Department"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insertDepartment.isPending}>
            {insertDepartment.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Department code"
              placeholder="PRC"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Department name"
              placeholder="Purchasing"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium leading-none">Active</div>
                <div className="text-xs text-muted-foreground">Non-aktif akan jadi Inactive di tabel</div>
              </div>
              <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} />
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
