"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useUoms, useInsert } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";

export default function NewUomPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");

  const { data: uomsRaw = [] } = useUoms();
  const insertUom = useInsert("uom");

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and UOM name are required.");
      return;
    }
    if (uomsRaw.some((u) => u.code.toLowerCase() === form.code.trim().toLowerCase())) {
      setError("UOM code already in use.");
      return;
    }
    try {
      await insertUom.mutateAsync({ ...form });
      navigate("/app/data-library/uom");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.uom"]}>
      <FormPage title="Add UOM">
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
          {error && (
            <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/data-library/uom")}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button variant="primary" onClick={save}>
            <Plus size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}