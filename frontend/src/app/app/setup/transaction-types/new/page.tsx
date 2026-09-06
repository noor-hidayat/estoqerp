import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDocumentSeries, useInsert } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { toast } from "sonner";

const KINDS = [
  { value: "RECEIPT", label: "Receipt (barang masuk)" },
  { value: "ISSUE", label: "Issue (barang keluar)" },
  { value: "TRANSFER", label: "Transfer (antar gudang)" },
];

export default function NewTransactionTypePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", kind: "RECEIPT", series: "" });

  const insertType = useInsert("movementTypes");
  const { data: smvSeries = [], isLoading: loadingSeries } = useDocumentSeries({
    documentTypeCode: "Stock Movement",
  });

  // Default series = series default (isDefault) di Document Numbering doctype Stock Movement.
  useEffect(() => {
    if (form.series || smvSeries.length === 0) return;
    const def = smvSeries.find((s) => s.isDefault) ?? smvSeries[0];
    if (def) setForm((prev) => ({ ...prev, series: prev.series || def.prefix }));
  }, [smvSeries, form.series]);

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!form.series.trim()) {
      toast.error("Series wajib dipilih dari document numbering.");
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
      await insertType.mutateAsync({
        name: form.name.trim(),
        kind: form.kind,
        series: form.series.trim().toUpperCase(),
      });
      toast.success("Created");
      navigate("/app/setup/transaction-types");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.movementTypes"]}>
      <FormPage
        title="Add Transaction Type"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insertType.isPending}>
            {insertType.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Field>
              <FieldLabel>Base type</FieldLabel>
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
              <FieldDescription>
                Tipe dasar menentukan arah gudang: Receipt = masuk, Issue = keluar, Transfer = asal → tujuan.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Series (document numbering)</FieldLabel>
              <Select
                value={form.series}
                onChange={(e) => setForm({ ...form, series: e.target.value })}
                disabled={loadingSeries || smvSeries.length === 0}
              >
                <option value="" disabled>
                  {loadingSeries ? "Memuat series..." : "Pilih series"}
                </option>
                {smvSeries.map((s) => {
                  const preview = s.format.replace("{PREFIX}", s.prefix);
                  return (
                    <option key={s.id} value={s.prefix}>
                      {s.name} — {preview}
                      {s.isDefault ? " (Default)" : ""}
                    </option>
                  );
                })}
              </Select>
              <FieldDescription>
                Diambil dari Document Numbering doctype Stock Movement. Default terpilih = series default di sana. Yang disimpan hanya series (prefix), bukan document number.
              </FieldDescription>
            </Field>
            <div className="sm:col-span-2">
              <Input
                label="Name"
                placeholder="Transfer antar gudang"
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
