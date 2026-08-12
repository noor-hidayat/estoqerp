"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { useAllWarehouses, useBranches, useLocations, useInsert, useUpdate, useRemove } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ShellLoader } from "@/components/ui/loader";
import type { Warehouse } from "@/types";

export default function WarehousesPage() {
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const { data: locations = [] } = useLocations();
  const insertWarehouse = useInsert("warehouses");
  const updateWarehouse = useUpdate("warehouses");
  const removeWarehouse = useRemove("warehouses");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    branchId: "",
  });
  const [error, setError] = useState("");

  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name: "", branchId: branches[0]?.id ?? "" });
    setError("");
    setOpen(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditing(w);
    setForm({ code: w.code, name: w.name, branchId: w.branchId });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.branchId) {
      setError("Kode, nama gudang, dan plant wajib diisi.");
      return;
    }
    if (
      warehouses.some(
        (w) =>
          w.code.toLowerCase() === form.code.trim().toLowerCase() &&
          w.id !== editing?.id
      )
    ) {
      setError("Kode gudang sudah digunakan.");
      return;
    }
    try {
      if (editing) {
        await updateWarehouse.mutateAsync({ id: editing.id, patch: { ...form } });
      } else {
        await insertWarehouse.mutateAsync({ ...form });
      }
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    }
  };

  useSaveShortcut(save, open);

  const handleRemove = async (w: Warehouse) => {
    if (!confirm(`Hapus gudang "${w.name}"?`)) return;
    try {
      await removeWarehouse.mutateAsync(w.id);
    } catch {
      alert("Tidak bisa menghapus gudang ini karena masih digunakan oleh lokasi atau project.");
    }
  };

  const branchOf = (id: string) => branches.find((b) => b.id === id);

  if (warehousesLoading) return <ShellLoader />;

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
      <PageHeader
        eyebrow="Inventory"
        title="Warehouses"
        description="Kelola gudang yang berada di bawah setiap plant."
        actions={
          <Button variant="secondary" onClick={openNew}>
            <Plus size={15} strokeWidth={2} />
            Tambah Gudang
          </Button>
        }
      />

      {warehouses.length === 0 ? (
        <EmptyState
          icon={<WarehouseIcon size={26} strokeWidth={2} />}
          title="Belum ada gudang"
          description="Tambahkan gudang dan hubungkan ke plant yang sesuai."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table storageKey="warehouses" columns={["Kode", "Nama Gudang", "Plant", "Jumlah Lokasi", ""]}>
            {warehouses.map((w) => (
              <tr key={w.id} className="transition-colors hover:bg-zinc-50/60">
                <Td mono>{w.code}</Td>
                <Td truncate className="text-[13.5px] font-semibold text-zinc-900">
                  {w.name}
                </Td>
                <Td>
                  <Badge tone="neutral">{branchOf(w.branchId)?.name ?? "—"}</Badge>
                </Td>
                <Td className="text-[12.5px]">
                  {locations.filter((l) => l.warehouseId === w.id).length} lokasi
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(w)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <Pencil size={15} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => handleRemove(w)}
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
        title={editing ? "Edit Gudang" : "Tambah Gudang"}
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
            label="Kode gudang"
            placeholder="BND-01"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Select
            label="Plant"
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Input
              label="Nama gudang"
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
