import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, Plus } from "lucide-react";
import {
  useAllWarehouses,
  useReceivings,
  usePurchaseOrders,
} from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatId, formatTime } from "@/lib/utils";
import type { Receiving } from "@/types";

/** Tanggal dari receiptDate, jam dari createdAt (kolom receipt_date di DB bertipe DATE). */
function postingLabel(r: Receiving) {
  const date = r.receiptDate?.slice(0, 10) ?? "—";
  const time = r.createdAt ? formatTime(r.createdAt) : "--:--";
  return `${date} · ${time}`;
}

export default function InboundReceivingPage() {
  const navigate = useNavigate();
  const { data: receipts = [], isLoading } = useReceivings();
  const { data: pos = [] } = usePurchaseOrders();
  const { data: warehouses = [] } = useAllWarehouses();

  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const poNo = (purchaseOrderId: string) =>
    pos.find((p) => p.id === purchaseOrderId)?.documentNo ??
    pos.find((p) => p.id === purchaseOrderId)?.poNo ??
    "—";
  const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? "—";
  const rcvNo = (r: Receiving) =>
    r.documentNo ?? (r as unknown as { rcvNo?: string }).rcvNo ?? formatId(r.id);

  const filtered = useMemo(
    () =>
      receipts.filter(
        (r) =>
          (statusFilter === "all" || r.status === statusFilter) &&
          (warehouseFilter === "all" || r.warehouseId === warehouseFilter)
      ),
    [receipts, statusFilter, warehouseFilter]
  );

  const columns: DataTableColumn<Receiving>[] = [
    {
      id: "rcvNo",
      header: "No Receiving",
      cell: (r) => <span className="text-xs font-semibold">{rcvNo(r)}</span>,
      sortValue: (r) => String(rcvNo(r)),
    },
    {
      id: "po",
      header: "No PO",
      cell: (r) => <span className="font-medium text-foreground">{String(poNo(r.purchaseOrderId))}</span>,
      sortValue: (r) => String(poNo(r.purchaseOrderId)),
    },
    {
      id: "posting",
      header: "Tanggal & Jam",
      cell: (r) => <span className="whitespace-nowrap text-muted-foreground">{postingLabel(r)}</span>,
      sortValue: (r) => `${r.receiptDate} ${r.createdAt ?? ""}`,
    },
    {
      id: "warehouse",
      header: "Gudang Simpan",
      cell: (r) => <span className="text-muted-foreground">{warehouseName(r.warehouseId)}</span>,
      sortValue: (r) => warehouseName(r.warehouseId),
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
          onClick={() => navigate(`/app/inbound/receiving/${r.id}`)}
        >
          View
        </Button>
      ),
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <PageHeader
        title="Receiving"
        description="Riwayat penerimaan barang dari Purchase Order. Jam diambil dari waktu simpan (posting)."
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/inbound/receiving/new")}>
            <Plus size={14} strokeWidth={2} />
            New Receiving
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(r) => r.id}
        loading={isLoading}
        searchPlaceholder="Cari no receiving / PO / gudang..."
        getSearchText={(r) => `${rcvNo(r)} ${poNo(r.purchaseOrderId)} ${warehouseName(r.warehouseId)}`}
        onRowClick={(r) => navigate(`/app/inbound/receiving/${r.id}`)}
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
        emptyIcon={<Inbox size={26} strokeWidth={2} />}
        emptyTitle="Belum ada receiving"
        emptyDescription="Klik New Receiving untuk mencatat penerimaan dari PO."
      />
    </RoleGuard>
  );
}
