import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, PackageCheck } from "lucide-react";
import { useGoodsReceipts, usePurchaseOrders, useAllWarehouses } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { GoodsReceipt } from "@/types";
import { formatId } from "@/lib/utils";

export default function GoodsReceiptsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const { data: receipts = [], isLoading } = useGoodsReceipts();
  const { data: pos = [] } = usePurchaseOrders();
  const { data: warehouses = [] } = useAllWarehouses();

  const poNo = (id: string) => pos.find((p) => p.id === id)?.poNo ?? "";
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "";

  const filtered = useMemo(
    () =>
      receipts.filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (warehouseFilter === "all" || r.warehouseId === warehouseFilter)
      ),
    [receipts, statusFilter, warehouseFilter]
  );

  const columns: DataTableColumn<GoodsReceipt>[] = [
    {
      id: "grNo",
      header: "GR No",
      cell: (r) => <span className="text-xs font-semibold">{(r as any).documentNo ?? r.grNo ?? formatId(r.id)}</span>,
      sortValue: (r) => String((r as any).documentNo ?? r.grNo),
    },
    {
      id: "po",
      header: "Purchase Order",
      cell: (r) => <span className="font-medium text-foreground">PO {poNo(r.purchaseOrderId)}</span>,
      sortValue: (r) => String(r.purchaseOrderId),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (r) => <span className="text-muted-foreground">{warehouseName(r.warehouseId)}</span>,
      sortValue: (r) => warehouseName(r.warehouseId),
    },
    {
      id: "receiptDate",
      header: "Receipt Date",
      cell: (r) => <span className="text-muted-foreground">{r.receiptDate?.slice(0, 10)}</span>,
      sortValue: (r) => r.receiptDate,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => <DocStatusBadge status={r.status} />,
      sortValue: (r) => r.status,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => navigate(`/app/goods-receipts/${encodeURIComponent(r.id)}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
      <PageHeader
        title="Goods Receipts"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/goods-receipts/new")}>
            <Plus size={14} strokeWidth={2} />
            New Goods Receipt
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(r) => r.id}
        loading={isLoading}
        onRowClick={(r) => navigate(`/app/goods-receipts/${encodeURIComponent(r.id)}`)}
        searchPlaceholder="Search goods receipts..."
        getSearchText={(r) => `${(r as any).documentNo ?? formatId(r.id)} ${poNo(r.purchaseOrderId)} ${warehouseName(r.warehouseId)}`}
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
        emptyIcon={<PackageCheck size={26} strokeWidth={2} />}
        emptyTitle="No goods receipts"
        emptyDescription="Create a new goods receipt from a purchase order."
      />
    </RoleGuard>
  );
}