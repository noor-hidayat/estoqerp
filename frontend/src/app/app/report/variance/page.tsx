import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { useOpnameProjects } from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cx } from "@/lib/utils";
import { ShellLoader } from "@/components/ui/loader";

interface VarianceStats {
  projectId: string;
  progress: { total: number; counted: number; pct: number };
  variance: { itemId: string; itemCode: string; itemName: string; unit: string; warehouseId: string; warehouseName: string; systemQty: number; countedQty: number; diff: number }[];
}

interface VarianceRow {
  projectName: string;
  projectId: string;
  code: string;
  name: string;
  unit: string;
  warehouse: string;
  systemQty: number;
  countedQty: number;
  diff: number;
}

export default function VarianceReportPage() {
  const { data: projects = [], isLoading: projectsLoading } = useOpnameProjects();
  const [projectId, setProjectId] = useState("all");
  const [mode, setMode] = useState<"all" | "diff">("diff");

  const targetProjects = useMemo(
    () =>
      projectId === "all"
        ? projects
        : projects.filter((p) => p.id === projectId),
    [projects, projectId]
  );

  const statsQueries = useQueries({
    queries: targetProjects.map((project) => ({
      queryKey: ["opname-stats", project.id],
      queryFn: () => api.get<VarianceStats>(`/opname-projects/${project.id}/stats`),
      staleTime: 30_000,
    })),
  });

  const anyLoading = statsQueries.some((q) => q.isLoading);

  const rows = useMemo(() => {
    return targetProjects.flatMap((project, i) => {
      const data = statsQueries[i]?.data;
      if (!data) return [];
      return data.variance
        .map((r) => ({
          projectName: project.name,
          projectId: project.id,
          code: r.itemCode,
          name: r.itemName,
          unit: r.unit,
          warehouse: r.warehouseName,
          systemQty: r.systemQty,
          countedQty: r.countedQty,
          diff: r.diff,
        }))
        .filter((r) => mode === "all" || r.diff !== 0);
    });
  }, [targetProjects, statsQueries, mode]);

  const exportColumns = [
    { key: "projectName" as const, header: "Project" },
    { key: "warehouse" as const, header: "Warehouse" },
    { key: "code" as const, header: "Code" },
    { key: "name" as const, header: "Item Name" },
    { key: "unit" as const, header: "Unit" },
    { key: "systemQty" as const, header: "System Qty", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "countedQty" as const, header: "Counted Qty", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "diff" as const, header: "Variance", format: (v: unknown) => formatNumber(Number(v)) },
  ];

  const handleExport = (type: "xlsx" | "pdf") => {
    const base = "variance-report";
    const meta = {
      title: "Variance Report",
      subtitle: "Focus on items with differences between system stock and physical count",
    };
    if (type === "xlsx") exportXlsx(rows, exportColumns, base, "Variance");
    else exportPdf(rows, exportColumns, base, meta);
  };

  if (projectsLoading) return <ShellLoader />;

  const columns: DataTableColumn<VarianceRow>[] = [
    {
      id: "project",
      header: "Project",
      sortValue: (r) => r.projectName,
      cell: (r) => <span className="text-[12.5px]">{r.projectName}</span>,
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (r) => <span className="text-xs">{r.warehouse}</span>,
    },
    {
      id: "item",
      header: "Item",
      sortValue: (r) => r.name,
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-foreground">{r.name}</p>
          <p className="text-[10.5px] text-muted-foreground">{r.code}</p>
        </div>
      ),
      className: "min-w-[200px]",
    },
    {
      id: "unit",
      header: "Unit",
      cell: (r) => <span className="text-xs">{r.unit}</span>,
    },
    {
      id: "system",
      header: "System Qty",
      align: "right",
      sortValue: (r) => r.systemQty,
      cell: (r) => <span className="text-xs tabular-nums">{formatNumber(r.systemQty)}</span>,
    },
    {
      id: "counted",
      header: "Counted Qty",
      align: "right",
      sortValue: (r) => r.countedQty,
      cell: (r) => <span className="text-xs tabular-nums">{formatNumber(r.countedQty)}</span>,
    },
    {
      id: "diff",
      header: "Variance",
      align: "right",
      sortValue: (r) => r.diff,
      cell: (r) => (
        <span
          className={cx(
            " text-xs font-semibold tabular-nums",
            r.diff > 0 ? "text-emerald-600" : "text-destructive"
          )}
        >
          {r.diff > 0 ? `+${formatNumber(r.diff)}` : formatNumber(r.diff)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Variance Report"

      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => `${r.projectId}-${r.code}-${r.warehouse}`}
        loading={anyLoading}
        searchPlaceholder="Search items..."
        getSearchText={(r) => `${r.name} ${r.code} ${r.projectName}`}
        filters={
          <>
            <Select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-8 w-60 text-xs"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-1 rounded-md border border-input p-0.5">
              <button
                onClick={() => setMode("diff")}
                className={cx(
                  "rounded-[4px] px-3 py-1 text-[12px] font-medium transition-colors",
                  mode === "diff"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Only variance
              </button>
              <button
                onClick={() => setMode("all")}
                className={cx(
                  "rounded-[4px] px-3 py-1 text-[12px] font-medium transition-colors",
                  mode === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                All items
              </button>
            </div>
          </>
        }
        toolbarRight={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => handleExport("xlsx")}
            >
              <FileSpreadsheet size={14} strokeWidth={2} className="text-primary" />
              Export Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => handleExport("pdf")}
            >
              <FileDown size={14} strokeWidth={2} className="text-destructive" />
              Export PDF
            </Button>
          </>
        }
        minWidth={880}
        emptyIcon={<TriangleAlert size={26} strokeWidth={2} />}
        emptyTitle="No variance"
        emptyDescription="No items with variance for this filter yet."
        onResetFilters={() => {
          setProjectId("all");
          setMode("diff");
        }}
      />
    </div>
  );
}