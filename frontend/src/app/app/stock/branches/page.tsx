"use client";

import { useState } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import { useBranches, useAllWarehouses, useInsert, useUpdate, useRemove } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShellLoader } from "@/components/ui/loader";
import type { Branch } from "@/types";

export default function PlantsPage() {
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const { data: warehouses = [] } = useAllWarehouses();
  const insertBranch = useInsert("branches");
  const updateBranch = useUpdate("branches");
  const removeBranch = useRemove("branches");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState({ code: "", name: "", city: "" });
  const [error, setError] = useState("");

  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name: "", city: "" });
    setError("");
    setOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditing(b);
    setForm({ code: b.code, name: b.name, city: b.city });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Kode dan nama plant wajib diisi.");
      return;
    }
    if (
      branches.some(
        (b) =>
          b.code.toLowerCase() === form.code.trim().toLowerCase() &&
          b.id !== editing?.id
      )
    ) {
      setError("Kode plant sudah digunakan.");
      return;
    }
    try {
      if (editing) {
        await updateBranch.mutateAsync({ id: editing.id, patch: { ...form } });
      } else {
        await insertBranch.mutateAsync({ ...form });
      }
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    }
  };

  useSaveShortcut(save, open);

  const handleRemove = async (b: Branch) => {
    if (!confirm(`Hapus plant "${b.name}"?`)) return;
    try {
      await removeBranch.mutateAsync(b.id);
    } catch {
      alert("Tidak bisa menghapus plant ini karena masih digunakan oleh gudang atau project.");
    }
  };

  if (branchesLoading) return <ShellLoader />;

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <PageHeader
        eyebrow="Inventory"
        title="Plants"
        description="Kelola plant / cabang sebagai struktur tertinggi organisasi."
        actions={
          <Button variant="secondary" onClick={openNew}>
            <Plus size={15} strokeWidth={2} />
            Tambah Plant
          </Button>
        }
      />

      {branches.length === 0 ? (
        <EmptyState
          icon={<Building2 size={26} strokeWidth={2} />}
          title="Belum ada plant"
          description="Tambahkan plant pertama untuk struktur organisasi."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table storageKey="branches" columns={["Kode", "Nama Plant", "Kota", "Jumlah Gudang", ""]}>
            {branches.map((b) => (
              <tr key={b.id} className="transition-colors hover:bg-zinc-50/60">
                <Td mono>{b.code}</Td>
                <Td truncate className="text-[13.5px] font-semibold text-zinc-900">
                  {b.name}
                </Td>
                <Td className="text-[12.5px]">{b.city}</Td>
                <Td>
                  <Badge tone="neutral">
                    {warehouses.filter((w) => w.branchId === b.id).length} gudang
                  </Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(b)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <Pencil size={15} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleRemove(b)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} strokeWidth={2} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Plant" : "Tambah Plant"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="secondary" onClick={save}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Kode plant"
            placeholder="PBG"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Input
            label="Kota"
            placeholder="Bandung"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="Nama plant"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
        </div>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
            {error}
          </p>
        )}
      </Modal>
    </RoleGuard>
  );
}
