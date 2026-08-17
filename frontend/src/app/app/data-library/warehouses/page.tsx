"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import { useAllWarehouses, useBranches, useLocations, useRemove } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShellLoader } from "@/components/ui/loader";
import type { Warehouse } from "@/types";

export default function WarehousesPage() {
  const navigate = useNavigate();
  const { data: warehouses = [], isLoading: warehousesLoading } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const { data: locations = [] } = useLocations();
  const removeWarehouse = useRemove("warehouses");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleRemove = async (w: Warehouse) => {
    if (!confirm(`Delete warehouse "${w.name}"?`)) return;
    try {
      await removeWarehouse.mutateAsync(w.id);
    } catch {
      alert("Cannot delete this warehouse because it is still used by locations or projects.");
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

  if (warehousesLoading) return <ShellLoader />;

  const columns: DataTableColumn<Warehouse>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (w) => w.code,
      cell: (w) => <span className="font-mono text-xs text-muted-foreground">{w.code}</span>,
    },
    {
      id: "name",
      header: "Warehouse Name",
      sortValue: (w) => w.name,
      cell: (w) => <span className="font-medium text-foreground">{w.name}</span>,
      className: "min-w-[200px]",
    },
    {
      id: "branch",
      header: "Branch",
      sortValue: (w) => branchOf(w.branchId)?.name ?? "",
      cell: (w) => <Badge tone="neutral">{branchOf(w.branchId)?.name ?? "—"}</Badge>,
    },
    {
      id: "locations",
      header: "Location Count",
      align: "right",
      cell: (w) => <span className="text-muted-foreground">{locations.filter((l) => l.warehouseId === w.id).length} locations</span>,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (w) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${w.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/data-library/warehouses/${w.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleRemove(w)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
      <PageHeader
        title="Warehouses"

        actions={
          <Button onClick={() => navigate("/app/data-library/warehouses/new")}>
            <Plus size={15} strokeWidth={2} />
            Add Warehouse
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={warehouses}
        getRowId={(w) => w.id}
        searchPlaceholder="Search warehouses..."
        getSearchText={(w) => `${w.code} ${w.name}`}
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
        minWidth={640}
        emptyIcon={<WarehouseIcon size={26} strokeWidth={2} />}
        emptyTitle="No warehouses yet"
        emptyDescription="Add a warehouse and connect it to the appropriate branch."
      />
    </RoleGuard>
  );
}