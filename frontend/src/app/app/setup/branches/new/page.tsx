import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBranches, useInsert } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { toast } from "sonner";

export default function NewBranchPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", city: "" });

  const { data: branches = [] } = useBranches();
  const insertBranch = useInsert("branches");

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and branch name are required.");
      return;
    }
    if (
      branches.some(
        (b) => b.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      toast.error("Branch code already in use.");
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
      await insertBranch.mutateAsync({ code: form.code.trim(), name: form.name.trim(), city: form.city });
      toast.success("Created");
      navigate("/app/setup/branches");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <FormPage
        title="Add Branch"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insertBranch.isPending}>
            {insertBranch.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Branch code"
              placeholder="PBG"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="City"
              placeholder="Bandung"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Branch name"
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
