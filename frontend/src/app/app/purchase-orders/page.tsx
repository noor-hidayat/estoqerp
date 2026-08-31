import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ShoppingCart } from "lucide-react";
import { usePurchaseOrders, useSuppliers, useAllWarehouses } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { PurchaseOrder } from "@/types";
import { formatId } from "@/lib/utils";

export default function PurchaseOrdersPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const { data: orders = [], isLoading } = usePurchaseOrders();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useAllWarehouses();

  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? "—";
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";

  const filtered = useMemo(
    () =>
      orders.filter(
        (o) =>
          (statusFilter === "all" || o.status === statusFilter) &&
          (warehouseFilter === "all" || o.warehouseId === warehouseFilter)
      ),
    [orders, statusFilter, warehouseFilter]
  );

  const columns: DataTableColumn<PurchaseOrder>[] = [
    {
      id: "poNo",
      header: "PO No",
      cell: (o) => <span className="font-mono text-xs font-semibold">{formatId(o.id)}</span>,
      sortValue: (o) => String(o.poNo),
    },
    {
      id: "supplier",
      header: "Supplier",
      cell: (o) => <span className="font-medium text-foreground">{supplierName(o.supplierId)}</span>,
      sortValue: (o) => supplierName(o.supplierId),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (o) => <span className="text-muted-foreground">{warehouseName(o.warehouseId)}</span>,
      sortValue: (o) => warehouseName(o.warehouseId),
    },
    {
      id: "orderDate",
      header: "Order Date",
      cell: (o) => <span className="text-muted-foreground">{o.orderDate?.slice(0, 10)}</span>,
      sortValue: (o) => o.orderDate,
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
          onClick={() => navigate(`/app/purchase-orders/${o.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <PageHeader
        title="Purchase Orders"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/purchase-orders/new")}>
            <Plus size={14} strokeWidth={2} />
            New Purchase Order
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(o) => o.id}
        loading={isLoading}
        searchPlaceholder="Search purchase orders..."
        getSearchText={(o) =>
          `${formatId(o.id)} ${supplierName(o.supplierId)} ${warehouseName(o.warehouseId)}`
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
              <option value="POSTED">Posted</option>
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
        emptyTitle="No purchase orders"
        emptyDescription="Create a new purchase order to get started."
      />
    </RoleGuard>
  );
}