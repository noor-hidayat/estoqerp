import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMovementTypes, useUpdate, useRemove } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const removeType = useRemove("movementTypes");

  const type = typesRaw.find((t) => t.id === id);

  const [form, setForm] = useState<any>({});
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<string>("");

  useEffect(() => {
    if (type) {
      const init = {
        name: type.name,
        kind: type.kind ?? "RECEIPT",
        series: type.series ?? "",
      };
      setForm(init);
      setSnapshot(JSON.stringify(init));
    }
  }, [type]);

  const dirty = JSON.stringify(form) !== snapshot;

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error("Name is required.");
      return;
    }
    if (!form.series?.trim()) {
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
      await updateType.mutateAsync({
        id: id!,
        patch: {
          name: form.name.trim(),
          kind: form.kind,
          series: form.series.trim().toUpperCase(),
        },
      });
      toast.success("Updated");
      setSnapshot(JSON.stringify(form));
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus transaction type ini?")) return;
    try {
      await removeType.mutateAsync(id!);
      toast.success("Deleted");
      navigate("/app/setup/transaction-types");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleEdit = () => setEditing(true);

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
      <FormPage
        title={form.name || type.name}
        titleBadge={editing && dirty ? <Badge tone="destructive">Not save</Badge> : null}
        actions={
          <div className="flex items-center gap-2">
            {editing && dirty && (
              <Button size="sm" onClick={handleSave} disabled={updateType.isPending}>
                {updateType.isPending ? "Saving..." : "Update"}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={handleEdit} className="gap-2">
                  <Pencil size={14} /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 size={14} /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
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
                value={form.kind || "RECEIPT"}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                disabled={!editing || type.builtin}
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
                value={form.series || ""}
                onChange={(e) => setForm({ ...form, series: e.target.value })}
                disabled={!editing || type.builtin}
              />
              <FieldDescription>
                Awalan nomor transaksi. Bisa pakai token tanggal: <code className="rounded bg-muted px-1 text-[11px]">DD</code> hari, <code className="rounded bg-muted px-1 text-[11px]">MM</code> bulan, <code className="rounded bg-muted px-1 text-[11px]">YY</code> tahun 2 digit, <code className="rounded bg-muted px-1 text-[11px]">YYYY</code> tahun 4 digit, <code className="rounded bg-muted px-1 text-[11px]">HH</code> jam. Contoh <code className="rounded bg-muted px-1 text-[11px]">TRF-DDMMYY</code> → <code className="rounded bg-muted px-1 text-[11px]">TRF-250817</code>.
              </FieldDescription>
            </Field>
            <Input
              label="Name"
              placeholder="Transfer antar gudang"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              disabled={!editing}
            />
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
