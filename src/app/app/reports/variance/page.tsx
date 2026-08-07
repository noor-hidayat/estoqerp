"use client";

import { useMemo, useState } from "react";
import { FilePdf, FileXls, Warning } from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import { projectCounted } from "@/lib/compute";
import { formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cx } from "@/lib/utils";

export default function VarianceReportPage() {
  const db = useDB();
  const [projectId, setProjectId] = useState("all");
  const [mode, setMode] = useState<"all" | "diff">("diff");

  const rows = useMemo(() => {
    const projects =
      projectId === "all"
        ? db.projects
        : db.projects.filter((p) => p.id === projectId);

    const all = projects.flatMap((p) =>
      projectCounted(db, p).map((r) => {
        const item = db.items.find((i) => i.id === r.itemId);
        return {
          projectName: p.name,
          projectId: p.id,
          code: item?.code ?? "—",
          name: item?.name ?? "—",
          unit: item?.unit ?? "—",
          warehouse: db.warehouses.find((w) => w.id === p.warehouseId)?.code ?? "—",
          systemQty: r.systemQty,
          countedQty: r.countedQty,
          diff: r.diff,
        };
      })
    );
    return mode === "diff" ? all.filter((r) => r.diff !== 0) : all;
  }, [db, projectId, mode]);

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
            {db.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode("diff")}
              className={cx(
                "rounded-full px-4 py-2 text-[12.5px] font-medium transition-colors",
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
                "rounded-full px-4 py-2 text-[12.5px] font-medium transition-colors",
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
            <FileXls size={15} weight="bold" className="text-emerald-600" />
            Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <FilePdf size={15} weight="bold" className="text-red-500" />
            Export PDF
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Warning size={26} weight="bold" />}
          title="Tidak ada selisih"
          description="Belum ada item dengan variance pada filter ini."
        />
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white">
          <Table columns={["Project", "Gudang", "Item", "Unit", "Qty Sistem", "Qty Hitung", "Selisih"]}>
            {rows.map((r, i) => (
              <tr key={i} className="transition-colors hover:bg-zinc-50/60">
                <Td className="text-[12.5px]">{r.projectName}</Td>
                <Td mono className="text-[12px]">{r.warehouse}</Td>
                <Td>
                  <p className="text-[13px] font-semibold text-zinc-900">{r.name}</p>
                  <p className="font-mono text-[10.5px] text-zinc-400">{r.code}</p>
                </Td>
                <Td className="text-[12px]">{r.unit}</Td>
                <Td mono>{formatNumber(r.systemQty)}</Td>
                <Td mono>{formatNumber(r.countedQty)}</Td>
                <Td>
                  <span
                    className={cx(
                      "rounded-lg px-2 py-1 font-mono text-[12px] font-semibold",
                      r.diff > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-700"
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
