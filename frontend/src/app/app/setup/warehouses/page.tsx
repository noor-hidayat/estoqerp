import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {Plus, Trash2, Warehouse as WarehouseIcon, MoreVertical, Pencil, Trash, Power} from "lucide-react";
import { useAllWarehouses, useBranches, useRemove, useUpdate } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";
import type { Warehouse } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function WarehousesPage() {
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const removeWarehouse = useRemove("warehouses");
  const updateWarehouse = useUpdate("warehouses");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus warehouse ini?")) return;
    try {
      await removeWarehouse.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete warehouse because it is still used.");
    }
  };

  const handleToggleActive = async (w: Warehouse) => {
    const next = (w as any).isActive === false;
    if (!confirm(next ? `Activate warehouse "${w.name}"?` : `Deactivate warehouse "${w.name}"?`)) return;
    try {
      await updateWarehouse.mutateAsync({ id: w.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected warehouse${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeWarehouse.mutateAsync(id)));
      setSelected(new Set());
    } catch {
      alert("Cannot delete some warehouses because they are still used by locations or projects.");
    }
  };

  const branchOf = (id: string) => branches.find((b) => b.id === id);
  const parentIds = new Set(warehouses.filter((w) => w.parentId).map((w) => w.parentId as string));
  const isParentWarehouse = (w: Warehouse) => parentIds.has(w.id);

  if (warehousesLoading) return <ShellLoader />;

  const columns: DataTableColumn<Warehouse>[] = [
    {
      id: "name",
      header: "Warehouse Name",
      sortValue: (w) => w.name,
      cell: (w) => (
        <span
          className="inline-flex items-center gap-1.5 font-medium whitespace-nowrap"
          title={w.name}
        >
          {w.parentId ? <span className="text-muted-foreground shrink-0">↳</span> : null}
          <span className="truncate whitespace-nowrap">{w.name}</span>
        </span>
      ),
      className: "min-w-[360px] max-w-[360px] pr-10 whitespace-nowrap",
    },
    {
      id: "branch",
      header: "Branch",
      sortValue: (w) => branchOf(w.branchId)?.name ?? "",
      cell: (w) => <Badge tone="neutral" className="rounded-md">{branchOf(w.branchId)?.name ?? ""}</Badge>,
      className: "w-[200px] pr-10",
    },
    {
      id: "parent",
      header: "Parent",
      sortValue: (w) => (isParentWarehouse(w) ? 1 : 0),
      cell: (w) => <Checkbox checked={isParentWarehouse(w)} disabled aria-label="Parent" />,
      className: "w-[120px] pr-10",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (w) => (w.isActive === false ? 0 : 1),
      cell: (w) => (
        <Badge tone={w.isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {w.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-10",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (w) => w.createdAt ?? "",
      cell: (w) => <span className="text-xs text-muted-foreground">{timeAgo(w.createdAt)}</span>,
      className: "w-[170px] pr-10",
    },
    {
      id: "actions",
      header: "Action",
      cell: (w) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/app/setup/warehouses/${w.id}`);
              }}
              className="gap-2"
            >
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleToggleActive(w);
              }}
              className="gap-2"
            >
              <Power size={14} /> {(w as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteOne(w.id);
              }}
              className="gap-2 text-destructive focus:text-destructive"
            >
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
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
      <PageHeader
        title="Warehouses"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/warehouses/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Warehouse
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={warehouses}
        getRowId={(w) => w.id}
        onRowClick={(w) => navigate(`/app/setup/warehouses/${w.id}`)}
        searchPlaceholder="Search warehouses..."
        getSearchText={(w) => `${w.code} ${w.name} ${w.picName ?? ""} ${w.picPhone ?? ""}`}
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
        minWidth={1030}
        emptyIcon={<WarehouseIcon size={26} strokeWidth={2} />}
        emptyTitle="No warehouses yet"
        emptyDescription="Add a warehouse and connect it to the appropriate branch."
      />
    </RoleGuard>
  );
}