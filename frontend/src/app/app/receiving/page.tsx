import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox, Plus } from "lucide-react";
import {
  useAllWarehouses,
  useReceivings,
  usePurchaseOrders,
  useSuppliers,
} from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatId, timeAgo } from "@/lib/utils";
import { cx } from "@/lib/utils";
import type { Receiving } from "@/types";

function returnPctOf(r: any): number {
  if (typeof r.returnPct === "number") return r.returnPct;
  const totalQty = Number(r.totalQty ?? 0);
  const totalRejected = Number(r.totalRejected ?? 0);
  if (totalQty > 0) return Math.round((totalRejected / totalQty) * 100);
  // fallback status based if no qty data
  const s = String(r.status ?? "").toUpperCase();
  if (s === "COMPLETED" || s === "POSTED") return 0; // if no reject data, assume 0% reject
  if (s === "PENDING_QC") return 0;
  return 0;
}

export default function InboundReceivingPage() {
  const navigate = useNavigate();
  const { data: receipts = [], isLoading } = useReceivings();
  const { data: pos = [] } = usePurchaseOrders();
  const { data: suppliers = [] } = useSuppliers();
  const { data: warehouses = [] } = useAllWarehouses();

  const [statusFilter, setStatusFilter] = useState("all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");

  const supplierName = (r: Receiving) => {
    const sid = (r as any).supplierId as string | undefined;
    if (sid) {
      const s = suppliers.find((x) => x.id === sid);
      if (s) return s.name;
    }
    // fallback via PO
    const po = pos.find((p) => p.id === (r as any).purchaseOrderId);
    if (po?.supplierId) {
      const s = suppliers.find((x) => x.id === po.supplierId);
      if (s) return s.name;
    }
    return "";
  };
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
      id: "supplier",
      header: "Supplier Name",
      cell: (r) => <span className="text-sm text-foreground">{supplierName(r)}</span>,
      sortValue: (r) => supplierName(r),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => <DocStatusBadge status={r.status} />,
      sortValue: (r) => r.status,
    },
    {
      id: "return",
      header: "Return",
      cell: (r) => {
        const pct = returnPctOf(r as any);
        return (
          <div className="flex min-w-[100px] items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cx("h-full rounded-full", pct > 50 ? "bg-destructive" : pct > 0 ? "bg-amber-500" : "bg-primary/30")} style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">{pct}%</span>
          </div>
        );
      },
      sortValue: (r) => returnPctOf(r as any),
    },
    {
      id: "rcvNo",
      header: "ID",
      cell: (r) => <span className="text-xs font-semibold">{rcvNo(r)}</span>,
      sortValue: (r) => String(rcvNo(r)),
    },
    {
      id: "created",
      header: "Created",
      cell: (r) => <span className="text-muted-foreground text-xs">{r.createdAt ? timeAgo(r.createdAt) : ""}</span>,
      sortValue: (r) => r.createdAt ?? "",
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.receivings"]}>
      <PageHeader
        title="Receiving"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/receiving/new")}>
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
        searchPlaceholder="Cari supplier / ID..."
        getSearchText={(r) => `${rcvNo(r)} ${supplierName(r)}`}
        onRowClick={(r) => navigate(`/app/receiving/${encodeURIComponent(r.id)}`)}
        filters={
          <div className="flex gap-2">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 w-48 text-xs"
            >
              <option value="all">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_QC">Pending QC</option>
              <option value="COMPLETED">Completed</option>
              <option value="POSTED">Posted (legacy)</option>
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
