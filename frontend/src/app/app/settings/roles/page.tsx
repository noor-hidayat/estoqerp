"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, SquareAsterisk, Trash2 } from "lucide-react";
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
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/types";

export default function RolesPage() {
  const navigate = useNavigate();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: rolePermissions, isLoading: permsLoading } = useRolePermissions();
  const { data: branchAccesses, isLoading: accessesLoading } = useBranchAccesses();
  const updateRole = useUpdate("roles");
  const removeRole = useRemove("roles");
  const removePerm = useRemove("rolePermissions");
  const removeAccess = useRemove("branchAccesses");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => (roles ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [roles]);

  const handleDelete = async (r: Role) => {
    if (!confirm(`Delete role "${r.name}"?`)) return;
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

  const handleBulkDelete = async () => {
    const deletableIds = new Set(sorted.filter((r) => !r.isSystem).map((r) => r.id));
    const ids = [...selected].filter((id) => deletableIds.has(id));
    const skipped = selected.size - ids.length;
    if (ids.length === 0) {
      alert("System roles cannot be deleted.");
      return;
    }
    if (
      !confirm(
        `Delete ${ids.length} selected role${ids.length > 1 ? "s" : ""}?` +
          (skipped > 0 ? ` ${skipped} system role${skipped > 1 ? "s" : ""} will be skipped.` : "")
      )
    )
      return;
    try {
      for (const id of ids) {
        if (rolePermissions) {
          for (const p of rolePermissions.filter((x) => x.roleId === id)) {
            await removePerm.mutateAsync(p.id);
          }
        }
        if (branchAccesses) {
          for (const a of branchAccesses.filter((x) => x.roleId === id)) {
            await removeAccess.mutateAsync(a.id);
          }
        }
        await removeRole.mutateAsync(id);
      }
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete roles");
    }
  };

  if (rolesLoading || permsLoading || accessesLoading) return <ShellLoader />;

  const columns: DataTableColumn<Role>[] = [
    {
      id: "name",
      header: "Role",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium text-foreground">{r.name}</span>,
      className: "min-w-[160px]",
    },
    {
      id: "system",
      header: "System",
      sortValue: (r) => (r.isSystem ? 1 : 0),
      cell: (r) => (
        <Badge tone={r.isSystem ? "violet" : "neutral"} dot>
          {r.isSystem ? "System" : "Custom"}
        </Badge>
      ),
    },
    {
      id: "perms",
      header: "Permission",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {(rolePermissions ?? []).filter((p) => p.roleId === r.id).length} actions
        </span>
      ),
    },
    {
      id: "access",
      header: "Entity access",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {(branchAccesses ?? []).filter((a) => a.roleId === r.id).length} entities
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <Toggle checked={r.active} onChange={(next) => updateRole.mutate({ id: r.id, patch: { active: next } })} />
          <Badge tone={r.active ? "emerald" : "neutral"} dot>{r.active ? "Active" : "Inactive"}</Badge>
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${r.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/settings/roles/${r.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            {!r.isSystem && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDelete(r)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
      <PageHeader
        title="Roles"

        actions={
          <Button onClick={() => navigate("/app/settings/roles/new")}>
            <Plus size={15} strokeWidth={2} /> Add Role
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={sorted}
        getRowId={(r) => r.id}
        searchPlaceholder="Search roles..."
        getSearchText={(r) => r.name}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        toolbarRight={
          selected.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selected.size})
            </Button>
          ) : null
        }
        minWidth={680}
        emptyIcon={<SquareAsterisk size={26} strokeWidth={2} />}
        emptyTitle="No roles"
        emptyDescription="Add a role for access permissions."
      />
    </RoleGuard>
  );
}