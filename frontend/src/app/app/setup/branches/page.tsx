import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {Building2, Plus, Trash2, MoreVertical, Pencil, Trash, Power} from "lucide-react";
import { useBranches, useRemove, useUpdate } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";
import type { Branch } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function BranchesPage() {
  const navigate = useNavigate();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const removeBranch = useRemove("branches");
  const updateBranch = useUpdate("branches");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus branch ini?")) return;
    try {
      await removeBranch.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete branch.");
    }
  };

  const handleToggleActive = async (b: Branch) => {
    const next = (b as any).isActive === false;
    if (!confirm(next ? `Activate branch "${b.name}"?` : `Deactivate branch "${b.name}"?`)) return;
    try {
      await updateBranch.mutateAsync({ id: b.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected branch${n > 1 ? "es" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeBranch.mutateAsync(id)));
      setSelected(new Set());
    } catch {
      alert("Cannot delete some branches because they are still used by warehouses or projects.");
    }
  };

  if (branchesLoading) return <ShellLoader />;

  const columns: DataTableColumn<Branch>[] = [
    {
      id: "name",
      header: "Branch Name",
      sortValue: (b) => b.name,
      cell: (b) => (
        <span className="inline-flex items-center font-medium whitespace-nowrap truncate" title={b.name}>
          {b.name}
        </span>
      ),
      className: "min-w-[320px] pr-8 whitespace-nowrap",
    },
    {
      id: "city",
      header: "City",
      sortValue: (b) => b.city,
      cell: (b) => <Badge tone="neutral" className="rounded-md">{b.city}</Badge>,
      className: "w-[180px] pr-8",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (b) => (b.isActive === false ? 0 : 1),
      cell: (b) => (
        <Badge tone={b.isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {b.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (b) => b.createdAt ?? "",
      cell: (b) => <span className="text-xs text-muted-foreground">{timeAgo(b.createdAt)}</span>,
      className: "w-[170px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (b) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/branches/${b.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(b); }} className="gap-2">
              <Power size={14} /> {(b as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(b.id); }} className="gap-2 text-destructive focus:text-destructive">
              <Trash size={14} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: "w-[70px] text-center",
      align: "center",
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <PageHeader
        title="Branches"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/branches/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Branch
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={branches}
        getRowId={(b) => b.id}
        onRowClick={(b) => navigate(`/app/setup/branches/${b.id}`)}
        searchPlaceholder="Search branches..."
        getSearchText={(b) => `${b.code} ${b.name} ${b.city}`}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        toolbarRight={
          selected.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleBulkRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selected.size})
            </Button>
          ) : null
        }
        minWidth={890}
        emptyIcon={<Building2 size={26} strokeWidth={2} />}
        emptyTitle="No branches yet"
        emptyDescription="Add your first branch for the organization structure."
      />
    </RoleGuard>
  );
}