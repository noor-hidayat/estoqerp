"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
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
  FormActions,
} from "@/components/ui/form-page";
import { useErrorToast } from "@/hooks/use-error-toast";

const KINDS = [
  { value: "RECEIPT", label: "Receipt (barang masuk)" },
  { value: "ISSUE", label: "Issue (barang keluar)" },
  { value: "TRANSFER", label: "Transfer (antar gudang)" },
];

export default function NewTransactionTypePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", kind: "RECEIPT", series: "SMV" });
  const [error, setError] = useState("");
  useErrorToast(error);

  const insertType = useInsert("movementTypes");

  const save = async () => {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.series.trim()) {
      setError("Series (prefix penomoran) wajib diisi.");
      return;
    }
    try {
      await insertType.mutateAsync({
        name: form.name.trim(),
        kind: form.kind,
        series: form.series.trim().toUpperCase(),
      });
      navigate("/app/data-library/transaction-types");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.movementTypes"]}>
      <FormPage title="Add Transaction Type">
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
                Awalan nomor transaksi. Bisa pakai token tanggal: <code className="rounded bg-muted px-1 font-mono text-[11px]">DD</code> hari, <code className="rounded bg-muted px-1 font-mono text-[11px]">MM</code> bulan, <code className="rounded bg-muted px-1 font-mono text-[11px]">YY</code> tahun 2 digit, <code className="rounded bg-muted px-1 font-mono text-[11px]">YYYY</code> tahun 4 digit, <code className="rounded bg-muted px-1 font-mono text-[11px]">HH</code> jam. Contoh <code className="rounded bg-muted px-1 font-mono text-[11px]">TRF-DDMMYY</code> → <code className="rounded bg-muted px-1 font-mono text-[11px]">TRF-250817</code>.
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

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/data-library/transaction-types")}>
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
