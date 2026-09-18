// Daftar Putaway — frontend-only (issue #7), data dari store lokal (localStorage).
// Header tanpa description; kolom ID memakai documentNo.

import { useNavigate } from "react-router-dom";
import { Plus, PackageSearch } from "lucide-react";
import { useAllWarehouses } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatNumber, timeAgo } from "@/lib/utils";
import { usePutawayDocs } from "@/modules/putaway/putaway-store";
import { putawayTotalQty, type PutawayDoc } from "@/modules/putaway/putaway-types";
import { getGrn } from "@/modules/grn/grn-store";

export default function PutawayListPage() {
  const navigate = useNavigate();
  const { docs } = usePutawayDocs();
  const { data: warehouses = [] } = useAllWarehouses();

  const grnNo = (grnId: string) => (grnId ? getGrn(grnId)?.documentNo ?? "" : "");
  const subWarehouseName = (doc: PutawayDoc) =>
    warehouses.find((w) => w.id === doc.subWarehouseId)?.name ??
    warehouses.find((w) => w.id === (doc as any).warehouseId)?.name ??
    "";

  const columns: DataTableColumn<PutawayDoc>[] = [
    {
      id: "id",
      header: "ID",
      cell: (r) => <span className="text-xs font-semibold">{r.documentNo}</span>,
      sortValue: (r) => r.documentNo,
    },
    {
      id: "grn",
      header: "Ref No GRN",
      cell: (r) => <span className="font-medium text-foreground">{grnNo(r.grnId) || "—"}</span>,
      sortValue: (r) => grnNo(r.grnId),
    },
    {
      id: "warehouse",
      header: "Sub Warehouse",
      cell: (r) => <span className="text-sm text-foreground">{subWarehouseName(r)}</span>,
      sortValue: (r) => subWarehouseName(r),
    },
    {
      id: "postingDate",
      header: "Posting Date",
      cell: (r) => <span className="text-muted-foreground">{r.postingDate?.slice(0, 10)}</span>,
      sortValue: (r) => r.postingDate,
    },
    {
      id: "qty",
      header: "Qty",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-foreground">{formatNumber(putawayTotalQty(r.lines))}</span>
      ),
      sortValue: (r) => putawayTotalQty(r.lines),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => <DocStatusBadge status={r.status} />,
      sortValue: (r) => r.status,
    },
    {
      id: "created",
      header: "Created",
      cell: (r) => <span className="text-xs text-muted-foreground">{r.createdAt ? timeAgo(r.createdAt) : ""}</span>,
      sortValue: (r) => r.createdAt ?? "",
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.goodsReceipts"]}>
      <PageHeader
        title="Putaway"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/putaway/new")}>
            <Plus size={14} strokeWidth={2} />
            New Putaway
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={docs}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/app/putaway/${encodeURIComponent(r.documentNo)}`)}
        searchPlaceholder="Search Putaway..."
        getSearchText={(r) => `${r.documentNo} ${grnNo(r.grnId)} ${subWarehouseName(r)}`}
        emptyIcon={<PackageSearch size={26} strokeWidth={2} />}
        emptyTitle="No Putaway yet"
        emptyDescription="Create a new putaway manually, by barcode scan, or from a GRN."
      />
    </RoleGuard>
  );
}
