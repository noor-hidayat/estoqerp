"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileDown,
  FileSpreadsheet,
  BarChart3,
} from "lucide-react";
import { useOpnameProjects, useOpnameStats, useItemGroups, useItemsList } from "@/lib/api/query";
import { formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cx } from "@/lib/utils";
import { ShellLoader } from "@/components/ui/loader";

type ProjectRow = {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  warehouseName: string;
  systemQty: number;
  countedQty: number;
  diff: number;
};

export default function ProjectReportPage() {
  const { data: projects = [], isLoading: projectsLoading } = useOpnameProjects();
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const project = projects.find((p) => p.id === projectId);
  const { data: stats, isLoading: statsLoading } = useOpnameStats(project?.id);
  const { data: items = [] } = useItemsList();
  const { data: itemGroups = [] } = useItemGroups();

  if (projectsLoading) return <ShellLoader />;

  const rows = useMemo(
    () =>
      (stats?.variance ?? []).map((r) => ({
        itemId: r.itemId,
        code: r.itemCode,
        name: r.itemName,
        unit: r.unit,
        warehouseName: r.warehouseName,
        systemQty: r.systemQty,
        countedQty: r.countedQty,
        diff: r.diff,
      })),
    [stats]
  );

  const exportColumns = [
    { key: "code" as const, header: "Code" },
    { key: "name" as const, header: "Item Name" },
    { key: "itemGroup" as const, header: "Item Group" },
    { key: "unit" as const, header: "Unit" },
    { key: "warehouseName" as const, header: "Warehouse" },
    { key: "systemQty" as const, header: "System Qty", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "countedQty" as const, header: "Counted Qty", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "diff" as const, header: "Variance", format: (v: unknown) => formatNumber(Number(v)) },
  ];

  const exportRows = rows.map((r) => {
    const item = items.find((i) => i.id === r.itemId);
    const ig = itemGroups.find((c) => c.id === item?.itemGroupId);
    return {
      code: item?.code ?? r.code,
      name: item?.name ?? r.name,
      itemGroup: ig?.name ?? "—",
      unit: r.unit,
      warehouseName: r.warehouseName,
      systemQty: r.systemQty,
      countedQty: r.countedQty,
      diff: r.diff,
    };
  });

  const handleExport = (type: "xlsx" | "pdf") => {
    if (!project) return;
    const base = `project-report-${project.name.replace(/\s+/g, "-").toLowerCase()}`;
    const whNames = project.warehouses.map((w) => w.warehouseName).join(", ");
    const meta = {
      title: `Stock Opname Report — ${project.name}`,
      subtitle: whNames || "",
    };
    if (type === "xlsx") exportXlsx(exportRows, exportColumns, base, "Report");
    else exportPdf(exportRows, exportColumns, base, meta);
  };

  const totalSystem = rows.reduce((a, r) => a + r.systemQty, 0);
  const totalCounted = rows.reduce((a, r) => a + r.countedQty, 0);

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (r) => r.code,
      cell: (r) => {
        const item = items.find((i) => i.id === r.itemId);
        return <span className="font-mono text-xs text-muted-foreground">{item?.code ?? r.code}</span>;
      },
      className: "whitespace-nowrap",
    },
    {
      id: "name",
      header: "Item",
      sortValue: (r) => r.name,
      cell: (r) => {
        const item = items.find((i) => i.id === r.itemId);
        return <span className="font-medium text-foreground">{item?.name ?? r.name}</span>;
      },
      className: "min-w-[200px]",
    },
    {
      id: "itemGroup",
      header: "Item Group",
      cell: (r) => {
        const item = items.find((i) => i.id === r.itemId);
        const ig = itemGroups.find((c) => c.id === item?.itemGroupId);
        return <span className="text-xs text-muted-foreground">{ig?.name ?? "—"}</span>;
      },
    },
    {
      id: "unit",
      header: "Unit",
      cell: (r) => {
        return <span className="text-xs text-muted-foreground">{r.unit}</span>;
      },
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (r) => <span className="text-xs text-muted-foreground">{r.warehouseName}</span>,
    },
    {
      id: "system",
      header: "System Qty",
      align: "right",
      sortValue: (r) => r.systemQty,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{formatNumber(r.systemQty)}</span>,
    },
    {
      id: "counted",
      header: "Counted Qty",
      align: "right",
      sortValue: (r) => r.countedQty,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{formatNumber(r.countedQty)}</span>,
    },
    {
      id: "diff",
      header: "Variance",
      align: "right",
      sortValue: (r) => r.diff,
      cell: (r) => (
        <span
          className={cx(
            "font-mono text-xs font-semibold tabular-nums",
            r.diff === 0
              ? "text-muted-foreground"
              : r.diff > 0
                ? "text-emerald-600"
                : "text-destructive"
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
        title="Report per Project"

      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="sm:w-72"
        >
          <option value="all">Select project...</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {project && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
              <FileSpreadsheet size={15} strokeWidth={2} className="text-primary" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
              <FileDown size={15} strokeWidth={2} className="text-destructive" />
              Export PDF
            </Button>
          </div>
        )}
      </div>

      {!project ? (
        <div className="rounded-md border border-dashed bg-muted/30 px-6 py-16 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-background text-muted-foreground ring-1 ring-border mx-auto">
            <BarChart3 size={22} strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">Select project</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Select a project to view the full report.
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(r) => `${r.itemId}-${r.warehouseName}`}
          loading={statsLoading}
          searchPlaceholder="Search items..."
          getSearchText={(r) => `${r.name} ${r.code}`}
          footerLeft={
            <div className="flex items-center gap-4">
              <span>
                Total system qty{" "}
                <b className="font-mono tabular-nums text-foreground">
                  {formatNumber(totalSystem)}
                </b>
              </span>
              <span>
                Total counted qty{" "}
                <b className="font-mono tabular-nums text-foreground">
                  {formatNumber(totalCounted)}
                </b>
              </span>
            </div>
          }
          minWidth={860}
          emptyIcon={<BarChart3 size={26} strokeWidth={2} />}
        emptyTitle="No data yet"
        emptyDescription="This project does not have any scan data yet."
        />
      )}
    </div>
  );
}