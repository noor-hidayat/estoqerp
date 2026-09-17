import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ShoppingCart } from "lucide-react";
import { usePurchaseRequests, useAllWarehouses, useBranches, useDepartments } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { PurchaseRequest } from "@/types";
import { formatId, timeAgo } from "@/lib/utils";

export default function PurchaseRequestsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const { data: requests = [], isLoading } = usePurchaseRequests();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const { data: departments = [] } = useDepartments();

  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "";
  const branchName = (id: string | null | undefined) => (id ? (branches.find((b) => b.id === id)?.name ?? "") : "");

  const filtered = useMemo(
    () =>
      requests.filter(
        (o) =>
          (statusFilter === "all" || o.status === statusFilter) &&
          (warehouseFilter === "all" || o.warehouseId === warehouseFilter)
      ),
    [requests, statusFilter, warehouseFilter]
  );

  const columns: DataTableColumn<PurchaseRequest>[] = [
    {
      id: "prNo",
      header: "PR No",
      cell: (o) => <span className="text-xs font-semibold">{o.documentNo ?? (o as any).prNo ?? formatId(o.id)}</span>,
      sortValue: (o) => String(o.documentNo ?? (o as any).prNo ?? o.id),
    },
    {
      id: "requestDate",
      header: "Request Date",
      cell: (o) => <span className="whitespace-nowrap text-xs text-muted-foreground">{o.requestDate?.slice(0, 10) ?? ""}</span>,
      sortValue: (o) => o.requestDate ?? "",
    },
    {
      id: "department",
      header: "Request By",
      cell: (o) => {
        const name = (o as any).department ?? "";
        const dept = (departments as any[]).find((d) => d.name === name);
        const label = dept ? (dept.code ? `${dept.code} - ${dept.name}` : dept.name) : name;
        return <span className="text-xs text-muted-foreground">{label || "-"}</span>;
      },
      sortValue: (o) => String((o as any).department ?? ""),
    },
    {
      id: "branch",
      header: "Branch",
      cell: (o) => {
        const name = branchName((o as any).branchId);
        return <span className="text-xs text-muted-foreground">{name || "-"}</span>;
      },
      sortValue: (o) => branchName((o as any).branchId),
    },
    {
      id: "urgency",
      header: "Urgency",
      cell: (o) => {
        const u = String((o as any).urgency ?? "MEDIUM").toUpperCase();
        const tone =
          u === "HIGH" ? "text-red-600" : u === "LOW" ? "text-muted-foreground" : "text-amber-600";
        return <span className={`text-xs font-medium ${tone}`}>{u}</span>;
      },
      sortValue: (o) => String((o as any).urgency ?? "MEDIUM"),
    },
    {
      id: "status",
      header: "Status",
      cell: (o) => <DocStatusBadge status={o.status} />,
      sortValue: (o) => o.status,
    },
    {
      id: "created",
      header: "Created",
      cell: (o) => <span className="whitespace-nowrap text-xs text-muted-foreground">{(o as any).createdAt ? timeAgo((o as any).createdAt) : ""}</span>,
      sortValue: (o) => (o as any).createdAt ?? "",
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseRequests"]}>
      <PageHeader
        title="Purchase Requests"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/purchase-requests/new")}>
            <Plus size={14} strokeWidth={2} />
            New Purchase Request
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(o) => o.id}
        loading={isLoading}
        onRowClick={(o) => navigate(`/app/purchase-requests/${o.id}`)}
        searchPlaceholder="Search purchase requests..."
        getSearchText={(o) =>
          `${o.documentNo ?? (o as any).prNo ?? formatId(o.id)} ${o.requestDate ?? ""} ${(o as any).department ?? ""} ${branchName((o as any).branchId)} ${String((o as any).urgency ?? "")} ${o.status} ${warehouseName(o.warehouseId)}`
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
