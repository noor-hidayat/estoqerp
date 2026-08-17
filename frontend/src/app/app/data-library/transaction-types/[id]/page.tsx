"use client";

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useMovementTypes, useUpdate } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";

const KINDS = [
  { value: "RECEIPT", label: "Receipt (barang masuk)" },
  { value: "ISSUE", label: "Issue (barang keluar)" },
  { value: "TRANSFER", label: "Transfer (antar gudang)" },
];

export default function EditTransactionTypePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: typesRaw = [], isLoading } = useMovementTypes();
  const updateType = useUpdate("movementTypes");

  const [form, setForm] = useState({
    name: "",
    kind: "RECEIPT",
    series: "",
  });
  const [error, setError] = useState("");

  const type = typesRaw.find((t) => t.id === id);

  useEffect(() => {
    if (type) {
      setForm({
        name: type.name,
        kind: type.kind ?? "RECEIPT",
        series: type.series ?? "",
      });
    }
  }, [type]);

  const save = async () => {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.series.trim()) {
      setError("Series (prefix penomoran) wajib diisi.");
      return;
    }
    if (!id) return;
    try {
      await updateType.mutateAsync({
        id,
        patch: {
          name: form.name.trim(),
          kind: form.kind,
          series: form.series.trim().toUpperCase(),
        },
      });
      navigate("/app/data-library/transaction-types");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.movementTypes"]}>
        <FormSkeleton sections={[["half", "half", "half", "half"]]} />
      </RoleGuard>
    );
  }

  if (!type) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.movementTypes"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">
          Transaction type not found
        </p>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.movementTypes"]}>
      <FormPage title="Edit Transaction Type">
        <FormSection>
          <FormGrid>
            <Field>
              <FieldLabel>Code</FieldLabel>
              <Input value={type.code} disabled readOnly />
              <FieldDescription>
                Code dibuat otomatis dari series.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Base type</FieldLabel>
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                disabled={type.builtin}
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
                disabled={type.builtin}
              />
              <FieldDescription>
                Awalan nomor transaksi. Bisa pakai token tanggal: <code className="rounded bg-muted px-1 font-mono text-[11px]">DD</code> hari, <code className="rounded bg-muted px-1 font-mono text-[11px]">MM</code> bulan, <code className="rounded bg-muted px-1 font-mono text-[11px]">YY</code> tahun 2 digit, <code className="rounded bg-muted px-1 font-mono text-[11px]">YYYY</code> tahun 4 digit, <code className="rounded bg-muted px-1 font-mono text-[11px]">HH</code> jam. Contoh <code className="rounded bg-muted px-1 font-mono text-[11px]">TRF-DDMMYY</code> → <code className="rounded bg-muted px-1 font-mono text-[11px]">TRF-250817</code>.
              </FieldDescription>
            </Field>
            <Input
              label="Name"
              placeholder="Transfer antar gudang"
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
          <Button variant="ghost" onClick={() => navigate("/app/data-library/transaction-types")}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button variant="primary" onClick={save}>
            <Save size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
