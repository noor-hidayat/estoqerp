"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Users } from "lucide-react";
import {
  useUsers,
  useRoles,
  useUpdate,
} from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import type { User } from "@/types";
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
import { ShellLoader } from "@/components/ui/loader";
import { ROLE_LABELS } from "@/lib/session";

const ROLE_TONES: Record<string, "emerald" | "violet" | "blue"> = {
  role_sys_admin: "violet",
  role_admin: "blue",
  role_staff: "emerald",
};

interface FormState {
  name: string;
  email: string;
  password: string;
  roleId: string;
  active: boolean;
}

export default function UsersPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "", email: "", password: "", roleId: "", active: true,
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const updateUser = useUpdate("users");

  const sortedUsers = useMemo(
    () => (users ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [users]
  );

  const roleDisplay = (roleId: string) => {
    const r = (roles ?? []).find((x) => x.id === roleId);
    return r?.name ?? ROLE_LABELS[roleId] ?? roleId;
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", email: "", password: "", roleId: roles?.[0]?.id ?? "", active: true });
    setError("");
    setOpen(true);
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setForm({ name: u.name, email: u.email, password: "", roleId: u.role, active: u.active });
    setError("");
    setOpen(true);
  };

  const save = async () => {
    if (saving) return;
    if (!form.name.trim() || !form.email.trim()) { setError("Nama dan email wajib diisi."); return; }
    if ((users ?? []).some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase() && u.id !== editing?.id)) {
      setError("Email sudah terdaftar."); return;
    }
    setSaving(true); setError("");

    if (editing) {
      await updateUser.mutateAsync({ id: editing.id, patch: { name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.roleId, active: form.active } });
    } else {
      if (!form.password) { setError("Password wajib diisi."); setSaving(false); return; }
      const email = form.email.trim().toLowerCase();
      try {
        await api.post<{ user: User }>("/auth/register", {
          name: form.name.trim(), email, password: form.password, roleId: form.roleId,
        });
      } catch (e) { setError(e instanceof Error ? e.message : "Gagal membuat akun."); setSaving(false); return; }
    }

    setSaving(false);
    setOpen(false);
  };

  useSaveShortcut(save, open && !saving);

  const toggleActive = (u: User, next: boolean) => {
    updateUser.mutate({ id: u.id, patch: { active: next } });
  };

  const isLoading = usersLoading || rolesLoading;
  if (isLoading) return <ShellLoader />;

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.users"]}>
      <PageHeader
        title="User &amp; Role"
        description="Kelola pengguna dan role-nya. Menu, aksi, serta akses cabang/gudang ditentukan oleh role di Role Management."
        actions={
          <Button variant="secondary" onClick={openCreate}>
            <Plus size={15} strokeWidth={2} /> Tambah User
          </Button>
        }
      />

      {sortedUsers.length === 0 ? (
        <EmptyState icon={<Users size={26} strokeWidth={2} />} title="Tidak ada user" description="Tambahkan user untuk memberi akses ke workspace." />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table storageKey="users" columns={["User", "Email", "Role", "Status", ""]}>
            {sortedUsers.map((u) => (
              <tr key={u.id} className="transition-colors hover:bg-zinc-50/60">
                <Td truncate>
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} hue={u.avatarHue} size="sm" />
                    <span className="truncate text-[13.5px] font-semibold text-zinc-900">{u.name}</span>
                  </div>
                </Td>
                <Td truncate className="text-[12.5px] text-zinc-500">{u.email}</Td>
                <Td>
                  <Badge tone={ROLE_TONES[u.role] ?? "neutral"} dot>{roleDisplay(u.role)}</Badge>
                </Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={u.active} onChange={(next) => toggleActive(u, next)} />
                    <Badge tone={u.active ? "emerald" : "neutral"} dot>{u.active ? "Aktif" : "Nonaktif"}</Badge>
                  </div>
                </Td>
                <Td>
                  <button onClick={() => openEdit(u)} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                    <Pencil size={15} strokeWidth={2} />
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
        description="Pilih role untuk user — menu, aksi, dan akses cabang/gudang mengikuti role-nya."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
            <Button variant="secondary" onClick={save} disabled={saving}>{saving ? "Menyimpan..." : "Simpan"}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Nama lengkap" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="sm:col-span-2"><Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          {!editing && (
            <div className="sm:col-span-2"><Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          )}
          <Select label="Role" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            {(roles ?? []).filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          <div className="flex items-center gap-3">
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} />
            <span className="text-sm text-zinc-600">{form.active ? "Aktif" : "Nonaktif"}</span>
          </div>
        </div>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">{error}</p>}
      </Modal>
    </RoleGuard>
  );
}
