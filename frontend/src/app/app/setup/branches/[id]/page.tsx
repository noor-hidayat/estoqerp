import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useBranch, useBranches, useUpdate } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { Link } from "react-router-dom";
import { useErrorToast } from "@/hooks/use-error-toast";

export default function EditBranchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: branch, isLoading: branchLoading } = useBranch(id);
  const { data: branches = [] } = useBranches();
  const updateBranch = useUpdate("branches");

  const [form, setForm] = useState({ code: "", name: "", city: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useErrorToast(error);

  useEffect(() => {
    if (branch) {
      setForm({ code: branch.code, name: branch.name, city: branch.city });
    }
  }, [branch]);

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and branch name are required.");
      return false;
    }
    if (
      branches.some(
        (b) =>
          b.code.toLowerCase() === form.code.trim().toLowerCase() &&
          b.id !== id
      )
    ) {
      setError("Branch code already in use.");
      return false;
    }
    if (!id) return false;
    try {
      await updateBranch.mutateAsync({ id, patch: { ...form } });
      setSaved(true);
      return true;    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) navigate("/app/setup/branches");
  };

  useSaveShortcut(save, true);

  if (branchLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
        <FormSkeleton
          sections={[["half", "half", "wide"]]}
        />
      </RoleGuard>
    );
  }

  if (!branch) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Branch not found</p>
        <div className="text-center">
          <Link to="/app/setup/branches" className="text-sm text-primary hover:text-primary/80">Back to Branches</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <FormPage
        title="Edit Branch"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/branches")}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={save}>
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