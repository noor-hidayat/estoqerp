import { Link } from "react-router-dom";
import { Folder, Plus } from "lucide-react";
import { useOpnameCounts } from "@/lib/api/query";
import { formatId, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";

interface SoRow {
  id: string;
  projectId: string;
  warehouseName: string;
  projectName: string;
  status: string;
  auditor: string;
  createdAt: string;
}

export default function StockOpnamePage() {
  const { data: counts = [], isLoading: countsLoading } = useOpnameCounts();

  const rows: SoRow[] = counts as SoRow[];

  const columns: DataTableColumn<SoRow>[] = [
    {
      id: "id",
      header: "ID",
      sortValue: (r) => r.id,
      cell: (r) => (
        <Link
          to={`/app/so/count/${r.id}`}
          className="text-[11px] font-semibold tracking-tight text-primary hover:underline"
        >
          {formatId(r.id)}
        </Link>
      ),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseName,
      cell: (r) => <span className="text-xs text-foreground">{r.warehouseName}</span>,
    },
    {
      id: "project",
      header: "Project Name",
      sortValue: (r) => r.projectName,
      cell: (r) => (
        <Link
          to={`/app/so/count?projectId=${r.projectId}`}
          className="block truncate text-xs font-medium text-foreground transition-colors hover:text-primary"
        >
          {r.projectName}
        </Link>
      ),
      className: "min-w-[200px]",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      id: "auditor",
      header: "Auditor",
      sortValue: (r) => r.auditor,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.auditor}</span>,
    },
    {
      id: "created",
      header: "Created",
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground" title={r.createdAt}>
          {timeAgo(r.createdAt)}
        </span>
      ),
    },
  ];

  if (countsLoading) return <ShellLoader />;

  return (
    <div>
      <PageHeader
        title="Stock Opname"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" asChild>
            <Link to="/app/so/count">
              <Plus size={14} strokeWidth={2} />
              Count
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search warehouse / project / auditor..."
        getSearchText={(r) => `${r.id} ${r.warehouseName} ${r.projectName} ${r.status} ${r.auditor}`}
        initialSort={{ id: "created", dir: "desc" }}
        minWidth={800}
        emptyIcon={<Folder size={26} strokeWidth={2} />}
        emptyTitle="No stock opnames yet"
        emptyDescription="Create a project to start stock opname."
      />
    </div>
  );
}