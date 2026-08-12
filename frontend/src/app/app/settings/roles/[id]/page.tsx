"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useRoles } from "@/lib/api/query";
import { RoleForm } from "@/components/roles/role-form";
import { RoleGuard } from "@/components/ui/role-guard";
import { ShellLoader } from "@/components/ui/loader";

export default function EditRolePage() {
  const params = useParams<{ id: string }>();
  const { data: roles, isLoading } = useRoles();
  const role = (roles ?? []).find((r) => r.id === params.id);

  if (isLoading) return <ShellLoader />;

  if (!role) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
        <p className="py-20 text-center text-lg font-semibold text-zinc-800">Role tidak ditemukan</p>
        <div className="text-center">
          <Link href="/app/settings/roles" className="text-sm text-emerald-600 hover:text-emerald-700">Kembali ke Roles</Link>
        </div>
      </RoleGuard>
    );
  }

  return <RoleForm role={role} />;
}
