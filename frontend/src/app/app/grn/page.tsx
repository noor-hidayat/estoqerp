// Daftar GRN — frontend-only (issue #5), data dari store lokal (localStorage).
// Header tanpa description; kolom ID memakai documentNo.

import { useNavigate } from "react-router-dom";
import { Plus, PackageCheck } from "lucide-react";
import { usePurchaseOrders, useSuppliers } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { timeAgo } from "@/lib/utils";
import { useGrnDocs } from "@/modules/grn/grn-store";
import { grnTotals, type GrnDoc } from "@/modules/grn/grn-types";
import { formatNumber } from "@/lib/utils";

export default function GrnListPage() {
  const navigate = useNavigate();
  const { docs } = useGrnDocs();
  const { data: pos = [] } = usePurchaseOrders();
  const { data: suppliers = [] } = useSuppliers();

  const poNo = (id: string) =>
    pos.find((p) => p.id === id)?.documentNo ?? pos.find((p) => p.id === id)?.poNo ?? "";
  const supplierName = (doc: GrnDoc) => {
    const direct = suppliers.find((s) => s.id === doc.supplierId);
    if (direct) return direct.name;
    const po = pos.find((p) => p.id === doc.purchaseOrderId);
    const fromPo = po ? suppliers.find((s) => s.id === po.supplierId) : undefined;
    return fromPo?.name ?? "";
  };

  const columns: DataTableColumn<GrnDoc>[] = [
    {
      id: "id",
      header: "ID",
      cell: (r) => <span className="text-xs font-semibold">{r.documentNo}</span>,
      sortValue: (r) => r.documentNo,
    },
    {
      id: "po",
      header: "PO ID",
      cell: (r) => <span className="font-medium text-foreground">{String(poNo(r.purchaseOrderId))}</span>,
      sortValue: (r) => String(poNo(r.purchaseOrderId)),
    },
    {
      id: "supplier",
      header: "Supplier Name",
      cell: (r) => <span className="text-sm text-foreground">{supplierName(r)}</span>,
      sortValue: (r) => supplierName(r),
    },
    {
      id: "postingDate",
      header: "Posting Date",
      cell: (r) => <span className="text-muted-foreground">{r.postingDate?.slice(0, 10)}</span>,
      sortValue: (r) => r.postingDate,
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-foreground">Rp {formatNumber(grnTotals(r.lines).grandTotal)}</span>
      ),
      sortValue: (r) => grnTotals(r.lines).grandTotal,
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
        title="GRN"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/grn/new")}>
            <Plus size={14} strokeWidth={2} />
            New GRN
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={docs}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/app/grn/${encodeURIComponent(r.documentNo)}`)}
        searchPlaceholder="Search GRN..."
        getSearchText={(r) => `${r.documentNo} ${poNo(r.purchaseOrderId)} ${supplierName(r)}`}
        emptyIcon={<PackageCheck size={26} strokeWidth={2} />}
        emptyTitle="No GRN yet"
        emptyDescription="Create a new GRN from a purchase order."
      />
    </RoleGuard>
  );
}
