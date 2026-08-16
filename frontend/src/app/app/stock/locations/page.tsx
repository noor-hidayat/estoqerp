"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useLocations, useAllWarehouses, useBranches, useRemove } from "@/lib/api/query";
import type { Location } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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

export default function LocationsPage() {
  const navigate = useNavigate();
  const { data: allLocations = [], isLoading: locationsLoading } = useLocations();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const removeLocation = useRemove("locations");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const locations = useMemo(() => {
    return allLocations
      .filter((l) => warehouseFilter === "all" || l.warehouseId === warehouseFilter)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [allLocations, warehouseFilter]);

  const warehouseOf = (id: string) => warehouses.find((w) => w.id === id);
  const branchOf = (branchId: string) => branches.find((b) => b.id === branchId);

  const handleRemove = async (loc: Location) => {
    if (!confirm(`Delete location "${loc.code}"?`)) return;
    try {
      await removeLocation.mutateAsync(loc.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected location${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeLocation.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (locationsLoading) return <ShellLoader />;

  const columns: DataTableColumn<Location>[] = [
    {
      id: "code",
      header: "Location Code",
      sortValue: (l) => l.code,
      cell: (l) => <span className="font-mono text-xs text-muted-foreground">{l.code}</span>,
    },
    {
      id: "name",
      header: "Name",
      sortValue: (l) => l.name,
      cell: (l) => <span className="text-foreground">{l.name}</span>,
      className: "min-w-[180px]",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (l) => warehouseOf(l.warehouseId)?.name ?? "",
      cell: (l) => <Badge tone="neutral">{warehouseOf(l.warehouseId)?.name ?? "—"}</Badge>,
    },
    {
      id: "branch",
      header: "Branch",
      cell: (l) => (
        <span className="text-muted-foreground">
          {branchOf(warehouseOf(l.warehouseId)?.branchId ?? "")?.name ?? "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (l) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${l.code}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/stock/locations/${l.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleRemove(l)}
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
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
<PageHeader
        title="Locations"

        actions={
          <Button onClick={() => navigate("/app/stock/locations/new")}>
            <Plus size={15} strokeWidth={2} />
            Add Location
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={locations}
        getRowId={(l) => l.id}
        searchPlaceholder="Search locations..."
        getSearchText={(l) => `${l.code} ${l.name}`}
        filters={
          <Select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="h-8 w-56 text-xs"
          >
            <option value="all">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
        }
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
        emptyIcon={<MapPin size={26} strokeWidth={2} />}
        emptyTitle="No locations yet"
        emptyDescription="Add rack/bin locations to mark areas during scan sessions."
      />
    </RoleGuard>
  );
}