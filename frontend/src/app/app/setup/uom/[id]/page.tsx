import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useUom, useUoms, useUpdate } from "@/lib/api/query";
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

export default function EditUomPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: uom, isLoading } = useUom(id);
  const { data: uomsRaw = [] } = useUoms();
  const updateUom = useUpdate("uom");

  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useErrorToast(error);

  useEffect(() => {
    if (uom) {
      setForm({ code: uom.code, name: uom.name });
    }
  }, [uom]);

  const save = async (): Promise<boolean> => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and UOM name are required.");
      return false;
    }
    if (
      uomsRaw.some(
        (u) => u.code.toLowerCase() === form.code.trim().toLowerCase() && u.id !== id
      )
    ) {
      setError("UOM code already in use.");
      return false;
    }
    if (!id) return false;
    try {
      await updateUom.mutateAsync({ id, patch: { ...form } });
      setSaved(true);
      return true;    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) navigate("/app/setup/uom");
  };

  useSaveShortcut(save, true);

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
      <FormPage title="Edit UOM">
        <FormSection>
          <FormGrid>
            <Input
              label="UOM code"
              placeholder="PCS"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="UOM name"
              placeholder="Pieces"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}