import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useItemGroups, useInsert } from "@/lib/api/query";
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

export default function NewItemGroupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "" });

  const { data: itemGroupsRaw = [] } = useItemGroups();
  const insertItemGroup = useInsert("itemGroups");

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and item group name are required.");
      return;
    }
    if (
      itemGroupsRaw.some(
        (c) => c.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      toast.error("Item group code already in use.");
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
      await insertItemGroup.mutateAsync({ code: form.code.trim(), name: form.name.trim() });
      toast.success("Created");
      navigate("/app/setup/item-groups");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
      <FormPage
        title="Add Item Group"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insertItemGroup.isPending}>
            {insertItemGroup.isPending ? "Saving..." : "Create"}
          </Button>
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
