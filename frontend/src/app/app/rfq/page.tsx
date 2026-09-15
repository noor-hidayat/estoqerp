import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText } from "lucide-react";
import { useRfqs, useAllWarehouses } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { Rfq } from "@/types";
import { formatId } from "@/lib/utils";

export default function RfqListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const { data: rfqs = [], isLoading } = useRfqs();
  const { data: warehouses = [] } = useAllWarehouses();
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "";

  const filtered = useMemo(
    () =>
      (rfqs as Rfq[]).filter(
        (o) =>
          (statusFilter === "all" || o.status === statusFilter) &&
          (warehouseFilter === "all" || o.warehouseId === warehouseFilter)
      ),
    [rfqs, statusFilter, warehouseFilter]
  );

  const columns: DataTableColumn<Rfq>[] = [
    {
      id: "documentNo",
      header: "RFQ No",
      cell: (o) => <span className="text-xs font-semibold">{o.documentNo ?? formatId(o.id)}</span>,
      sortValue: (o) => String(o.documentNo ?? o.id),
    },
    {
      id: "purchaseRequest",
      header: "PR Ref",
      cell: (o) => <span className="text-xs text-muted-foreground">{o.purchaseRequestNo ?? o.purchaseRequestId ?? ""}</span>,
      sortValue: (o) => String(o.purchaseRequestNo ?? ""),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (o) => <span className="text-muted-foreground">{warehouseName(o.warehouseId)}</span>,
      sortValue: (o) => warehouseName(o.warehouseId),
    },
    {
      id: "requestDate",
      header: "Request Date",
      cell: (o) => <span className="text-muted-foreground">{o.requestDate?.slice(0, 10)}</span>,
      sortValue: (o) => o.requestDate,
    },
    {
      id: "deadline",
      header: "Deadline",
      cell: (o) => <span className="text-muted-foreground">{o.quotationDeadline?.slice(0, 10) ?? ""}</span>,
      sortValue: (o) => o.quotationDeadline ?? "",
    },
    {
      id: "suppliers",
      header: "Suppliers",
      cell: (o) => <span className="text-xs">{o.suppliersCount ?? 0}</span>,
      sortValue: (o) => String(o.suppliersCount ?? 0),
    },
    {
      id: "quotations",
      header: "Quotations",
      cell: (o) => <span className="text-xs">{o.quotationsCount ?? 0}</span>,
      sortValue: (o) => String(o.quotationsCount ?? 0),
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
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate(`/app/rfq/${o.id}`)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <PageHeader
        title="Request for Quotation"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/rfq/new")}>
            <Plus size={14} strokeWidth={2} />
            New RFQ
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={filtered as Rfq[]}
        getRowId={(o) => o.id}
        loading={isLoading}
        onRowClick={(o) => navigate(`/app/rfq/${o.id}`)}
        searchPlaceholder="Search RFQ..."
        getSearchText={(o) => `${o.documentNo ?? formatId(o.id)} ${warehouseName(o.warehouseId)} ${o.purchaseRequestNo ?? ""}`}
        filters={
          <div className="flex gap-2">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-40 text-xs">
              <option value="all">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="QUOTED">Quoted</option>
              <option value="AWARDED">Awarded</option>
              <option value="CLOSED">Closed</option>
              <option value="CANCELED">Canceled</option>
            </Select>
            <Select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className="h-8 w-52 text-xs">
              <option value="all">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </div>
        }
        emptyIcon={<FileText size={26} strokeWidth={2} />}
        emptyTitle="No RFQ"
        emptyDescription="Create a new RFQ to start quotation process."
      />
    </RoleGuard>
  );
}
