import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {MapPin, Plus, Trash2, MoreVertical, Pencil, Trash, Power} from "lucide-react";
import { useLocations, useAllWarehouses, useBranches, useRemove, useUpdate } from "@/lib/api/query";
import type { Location } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
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

export default function LocationsPage() {
  const navigate = useNavigate();
  const { data: allLocations = [], isLoading: locationsLoading } = useLocations();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const removeLocation = useRemove("locations");
  const updateLocation = useUpdate("locations");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus location ini?")) return;
    try {
      await removeLocation.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete location.");
    }
  };

  const handleToggleActive = async (l: Location) => {
    const next = (l as any).isActive === false;
    if (!confirm(next ? `Activate location "${l.name}"?` : `Deactivate location "${l.name}"?`)) return;
    try {
      await updateLocation.mutateAsync({ id: l.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const locations = useMemo(() => {
    return allLocations
      .filter((l) => warehouseFilter === "all" || l.warehouseId === warehouseFilter)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [allLocations, warehouseFilter]);

  const warehouseOf = (id: string) => warehouses.find((w) => w.id === id);
  const branchOf = (branchId: string) => branches.find((b) => b.id === branchId);

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
      id: "name",
      header: "Location",
      sortValue: (l) => `${l.name} : ${warehouseOf(l.warehouseId)?.name ?? ""}`,
      cell: (l) => {
        const whName = warehouseOf(l.warehouseId)?.name ?? "—";
        return (
          <span className="inline-flex items-center gap-1.5 font-medium truncate whitespace-nowrap" title={`${l.name} : ${whName}`}>
            <span className="truncate">{l.name}</span>
            <span className="text-muted-foreground font-normal">:</span>
            <span className="truncate text-muted-foreground font-normal">{whName}</span>
          </span>
        );
      },
      className: "min-w-[320px] pr-6 whitespace-nowrap",
    },
    {
      id: "branch",
      header: "Branch",
      sortValue: (l) => branchOf(warehouseOf(l.warehouseId)?.branchId ?? "")?.name ?? "",
      cell: (l) => <Badge tone="neutral" className="rounded-md">{branchOf(warehouseOf(l.warehouseId)?.branchId ?? "")?.name ?? "—"}</Badge>,
      className: "w-[180px] pr-6",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (l) => (l.isActive === false ? 0 : 1),
      cell: (l) => (
        <Badge tone={l.isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {l.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-6",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (l) => l.createdAt ?? "",
      cell: (l) => <span className="text-xs text-muted-foreground">{timeAgo(l.createdAt)}</span>,
      className: "w-[160px] pr-6",
    },
    {
      id: "actions",
      header: "Action",
      cell: (l) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/locations/${l.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(l); }} className="gap-2">
              <Power size={14} /> {(l as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(l.id); }} className="gap-2 text-destructive focus:text-destructive">
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
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.locations"]}>
<PageHeader
        title="Locations"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/locations/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Location
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={locations}
        getRowId={(l) => l.id}
        onRowClick={(l) => navigate(`/app/setup/locations/${l.id}`)}
        searchPlaceholder="Search locations..."
        getSearchText={(l) => `${l.code} ${l.name} ${warehouseOf(l.warehouseId)?.name ?? ""} ${branchOf(warehouseOf(l.warehouseId)?.branchId ?? "")?.name ?? ""}`}
        filters={
          <Select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="h-8 w-56 text-xs"
          >
            <option value="all">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
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
        minWidth={870}
        emptyIcon={<MapPin size={26} strokeWidth={2} />}
        emptyTitle="No locations yet"
        emptyDescription="Add rack/bin locations to mark areas during scan sessions."
      />
    </RoleGuard>
  );
}