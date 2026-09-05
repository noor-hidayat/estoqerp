import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDocumentTypes, useCreateDocumentSeries } from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";
import { toast } from "sonner";

export default function NewDocumentSeriesPage() {
  const navigate = useNavigate();
  const { data: types = [] } = useDocumentTypes();
  const createSeries = useCreateDocumentSeries();
  const [form, setForm] = useState({
    documentTypeId: "",
    name: "",
    prefix: "",
    format: "{PREFIX}-{YYMM}-{SEQ:4}",
    padding: 4,
    resetPolicy: "MONTHLY" as const,
    isDefault: false,
    branchSpecific: false,
    isActive: true,
  });

  const handleCreateSeries = async () => {
    if (!form.documentTypeId || !form.name || !form.prefix || !form.format) {
      toast.error("Lengkapi semua field");
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
      await createSeries.mutateAsync({ ...form, padding: Number(form.padding) });
      toast.success("Series created");
      navigate("/app/setup/document-types");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <FormPage
        title="Add Series"
        actions={
          <Button size="sm" onClick={handleCreateSeries} disabled={createSeries.isPending}>
            {createSeries.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Field>
              <FieldLabel>Document Type</FieldLabel>
              <Select value={form.documentTypeId} onChange={(e) => setForm({ ...form, documentTypeId: e.target.value })}>
                <option value="">Pilih type</option>
                {types.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel>Name</FieldLabel>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Default PO" />
            </Field>
            <Field>
              <FieldLabel>Prefix</FieldLabel>
              <Input value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value.toUpperCase() })} placeholder="PO" />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Format</FieldLabel>
              <Input value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} placeholder="{PREFIX}-{YYMM}-{SEQ:4}" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection>
          <FormGrid>
            <Field>
              <FieldLabel>Reset Policy</FieldLabel>
              <Select value={form.resetPolicy} onChange={(e) => setForm({ ...form, resetPolicy: e.target.value as any })}>
                <option value="MONTHLY">MONTHLY</option>
                <option value="YEARLY">YEARLY</option>
                <option value="DAILY">DAILY</option>
                <option value="NEVER">NEVER</option>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Status</FieldLabel>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Default series
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.branchSpecific} onChange={(e) => setForm({ ...form, branchSpecific: e.target.checked })} /> Branch specific
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> Active
                </label>
              </div>
            </Field>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
