"use client";

import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { FileDown, FileSpreadsheet, TriangleAlert } from "lucide-react";
import { useProjects, useAllWarehouses } from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cx } from "@/lib/utils";
import { ShellLoader } from "@/components/ui/loader";

interface VarianceStats {
  projectId: string;
  progress: { total: number; counted: number; pct: number };
  variance: { itemId: string; itemCode: string; itemName: string; unit: string; systemQty: number; countedQty: number; diff: number }[];
}

export default function VarianceReportPage() {
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: warehouses = [] } = useAllWarehouses();
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
      queryKey: ["project-stats", project.id],
      queryFn: () => api.get<VarianceStats>(`/projects/${project.id}/stats`),
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
          warehouse:
            warehouses.find((w) => w.id === project.warehouseId)?.name ?? "—",
          systemQty: r.systemQty,
          countedQty: r.countedQty,
          diff: r.diff,
        }))
        .filter((r) => mode === "all" || r.diff !== 0);
    });
  }, [targetProjects, statsQueries, warehouses, mode]);

  const exportColumns = [
    { key: "projectName" as const, header: "Project" },
    { key: "warehouse" as const, header: "Gudang" },
    { key: "code" as const, header: "Kode" },
    { key: "name" as const, header: "Nama Item" },
    { key: "unit" as const, header: "Unit" },
    { key: "systemQty" as const, header: "Qty Sistem", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "countedQty" as const, header: "Qty Hitung", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "diff" as const, header: "Selisih", format: (v: unknown) => formatNumber(Number(v)) },
  ];

  const handleExport = (type: "xlsx" | "pdf") => {
    const base = "laporan-variance";
    const meta = {
      title: "Variance Report",
      subtitle: "Fokus item dengan selisih antara stok sistem dan hasil hitung fisik",
    };
    if (type === "xlsx") exportXlsx(rows, exportColumns, base, "Variance");
    else exportPdf(rows, exportColumns, base, meta);
  };

  if (projectsLoading) return <ShellLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Variance Report"
        description="Laporan yang fokus pada item dengan selisih stok."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="sm:w-72"
          >
            <option value="all">Semua project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("diff")}
              className={cx(
                "rounded-md px-4 py-2 text-[12.5px] font-medium transition-colors",
                mode === "diff"
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-800"
              )}
            >
              Hanya selisih
            </button>
            <button
              onClick={() => setMode("all")}
              className={cx(
                "rounded-md px-4 py-2 text-[12.5px] font-medium transition-colors",
                mode === "all"
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-800"
              )}
            >
              Semua item
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet size={15} strokeWidth={2} className="text-emerald-600" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <FileDown size={15} strokeWidth={2} className="text-red-500" />
            Export PDF
          </Button>
        </div>
      </div>

      {anyLoading ? (
        <ShellLoader />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<TriangleAlert size={26} strokeWidth={2} />}
          title="Tidak ada selisih"
          description="Belum ada item dengan variance pada filter ini."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table storageKey="reports-variance" columns={["Project", "Gudang", "Item", "Unit", "Qty Sistem", "Qty Hitung", "Selisih"]}>
            {rows.map((r, i) => (
              <tr key={i} className="transition-colors hover:bg-zinc-50/60">
                <Td className="text-[12.5px]">{r.projectName}</Td>
                <Td className="text-[12px]">{r.warehouse}</Td>
                <Td truncate>
                  <p className="text-[13px] font-semibold text-zinc-900">{r.name}</p>
                  <p className="font-mono text-[10.5px] text-zinc-400">{r.code}</p>
                </Td>
                <Td className="text-[12px]">{r.unit}</Td>
                <Td mono className="text-right">{formatNumber(r.systemQty)}</Td>
                <Td mono className="text-right">{formatNumber(r.countedQty)}</Td>
                <Td className="text-right">
                  <span
                    className={cx(
                      "font-mono text-[12px] font-semibold",
                      r.diff > 0 ? "text-emerald-600" : "text-red-600"
                    )}
                  >
                    {r.diff > 0 ? `+${formatNumber(r.diff)}` : formatNumber(r.diff)}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
