import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ShoppingCart } from "lucide-react";
import { useMaterialRequests, useAllWarehouses, useBranches } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { MaterialRequest } from "@/types";
import { formatId } from "@/lib/utils";

export default function MaterialRequestsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const { data: requests = [], isLoading } = useMaterialRequests();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();

  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";
  const branchName = (id: string | null | undefined) => (id ? (branches.find((b) => b.id === id)?.name ?? "—") : "—");

  const filtered = useMemo(
    () =>
      requests.filter(
        (o) =>
          (statusFilter === "all" || o.status === statusFilter) &&
          (warehouseFilter === "all" || o.warehouseId === warehouseFilter)
      ),
    [requests, statusFilter, warehouseFilter]
  );

  const columns: DataTableColumn<MaterialRequest>[] = [
    {
      id: "mrNo",
      header: "MR No",
      cell: (o) => <span className="text-xs font-semibold">{o.documentNo ?? (o as any).mrNo ?? formatId(o.id)}</span>,
      sortValue: (o) => String(o.documentNo ?? (o as any).mrNo ?? o.id),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (o) => <span className="text-muted-foreground">{warehouseName(o.warehouseId)}</span>,
      sortValue: (o) => warehouseName(o.warehouseId),
    },    {
      id: "requestDate",
      header: "Request Date",
      cell: (o) => <span className="text-muted-foreground">{o.requestDate?.slice(0, 10)}</span>,
      sortValue: (o) => o.requestDate,
    },    {
      id: "department",
      header: "From Department",
      cell: (o) => <span className="text-xs text-muted-foreground">{(o as any).department ?? "—"}</span>,
      sortValue: (o) => String((o as any).department ?? ""),
    },
    {
      id: "branch",
      header: "To Department",
      cell: (o) => <span className="text-xs text-muted-foreground">{branchName((o as any).branchId)}</span>,
      sortValue: (o) => branchName((o as any).branchId),
    },
    {
      id: "status",
      header: "Status",
      cell: (o) => <DocStatusBadge status={o.status} />,
      sortValue: (o) => o.status,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (o) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => navigate(`/app/material-requests/${o.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.materialRequests"]}>
      <PageHeader
        title="Material Requests"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/material-requests/new")}>
            <Plus size={14} strokeWidth={2} />
            New Material Request
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(o) => o.id}
        loading={isLoading}
        onRowClick={(o) => navigate(`/app/material-requests/${o.id}`)}
        searchPlaceholder="Search purchase requests..."
        getSearchText={(o) =>
          `${o.documentNo ?? (o as any).mrNo ?? formatId(o.id)} ${warehouseName(o.warehouseId)} ${(o as any).department ?? ""} ${branchName((o as any).branchId)}`
        }
        filters={
          <div className="flex gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 w-40 text-xs"
            >
              <option value="all">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="POSTED">Posted</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELED">Canceled</option>
            </Select>
            <Select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="h-8 w-52 text-xs"
            >
              <option value="all">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        }
        emptyIcon={<ShoppingCart size={26} strokeWidth={2} />}
        emptyTitle="No purchase requests"
        emptyDescription="Create a new purchase request to get started."
      />
    </RoleGuard>
  );
}
