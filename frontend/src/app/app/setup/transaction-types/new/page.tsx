import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInsert } from "@/lib/api/query";
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
  const [form, setForm] = useState({ name: "", kind: "RECEIPT", series: "SMV" });

  const insertType = useInsert("movementTypes");

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!form.series.trim()) {
      toast.error("Series (prefix penomoran) wajib diisi.");
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
              <FieldLabel>Series (prefix penomoran)</FieldLabel>
              <Input
                placeholder="mis. TRF, RCV, ISS, TRF-DDMMYY"
                value={form.series}
                onChange={(e) => setForm({ ...form, series: e.target.value })}
              />
              <FieldDescription>
                Awalan nomor transaksi. Bisa pakai token tanggal: <code className="rounded bg-muted px-1 text-[11px]">DD</code> hari, <code className="rounded bg-muted px-1 text-[11px]">MM</code> bulan, <code className="rounded bg-muted px-1 text-[11px]">YY</code> tahun 2 digit, <code className="rounded bg-muted px-1 text-[11px]">YYYY</code> tahun 4 digit, <code className="rounded bg-muted px-1 text-[11px]">HH</code> jam. Contoh <code className="rounded bg-muted px-1 text-[11px]">TRF-DDMMYY</code> → <code className="rounded bg-muted px-1 text-[11px]">TRF-250817</code>.
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
