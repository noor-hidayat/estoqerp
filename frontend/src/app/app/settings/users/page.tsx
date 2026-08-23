"use client";

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Users } from "lucide-react";
import {
  useUsers,
  useRoles,
  useUpdate,
} from "@/lib/api/query";
import type { User } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import { Avatar } from "@/components/ui/avatar";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/session";

const ROLE_TONES: Record<string, "emerald" | "violet" | "blue"> = {
  role_sys_admin: "violet",
  role_admin: "blue",
  role_staff: "emerald",
};

export default function UsersPage() {
  const navigate = useNavigate();
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

  const toggleActive = (u: User, next: boolean) => {
    updateUser.mutate({ id: u.id, patch: { active: next } });
  };

  const isLoading = usersLoading || rolesLoading;
  if (isLoading) return <ShellLoader />;

  const columns: DataTableColumn<User>[] = [
    {
      id: "name",
      header: "User",
      sortValue: (u) => u.name,
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} hue={u.avatarHue} size="sm" />
          <span className="truncate font-medium text-foreground">{u.name}</span>
        </div>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "email",
      header: "Email",
      sortValue: (u) => u.email,
      cell: (u) => <span className="text-muted-foreground">{u.email}</span>,
      className: "min-w-[200px]",
    },
    {
      id: "role",
      header: "Role",
      sortValue: (u) => roleDisplay(u.role),
      cell: (u) => (
        <Badge tone={ROLE_TONES[u.role] ?? "neutral"} dot>
          {roleDisplay(u.role)}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (u) => (
        <div className="flex items-center gap-2.5">
          <Toggle checked={u.active} onChange={(next) => toggleActive(u, next)} />
          <Badge tone={u.active ? "emerald" : "neutral"} dot>
            {u.active ? "Active" : "Inactive"}
          </Badge>
        </div>
      ),
    },
    {
      id: "created",
      header: "Created",
      sortValue: (u) => u.createdAt ?? "",
      cell: (u) => <span className="text-xs text-muted-foreground">{timeAgo(u.createdAt)}</span>,
    },
  ];

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.users"]}>
      <PageHeader
        title="User &amp; Role"

        actions={
          <Button onClick={() => navigate("/app/settings/users/new")}>
            <Plus size={15} strokeWidth={2} /> Add User
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={sortedUsers}
        getRowId={(u) => u.id}
        selectable
        searchPlaceholder="Search users..."
        getSearchText={(u) => `${u.name} ${u.email}`}
        minWidth={720}
        emptyIcon={<Users size={26} strokeWidth={2} />}
        emptyTitle="No users"
        emptyDescription="Add a user to give access to the workspace."
      />
    </RoleGuard>
  );
}