"use client";

import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Coins,
  FileDown,
  FileSpreadsheet,
  Gauge,
  Package,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import { api } from "@/lib/api/client";
import {
  useProjects,
  useItemsList,
  useAllWarehouses,
  useBranches,
  useStockBalances,
} from "@/lib/api/query";
import { formatRupiah } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { RoleGuard } from "@/components/ui/role-guard";
import { ALL_ROLES } from "@/lib/roles";
import type { ProjectStatus } from "@/types";

interface ProjectStatsResponse {
  projectId: string;
  progress: { total: number; counted: number; pct: number };
  variance: {
    itemId: string;
    itemCode: string;
    itemName: string;
    unit: string;
    systemQty: number;
    countedQty: number;
    diff: number;
  }[];
}

type ProjectRow = {
  id: string;
  name: string;
  warehouse: string;
  branch: string;
  status: ProjectStatus;
  mode: string;
  counted: number;
  total: number;
  pct: number;
};

export default function SummaryReportPage() {
  const { data: items = [] } = useItemsList();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const { data: projects = [] } = useProjects();
  const { data: stockBalances = [] } = useStockBalances();

  const projectStatsQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["project-stats", p.id] as const,
      queryFn: () => api.get<ProjectStatsResponse>(`/projects/${p.id}/stats`),
    })),
  });

  const data = useMemo(() => {
    const totalItems = items.length;

    const totalValue = items.reduce((acc, item) => {
      const qty = stockBalances
        .filter((sb) => sb.itemId === item.id)
        .reduce((a, sb) => a + sb.closingQty, 0);
      return acc + item.price * qty;
    }, 0);

    const warehouseMap = new Map(warehouses.map((w) => [w.id, w]));
    const branchMap = new Map(branches.map((b) => [b.id, b]));

    const projectRows: ProjectRow[] = projects.map((p, i) => {
      const stats = projectStatsQueries[i]?.data;
      const progress = stats?.progress ?? { total: 0, counted: 0, pct: 0 };
      return {
        id: p.id,
        name: p.name,
        warehouse: warehouseMap.get(p.warehouseId)?.name ?? "—",
        branch: branchMap.get(p.branchId)?.name ?? "—",
        status: p.status,
        mode: p.mode,
        counted: progress.counted,
        total: progress.total,
        pct: progress.pct,
      };
    });

    const totalCounted = projectRows.reduce((a, p) => a + p.counted, 0);
    const totalCandidate = projectRows.reduce((a, p) => a + p.total, 0);

    const overallPct =
      totalCandidate === 0 ? 0 : Math.round((totalCounted / totalCandidate) * 100);

    return { totalItems, totalValue, overallPct, projectRows };
  }, [items, stockBalances, warehouses, branches, projects, projectStatsQueries]);

  const exportColumns = [
    { key: "name" as const, header: "Project" },
    { key: "branch" as const, header: "Branch" },
    { key: "warehouse" as const, header: "Warehouse" },
    { key: "counted" as const, header: "Locations Counted" },
    { key: "total" as const, header: "Total Locations" },
    { key: "pct" as const, header: "Completion %", format: (v: unknown) => `${v}%` },
  ];

  const handleExport = (type: "xlsx" | "pdf") => {
    const base = "summary-report";
    const meta = {
      title: "Summary Report — Stock Opname",
      subtitle: `Total stock value ${formatRupiah(data.totalValue)} · ${data.totalItems} master items · completion ${data.overallPct}%`,
    };
    if (type === "xlsx")
      exportXlsx(data.projectRows, exportColumns, base, "Summary");
    else exportPdf(data.projectRows, exportColumns, base, meta);
  };

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      id: "name",
      header: "Project",
      sortValue: (p) => p.name,
      cell: (p) => <span className="font-medium text-foreground">{p.name}</span>,
      className: "min-w-[180px]",
    },
    {
      id: "location",
      header: "Cabang / Gudang",
      cell: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.branch} · {p.warehouse}
        </span>
      ),
    },
    {
      id: "mode",
      header: "Mode",
      cell: (p) => (
        <Badge tone={p.mode === "COMPARE" ? "emerald" : "violet"}>
          {p.mode === "COMPARE" ? "Banding" : "Scratch"}
        </Badge>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      sortValue: (p) => p.pct,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${p.pct}%` }}
            />
          </div>
          <span className="font-mono text-xs font-medium text-muted-foreground">
            {p.counted}/{p.total} lokasi · {p.pct}%
          </span>
        </div>
      ),
      className: "min-w-[220px]",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (p) => p.status,
      cell: (p) => <StatusBadge status={p.status} />,
    },
  ];

  return (
    <RoleGuard roles={ALL_ROLES} menus={["reports.summary"]}>
      <PageHeader
        title="Summary Report"

        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet size={15} strokeWidth={2} className="text-primary" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
              <FileDown size={15} strokeWidth={2} className="text-destructive" />
              PDF
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Package size={18} strokeWidth={2} />
          </div>
          <p className="text-[12px] font-medium text-muted-foreground">Total master items</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {data.totalItems}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <WarehouseIcon size={18} strokeWidth={2} />
          </div>
          <p className="text-[12px] font-medium text-muted-foreground">Total warehouses</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {warehouses.length}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Gauge size={18} strokeWidth={2} />
          </div>
          <p className="text-[12px] font-medium text-muted-foreground">Average completion</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {data.overallPct}%
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${data.overallPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Coins size={18} strokeWidth={2} />
          </div>
          <p className="text-[12px] font-medium text-muted-foreground">Total system stock value</p>
          <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-foreground">
            {formatRupiah(data.totalValue)}
          </p>
        </div>
      </div>

      <div className="mt-8">
          <h3 className="mb-3 text-[13px] font-medium text-muted-foreground">
            Summary per project
          </h3>
        <DataTable
          columns={columns}
          data={data.projectRows}
          getRowId={(p) => p.id}
          searchPlaceholder="Search projects..."
          getSearchText={(p) => `${p.name} ${p.branch} ${p.warehouse}`}
          initialSort={{ id: "name", dir: "asc" }}
          minWidth={860}
          emptyIcon={<Package size={26} strokeWidth={2} />}
        emptyTitle="No projects yet"
        emptyDescription="Stock opname projects will appear here after creation."
        />
      </div>
    </RoleGuard>
  );
}