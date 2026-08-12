"use client";

import { useMemo, useState } from "react";
import {
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useLocations, useAllWarehouses, useBranches, useInsert, useUpdate, useRemove } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import type { Location } from "@/types";
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

export default function LocationsPage() {
  const { data: allLocations = [], isLoading: locationsLoading } = useLocations();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const insertLocation = useInsert("locations");
  const updateLocation = useUpdate("locations");
  const removeLocation = useRemove("locations");

  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ code: "", name: "", warehouseId: "" });
  const [error, setError] = useState("");

  const locations = useMemo(() => {
    return allLocations
      .filter((l) => warehouseFilter === "all" || l.warehouseId === warehouseFilter)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [allLocations, warehouseFilter]);

  const warehouseOf = (id: string) => warehouses.find((w) => w.id === id);
  const branchOf = (branchId: string) => branches.find((b) => b.id === branchId);

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: "",
      name: "",
      warehouseId: warehouses[0]?.id ?? "",
    });
    setError("");
    setOpen(true);
  };

  const openEdit = (loc: Location) => {
    setEditing(loc);
    setForm({ code: loc.code, name: loc.name, warehouseId: loc.warehouseId });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.warehouseId) {
      setError("Kode lokasi dan gudang wajib diisi.");
      return;
    }
    if (
      allLocations.some(
        (l) =>
          l.code.toLowerCase() === form.code.trim().toLowerCase() &&
          l.id !== editing?.id
      )
    ) {
      setError("Kode lokasi sudah digunakan.");
      return;
    }
    try {
      if (editing) {
        await updateLocation.mutateAsync({ id: editing.id, patch: { ...form } });
      } else {
        await insertLocation.mutateAsync({ ...form });
      }
      setOpen(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan");
    }
  };

  useSaveShortcut(save, open);

  const handleRemove = async (loc: Location) => {
    if (!confirm(`Hapus lokasi "${loc.code}"?`)) return;
    try {
      await removeLocation.mutateAsync(loc.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Gagal menghapus");
    }
  };

  if (locationsLoading) return <ShellLoader />;

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
      <PageHeader
        eyebrow="Setup"
        title="Lokasi Gudang"
        description="Kode rak / bin yang dipakai saat sesi scan berlangsung, contoh: H1 AB1."
        actions={
          <Button variant="secondary" onClick={openCreate}>
            <Plus size={15} strokeWidth={2} />
            Tambah Lokasi
          </Button>
        }
      />

      <div className="mb-5">
        <Select
          value={warehouseFilter}
          onChange={(e) => setWarehouseFilter(e.target.value)}
          className="sm:w-64"
        >
          <option value="all">Semua gudang</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </Select>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          icon={<MapPin size={26} strokeWidth={2} />}
          title="Belum ada lokasi"
          description="Tambahkan lokasi rak/bin untuk menandai area pada sesi scan."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table storageKey="locations" columns={["Kode Lokasi", "Nama", "Gudang", "Cabang", ""]}>
            {locations.map((loc) => {
              const wh = warehouseOf(loc.warehouseId);
              return (
                <tr key={loc.id} className="transition-colors hover:bg-zinc-50/60">
                  <Td mono>{loc.code}</Td>
                  <Td className="text-[13.5px]">{loc.name}</Td>
                  <Td>
                    <Badge tone="neutral">{wh?.name ?? "—"}</Badge>
                  </Td>
                  <Td className="text-[12.5px] text-zinc-500">
                    {branchOf(wh?.branchId ?? "")?.name ?? "—"}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(loc)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <Pencil size={15} strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => handleRemove(loc)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} strokeWidth={2} />
                      </button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Lokasi" : "Tambah Lokasi"}
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
            label="Kode lokasi"
            placeholder="H1 AB1"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
          <Select
            label="Gudang"
            value={form.warehouseId}
            onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Input
              label="Nama lokasi (opsional)"
              placeholder="Rak H1, Blok A, Lorong 1"
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
