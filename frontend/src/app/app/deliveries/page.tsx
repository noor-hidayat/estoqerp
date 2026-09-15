import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Truck } from "lucide-react";
import { useDeliveries, useCustomers, useAllWarehouses, useSalesOrders } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { Delivery } from "@/types";
import { formatId } from "@/lib/utils";

export default function DeliveriesPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const { data: deliveries = [], isLoading } = useDeliveries();
  const { data: customers = [] } = useCustomers();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: salesOrders = [] } = useSalesOrders();

  const customerName = (id?: string | null) => (id ? customers.find((c) => c.id === id)?.name ?? "" : "");
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "";
  const soNo = (id?: string | null) => (id ? salesOrders.find((s) => s.id === id)?.soNo ?? formatId(id) : "");

  const filtered = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          (statusFilter === "all" || d.status === statusFilter) &&
          (warehouseFilter === "all" || d.warehouseId === warehouseFilter)
      ),
    [deliveries, statusFilter, warehouseFilter]
  );

  const columns: DataTableColumn<Delivery>[] = [
    {
      id: "deliveryNo",
      header: "Delivery No",
      cell: (d) => <span className="text-xs font-semibold">{(d as any).documentNo ?? d.deliveryNo ?? formatId(d.id)}</span>,
      sortValue: (d) => String((d as any).documentNo ?? d.deliveryNo),
    },
    {
      id: "salesOrder",
      header: "Sales Order",
      cell: (d) => <span className="font-medium text-foreground">{d.salesOrderId ? `SO ${soNo(d.salesOrderId)}` : ""}</span>,
      sortValue: (d) => String(d.salesOrderId ?? ""),
    },
    {
      id: "customer",
      header: "Customer",
      cell: (d) => <span className="text-muted-foreground">{customerName(d.customerId)}</span>,
      sortValue: (d) => customerName(d.customerId),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (d) => <span className="text-muted-foreground">{warehouseName(d.warehouseId)}</span>,
      sortValue: (d) => warehouseName(d.warehouseId),
    },
    {
      id: "deliveryDate",
      header: "Delivery Date",
      cell: (d) => <span className="text-muted-foreground">{d.deliveryDate?.slice(0, 10)}</span>,
      sortValue: (d) => d.deliveryDate,
    },
    {
      id: "status",
      header: "Status",
      cell: (d) => <DocStatusBadge status={d.status} />,
      sortValue: (d) => d.status,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (d) => (
        <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate(`/app/deliveries/${(d as any).documentNo ?? d.id}`)}>
          View
        </Button>
      ),
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.deliveries"]}>
      <PageHeader
        title="Deliveries"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/deliveries/new")}>
            <Plus size={14} strokeWidth={2} />
            New Delivery
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(d) => d.id}
        loading={isLoading}
        onRowClick={(d) => navigate(`/app/deliveries/${(d as any).documentNo ?? d.id}`)}
        searchPlaceholder="Search deliveries..."
        getSearchText={(d) => `${(d as any).documentNo ?? formatId(d.id)} ${customerName(d.customerId)} ${warehouseName(d.warehouseId)}`}
        filters={
          <div className="flex gap-2">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-40 text-xs">
              <option value="all">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
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
        emptyIcon={<Truck size={26} strokeWidth={2} />}
        emptyTitle="No deliveries"
        emptyDescription="Create a new delivery from a sales order."
      />
    </RoleGuard>
  );
}
