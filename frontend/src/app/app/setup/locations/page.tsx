import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {MapPin, Plus, Trash2, Pencil} from "lucide-react";
import { useLocations, useAllWarehouses, useBranches, useRemove } from "@/lib/api/query";
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
      cell: (l) => <span className="text-xs text-muted-foreground">{l.code}</span>,
    },
    {
      id: "name",
      header: "Name",
      sortValue: (l) => l.name,
      cell: (l) => (
        <button
          onClick={() => navigate(`/app/setup/locations/${l.id}`)}
          className="truncate text-left text-foreground transition-colors hover:text-primary"
          title="Edit location"
        >
          {l.name}
        </button>
      ),
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
      id: "created",
      header: "Created",
      sortValue: (l) => l.createdAt ?? "",
      cell: (l) => <span className="text-xs text-muted-foreground">{timeAgo(l.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (l) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/app/setup/locations/${l.id}`);
          }}
        >
          <Pencil size={12} strokeWidth={2} />
          Edit
        </Button>
      ),
      className: "w-[90px] text-right",
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
        minWidth={640}
        emptyIcon={<MapPin size={26} strokeWidth={2} />}
        emptyTitle="No locations yet"
        emptyDescription="Add rack/bin locations to mark areas during scan sessions."
      />
    </RoleGuard>
  );
}