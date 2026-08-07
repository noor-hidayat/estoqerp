"use client";

import { useMemo, useState } from "react";
import { PencilSimple, Plus, UsersThree } from "@phosphor-icons/react";
import { useData } from "@/hooks/use-db";
import { signUpUser } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/session";
import type { Role, User } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";

const ROLE_TONES: Record<Role, "emerald" | "blue" | "violet"> = {
  ADMIN: "violet",
  APPROVER: "blue",
  STAFF: "emerald",
};

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: Role;
  branchId: string;
  warehouseId: string;
  active: boolean;
}

export default function UsersPage() {
  const { db, update, refresh } = useData();
  const [roleFilter, setRoleFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>({
    name: "",
    email: "",
    password: "",
    role: "STAFF",
    branchId: db.branches[0]?.id ?? "",
    warehouseId: db.warehouses[0]?.id ?? "",
    active: true,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const users = useMemo(
    () =>
      db.users
        .filter((u) => roleFilter === "all" || u.role === roleFilter)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [db, roleFilter]
  );

  const branchOf = (id?: string) => db.branches.find((b) => b.id === id);
  const whOf = (id?: string) => db.warehouses.find((w) => w.id === id);

  const openCreate = () => {
    setEditing(null);
    setForm({
      name: "",
      email: "",
      password: "",
      role: "STAFF",
      branchId: db.branches[0]?.id ?? "",
      warehouseId: db.warehouses[0]?.id ?? "",
      active: true,
    });
    setError("");
    setOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({
      name: u.name,
      email: u.email,
      password: "",
      role: u.role,
      branchId: u.branchId ?? db.branches[0]?.id ?? "",
      warehouseId: u.warehouseId ?? db.warehouses[0]?.id ?? "",
      active: u.active,
    });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Nama dan email wajib diisi.");
      return;
    }
    if (
      db.users.some(
        (u) =>
          u.email.toLowerCase() === form.email.trim().toLowerCase() &&
          u.id !== editing?.id
      )
    ) {
      setError("Email sudah terdaftar.");
      return;
    }
    setSaving(true);
    setError("");

    if (editing) {
      const err = await update("users", editing.id, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: form.role,
        branchId: form.branchId,
        warehouseId: form.role === "STAFF" ? form.warehouseId : undefined,
        active: form.active,
      });
      setSaving(false);
      if (err) {
        setError(err);
        return;
      }
      setOpen(false);
      return;
    }

    if (!form.password) {
      setError("Password wajib diisi untuk user baru.");
      setSaving(false);
      return;
    }

    const email = form.email.trim().toLowerCase();
    const { data: signUp, error: signUpError } = await signUpUser(
      email,
      form.password,
      form.name.trim()
    );
    setSaving(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    const userId = signUp.user?.id;
    if (!userId) {
      setError("Gagal membuat akun. Periksa konfigurasi email confirmation.");
      return;
    }
    const err = await update("users", userId, {
      role: form.role,
      branchId: form.branchId,
      warehouseId: form.role === "STAFF" ? form.warehouseId : undefined,
      active: true,
      avatarHue: Math.floor(Math.random() * 360),
    });
    if (err) {
      setError(err);
      return;
    }
    await refresh();
    setOpen(false);
  };

  const toggleActive = (u: User, next: boolean) => {
    void update("users", u.id, { active: next });
  };

  const roleOptions: Role[] = ["ADMIN", "APPROVER", "STAFF"];

  return (
    <RoleGuard roles={["ADMIN"]}>
      <PageHeader
        eyebrow="Setup"
        title="User & Role"
        description="Kelola akses pengguna berdasarkan peran: Admin, Staff Gudang, dan Supervisor."
        actions={
          <Button variant="secondary" onClick={openCreate}>
            <Plus size={15} weight="bold" />
            Tambah User
          </Button>
        }
      />

      <div className="mb-5">
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="sm:w-56"
        >
          <option value="all">Semua role</option>
          {roleOptions.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={<UsersThree size={26} weight="bold" />}
          title="Tidak ada user"
          description="Tambahkan user untuk memberi akses ke workspace."
        />
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white">
          <Table
            columns={["User", "Email", "Role", "Cabang", "Gudang", "Status", ""]}
          >
            {users.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-zinc-50/60">
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} hue={u.avatarHue} size="sm" />
                    <span className="text-[13.5px] font-semibold text-zinc-900">
                      {u.name}
                    </span>
                  </div>
                </Td>
                <Td className="text-[12.5px] text-zinc-500">{u.email}</Td>
                <Td>
                  <Badge tone={ROLE_TONES[u.role]} dot>
                    {ROLE_LABELS[u.role]}
                  </Badge>
                </Td>
                <Td className="text-[12.5px]">
                  {branchOf(u.branchId)?.code ?? "—"}
                </Td>
                <Td className="text-[12.5px]">
                  {u.role === "STAFF" ? whOf(u.warehouseId)?.code ?? "—" : "—"}
                </Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Toggle
                      checked={u.active}
                      onChange={(next) => toggleActive(u, next)}
                    />
                    <Badge tone={u.active ? "emerald" : "neutral"} dot>
                      {u.active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>
                </Td>
                <Td>
                  <button
                    onClick={() => openEdit(u)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <PencilSimple size={15} weight="bold" />
                  </button>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit User" : "Tambah User"}
        description="Role menentukan menu dan aksi yang dapat dilakukan pengguna."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button variant="secondary" onClick={save} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label="Nama lengkap"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          {!editing && (
            <div className="sm:col-span-2">
              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          )}
          <Select
            label="Role"
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as Role })
            }
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Select
            label="Cabang"
            value={form.branchId}
            onChange={(e) => setForm({ ...form, branchId: e.target.value })}
          >
            {db.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} — {b.name}
              </option>
            ))}
          </Select>
          {form.role === "STAFF" && (
            <div className="sm:col-span-2">
              <Select
                label="Gudang"
                value={form.warehouseId}
                onChange={(e) =>
                  setForm({ ...form, warehouseId: e.target.value })
                }
              >
                {db.warehouses
                  .filter((w) => w.branchId === form.branchId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} — {w.name}
                    </option>
                  ))}
              </Select>
            </div>
          )}
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
