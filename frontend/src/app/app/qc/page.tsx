import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardCheck, Plus } from "lucide-react";
import { useQcInspections } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { formatId, timeAgo } from "@/lib/utils";
import type { QcInspection } from "@/types";

export default function InboundQcPage() {
  const navigate = useNavigate();
  const { data: inspections = [], isLoading } = useQcInspections();

  const [statusFilter, setStatusFilter] = useState("all");

  const qcNo = (q: QcInspection) => {
    const doc = q.documentNo ?? formatId(q.id);
    return doc && doc !== "—" ? String(doc) : formatId(q.id);
  };

  const filtered = useMemo(() => inspections.filter((q) => statusFilter === "all" || q.status === statusFilter), [inspections, statusFilter]);

  const columns: DataTableColumn<QcInspection>[] = [
    {
      id: "qcNo",
      header: "ID",
      cell: (q) => <span className="text-xs font-semibold">{qcNo(q)}</span>,
      sortValue: (q) => String(qcNo(q)),
    },
    {
      id: "posting",
      header: "Posting date",
      cell: (q) => <span className="whitespace-nowrap text-muted-foreground text-xs">{q.inspectionDate?.slice(0, 10) ?? "—"}</span>,
      sortValue: (q) => q.inspectionDate ?? "",
    },
    {
      id: "status",
      header: "Status",
      cell: (q) => <DocStatusBadge status={q.status as any} />,
      sortValue: (q) => q.status,
    },
    {
      id: "created",
      header: "Created",
      cell: (q) => <span className="text-muted-foreground text-xs">{(q as any).createdAt ? timeAgo((q as any).createdAt) : "—"}</span>,
      sortValue: (q) => (q as any).createdAt ?? "",
    },
  ];

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <PageHeader
        title="QC Inspection"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/qc/new")}>
            <Plus size={14} strokeWidth={2} />
            New QC Inspection
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(q) => q.id}
        loading={isLoading}
        searchPlaceholder="Cari ID..."
        getSearchText={(q) => `${qcNo(q)}`}
        onRowClick={(q) => navigate(`/app/qc/${encodeURIComponent(q.id)}`)}
        filters={
          <div className="flex gap-2">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-8 w-44 text-xs">
              <option value="all">All status</option>
              <option value="DRAFT">Draft</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELED">Canceled</option>
            </Select>
          </div>
        }
        emptyIcon={<ClipboardCheck size={26} strokeWidth={2} />}
        emptyTitle="Belum ada QC Inspection"
        emptyDescription="Klik New QC Inspection untuk buat inspeksi dari Receiving PENDING_QC."
      />
    </RoleGuard>
  );
}
