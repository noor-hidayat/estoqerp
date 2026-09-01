import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useItemGroups, useInsert } from "@/lib/api/query";
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

export default function NewItemGroupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useErrorToast(error);

  const { data: itemGroupsRaw = [] } = useItemGroups();
  const insertItemGroup = useInsert("itemGroups");

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and item group name are required.");
      return false;
    }
    if (
      itemGroupsRaw.some(
        (c) => c.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      setError("Item group code already in use.");
      return false;
    }
    try {
      await insertItemGroup.mutateAsync({ ...form });
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

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
      <FormPage
        title="Add Item Group"
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