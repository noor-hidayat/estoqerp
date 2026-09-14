import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Building, Trash2, MoreVertical, Pencil, Trash, Power } from "lucide-react";
import { useDepartments, useRemove, useUpdate } from "@/lib/api/query";
import type { Department } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function DepartmentsPage() {
  const navigate = useNavigate();
  const { data: departmentsRaw = [], isLoading } = useDepartments();
  const removeDepartment = useRemove("departments");
  const updateDepartment = useUpdate("departments");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleToggleActive = async (d: Department) => {
    const next = (d as any).isActive === false;
    if (!confirm(next ? `Activate department "${d.name}"?` : `Deactivate department "${d.name}"?`)) return;
    try {
      await updateDepartment.mutateAsync({ id: d.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

  const departments = useMemo(
    () => [...departmentsRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [departmentsRaw]
  );

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected department${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeDepartment.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (isLoading) return <ShellLoader />;

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus departemen ini?")) return;
    try {
      await removeDepartment.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete department.");
    }
  };

  const columns: DataTableColumn<Department>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (d) => d.code,
      cell: (d) => (
        <span className="inline-flex items-center font-mono text-xs font-medium whitespace-nowrap" title={d.code}>
          {d.code}
        </span>
      ),
      className: "w-[140px] pr-8 whitespace-nowrap",
    },
    {
      id: "name",
      header: "Department Name",
      sortValue: (d) => d.name,
      cell: (d) => (
        <span className="inline-flex items-center font-medium whitespace-nowrap truncate" title={d.name}>
          {d.name}
        </span>
      ),
      className: "min-w-[360px] pr-8 whitespace-nowrap",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (d) => (d.isActive === false ? 0 : 1),
      cell: (d) => (
        <Badge tone={d.isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {d.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (d) => d.createdAt ?? "",
      cell: (d) => <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(d.createdAt)}</span>,
      className: "w-[170px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (d) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/departments/${d.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(d); }} className="gap-2">
              <Power size={14} /> {(d as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(d.id); }} className="gap-2 text-destructive focus:text-destructive">
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
    <RoleGuard roles={MANAGER_ROLES} menus={["master.departments"]}>
      <PageHeader
        title="Departments"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/departments/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Department
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={departments}
        getRowId={(d) => d.id}
        onRowClick={(d) => navigate(`/app/setup/departments/${d.id}`)}
        searchPlaceholder="Search departments..."
        getSearchText={(d) => `${d.code} ${d.name}`}
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
        minWidth={790}
        emptyIcon={<Building size={26} strokeWidth={2} />}
        emptyTitle="No departments yet"
        emptyDescription="Add a department to use on purchase requests."
      />
    </RoleGuard>
  );
}
