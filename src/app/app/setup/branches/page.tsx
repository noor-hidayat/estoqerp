"use client";

import { useState } from "react";
import {
  Building2,
  Pencil,
  Plus,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { useData } from "@/hooks/use-db";
import { newUid } from "@/lib/mock/store";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import type { Branch, Warehouse } from "@/types";

export default function BranchesPage() {
  const { db, insert, update, remove, refresh } = useData();
  const [tab, setTab] = useState("branches");

  const [branchOpen, setBranchOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ code: "", name: "", city: "" });

  const [whOpen, setWhOpen] = useState(false);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);
  const [whForm, setWhForm] = useState({
    code: "",
    name: "",
    branchId: "",
  });
  const [error, setError] = useState("");

  const openNewBranch = () => {
    setEditingBranch(null);
    setBranchForm({ code: "", name: "", city: "" });
    setError("");
    setBranchOpen(true);
  };

  const openEditBranch = (b: Branch) => {
    setEditingBranch(b);
    setBranchForm({ code: b.code, name: b.name, city: b.city });
    setError("");
    setBranchOpen(true);
  };

  const saveBranch = async () => {
    if (!branchForm.code.trim() || !branchForm.name.trim()) {
      setError("Kode dan nama cabang wajib diisi.");
      return;
    }
    if (
      db.branches.some(
        (b) =>
          b.code.toLowerCase() === branchForm.code.trim().toLowerCase() &&
          b.id !== editingBranch?.id
      )
    ) {
      setError("Kode cabang sudah digunakan.");
      return;
    }
    const err = editingBranch
      ? await update("branches", editingBranch.id, { ...branchForm })
      : await insert("branches", { ...branchForm, id: newUid("br") });
    if (err) {
      setError(err);
      return;
    }
    setBranchOpen(false);
  };

  const removeBranch = async (b: Branch) => {
    if (!confirm(`Hapus cabang "${b.name}"? Semua gudang di dalamnya ikut dihapus.`))
      return;
    const err = await remove("branches", b.id);
    if (err) {
      setError(err);
      return;
    }
    await refresh();
  };

  const openNewWh = () => {
    setEditingWh(null);
    setWhForm({ code: "", name: "", branchId: db.branches[0]?.id ?? "" });
    setError("");
    setWhOpen(true);
  };

  const openEditWh = (w: Warehouse) => {
    setEditingWh(w);
    setWhForm({ code: w.code, name: w.name, branchId: w.branchId });
    setError("");
    setWhOpen(true);
  };

  const saveWh = async () => {
    if (!whForm.code.trim() || !whForm.name.trim() || !whForm.branchId) {
      setError("Kode, nama gudang, dan cabang wajib diisi.");
      return;
    }
    if (
      db.warehouses.some(
        (w) =>
          w.code.toLowerCase() === whForm.code.trim().toLowerCase() &&
          w.id !== editingWh?.id
      )
    ) {
      setError("Kode gudang sudah digunakan.");
      return;
    }
    const err = editingWh
      ? await update("warehouses", editingWh.id, { ...whForm })
      : await insert("warehouses", { ...whForm, id: newUid("wh") });
    if (err) {
      setError(err);
      return;
    }
    setWhOpen(false);
  };

  const removeWh = async (w: Warehouse) => {
    if (!confirm(`Hapus gudang "${w.name}"? Lokasi di dalamnya ikut dihapus.`))
      return;
    const err = await remove("warehouses", w.id);
    if (err) {
      setError(err);
      return;
    }
    await refresh();
  };

  const branchOf = (id: string) => db.branches.find((b) => b.id === id);

  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <PageHeader
        eyebrow="Setup"
        title="Cabang & Gudang"
        description="Kelola struktur organisasi multi-cabang dan multi-gudang untuk stock opname."
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          tabs={[
            { id: "branches", label: "Cabang", count: db.branches.length },
            { id: "warehouses", label: "Gudang", count: db.warehouses.length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <Button
          variant="secondary"
          onClick={tab === "branches" ? openNewBranch : openNewWh}
        >
          <Plus size={15} strokeWidth={2.2} />
          {tab === "branches" ? "Tambah Cabang" : "Tambah Gudang"}
        </Button>
      </div>

      {tab === "branches" ? (
        db.branches.length === 0 ? (
          <EmptyState
            icon={<Building2 size={26} strokeWidth={2} />}
            title="Belum ada cabang"
            description="Tambahkan cabang pertama untuk struktur organisasi."
          />
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white">
            <Table columns={["Kode", "Nama Cabang", "Kota", "Jumlah Gudang", ""]}>
              {db.branches.map((b) => (
                <tr key={b.id} className="transition-colors hover:bg-zinc-50/60">
                  <Td mono>{b.code}</Td>
                  <Td className="text-[13.5px] font-semibold text-zinc-900">
                    {b.name}
                  </Td>
                  <Td className="text-[12.5px]">{b.city}</Td>
                  <Td>
                    <Badge tone="neutral">
                      {db.warehouses.filter((w) => w.branchId === b.id).length} gudang
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditBranch(b)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <Pencil size={15} strokeWidth={2.2} />
                      </button>
                      <button
                        onClick={() => removeBranch(b)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        )
      ) : db.warehouses.length === 0 ? (
        <EmptyState
          icon={<WarehouseIcon size={26} strokeWidth={2} />}
          title="Belum ada gudang"
          description="Tambahkan gudang dan hubungkan ke cabang yang sesuai."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table columns={["Kode", "Nama Gudang", "Cabang", "Jumlah Lokasi", ""]}>
            {db.warehouses.map((w) => (
              <tr key={w.id} className="transition-colors hover:bg-zinc-50/60">
                <Td mono>{w.code}</Td>
                <Td className="text-[13.5px] font-semibold text-zinc-900">
                  {w.name}
                </Td>
                <Td>
                  <Badge tone="neutral">{branchOf(w.branchId)?.name ?? "—"}</Badge>
                </Td>
                <Td className="text-[12.5px]">
                  {db.locations.filter((l) => l.warehouseId === w.id).length} lokasi
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditWh(w)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <Pencil size={15} strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => removeWh(w)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={15} strokeWidth={2.2} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <Modal
        open={branchOpen}
        onClose={() => setBranchOpen(false)}
        title={editingBranch ? "Edit Cabang" : "Tambah Cabang"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBranchOpen(false)}>
              Batal
            </Button>
            <Button variant="secondary" onClick={saveBranch}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Kode cabang"
            placeholder="PBG"
            value={branchForm.code}
            onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
          />
          <Input
            label="Kota"
            placeholder="Bandung"
            value={branchForm.city}
            onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
          />
          <div className="sm:col-span-2">
            <Input
              label="Nama cabang"
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
            />
          </div>
        </div>
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
            {error}
          </p>
        )}
      </Modal>

      <Modal
        open={whOpen}
        onClose={() => setWhOpen(false)}
        title={editingWh ? "Edit Gudang" : "Tambah Gudang"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setWhOpen(false)}>
              Batal
            </Button>
            <Button variant="secondary" onClick={saveWh}>
              Simpan
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Kode gudang"
            placeholder="BND-01"
            value={whForm.code}
            onChange={(e) => setWhForm({ ...whForm, code: e.target.value })}
          />
          <Select
            label="Cabang"
            value={whForm.branchId}
            onChange={(e) => setWhForm({ ...whForm, branchId: e.target.value })}
          >
            {db.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <Input
              label="Nama gudang"
              value={whForm.name}
              onChange={(e) => setWhForm({ ...whForm, name: e.target.value })}
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
