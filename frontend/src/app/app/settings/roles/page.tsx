"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Pencil, Plus, SquareAsterisk } from "lucide-react";
import {
  useRoles,
  useRolePermissions,
  useBranchAccesses,
  useUpdate,
  useRemove,
} from "@/lib/api/query";
import { ShellLoader } from "@/components/ui/loader";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { EmptyState } from "@/components/ui/empty-state";

export default function RolesPage() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: rolePermissions, isLoading: permsLoading } = useRolePermissions();
  const { data: branchAccesses, isLoading: accessesLoading } = useBranchAccesses();
  const updateRole = useUpdate("roles");
  const removeRole = useRemove("roles");
  const removePerm = useRemove("rolePermissions");
  const removeAccess = useRemove("branchAccesses");

  const sorted = useMemo(() => (roles ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [roles]);

  const handleDelete = async (r: typeof sorted[0]) => {
    if (!confirm(`Hapus role "${r.name}"?`)) return;
    if (rolePermissions) {
      for (const p of rolePermissions.filter((x) => x.roleId === r.id)) {
        await removePerm.mutateAsync(p.id);
      }
    }
    if (branchAccesses) {
      for (const a of branchAccesses.filter((x) => x.roleId === r.id)) {
        await removeAccess.mutateAsync(a.id);
      }
    }
    await removeRole.mutateAsync(r.id);
  };

  if (rolesLoading || permsLoading || accessesLoading) return <ShellLoader />;

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
      <PageHeader
        title="Role &amp; Permission"
        description="Kelola role dan permission. Role sistem tidak bisa dihapus."
        actions={
          <Link href="/app/settings/roles/new">
            <Button variant="secondary"><Plus size={15} strokeWidth={2} /> Tambah Role</Button>
          </Link>
        }
      />

      {sorted.length === 0 ? (
        <EmptyState icon={<SquareAsterisk size={26} strokeWidth={2} />} title="Tidak ada role" description="Tambahkan role untuk permission akses." />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table storageKey="roles" columns={["Role", "Sistem", "Permission", "Akses entitas", "Status", "", ""]}>
            {sorted.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-zinc-50/60">
                <Td truncate className="text-[13.5px] font-semibold text-zinc-900">{r.name}</Td>
                <Td><Badge tone={r.isSystem ? "violet" : "neutral"} dot>{r.isSystem ? "Sistem" : "Custom"}</Badge></Td>
                <Td><span className="text-[11.5px] text-zinc-400">{(rolePermissions ?? []).filter((p) => p.roleId === r.id).length} actions</span></Td>
                <Td><span className="text-[11.5px] text-zinc-400">{(branchAccesses ?? []).filter((a) => a.roleId === r.id).length} entitas</span></Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Toggle checked={r.active} onChange={(next) => updateRole.mutate({ id: r.id, patch: { active: next } })} />
                    <Badge tone={r.active ? "emerald" : "neutral"} dot>{r.active ? "Aktif" : "Nonaktif"}</Badge>
                  </div>
                </Td>
                <Td>
                  <Link href={`/app/settings/roles/${r.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                    <Pencil size={15} strokeWidth={2} />
                  </Link>
                </Td>
                <Td>
                  {!r.isSystem && (
                    <button
                      onClick={() => handleDelete(r)}
                      className="text-[11px] text-red-500 hover:text-red-700"
                    >Hapus</button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </RoleGuard>
  );
}
