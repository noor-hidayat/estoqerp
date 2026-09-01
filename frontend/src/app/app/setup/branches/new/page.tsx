import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useBranches, useInsert } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";

export default function NewBranchPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", city: "" });
  const [error, setError] = useState("");
  useErrorToast(error);

  const { data: branches = [] } = useBranches();
  const insertBranch = useInsert("branches");
  const [saved, setSaved] = useState(false);

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and branch name are required.");
      return false;
    }
    if (
      branches.some(
        (b) => b.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Branch code already in use.");
      return false;
    }
    try {
      await insertBranch.mutateAsync({ ...form });
      setSaved(true);
      return true;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) navigate("/app/setup/branches");
  };

  useSaveShortcut(save, true);

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <FormPage
        title="Add Branch"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/branches")}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={save} disabled={insertBranch.isPending}>
              Save
            </Button>
            <Button variant="primary" size="sm" className="h-7 px-2.5 text-xs" onClick={handleSubmit}>
              Submit
            </Button>
          </div>
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