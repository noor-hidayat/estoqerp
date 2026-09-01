import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useItemGroup, useItemGroups, useUpdate } from "@/lib/api/query";
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

export default function EditItemGroupPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: itemGroup, isLoading: itemGroupLoading } = useItemGroup(id);
  const { data: itemGroupsRaw = [] } = useItemGroups();
  const updateItemGroup = useUpdate("itemGroups");

  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useErrorToast(error);

  useEffect(() => {
    if (itemGroup) {
      setForm({ code: itemGroup.code, name: itemGroup.name });
    }
  }, [itemGroup]);

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and item group name are required.");
      return false;
    }
    if (
      itemGroupsRaw.some(
        (c) =>
          c.code.toLowerCase() === form.code.trim().toLowerCase() &&
          c.id !== id
      )
    ) {
      setError("Item group code already in use.");
      return false;
    }
    if (!id) return false;
    try {
      await updateItemGroup.mutateAsync({ id, patch: { ...form } });
      setSaved(true);
      return true;    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) navigate("/app/setup/item-groups");
  };

  useSaveShortcut(save, true);

  if (itemGroupLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
        <FormSkeleton
          sections={[["half", "half"]]}
        />
      </RoleGuard>
    );
  }

  if (!itemGroup) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Item group not found</p>
        <div className="text-center">
          <Link to="/app/setup/item-groups" className="text-sm text-primary hover:text-primary/80">Back to Item Groups</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
      <FormPage
        title="Edit Item Group"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/item-groups")}>
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
              label="Item group code"
              placeholder="GROUP"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Item group name"
              placeholder="Snacks"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}