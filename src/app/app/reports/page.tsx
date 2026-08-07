"use client";

import { useMemo, useState } from "react";
import {
  FilePdf,
  FileXls,
  ChartBar,
} from "@phosphor-icons/react";
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

export default function ProjectReportPage() {
  const db = useDB();
  const [projectId, setProjectId] = useState(
    db.projects[0]?.id ?? "all"
  );

  const project = db.projects.find((p) => p.id === projectId);
  const rows = useMemo(
    () => (project ? projectCounted(db, project) : []),
    [db, project]
  );

  const exportColumns = [
    { key: "code" as const, header: "Kode" },
    { key: "name" as const, header: "Nama Item" },
    { key: "category" as const, header: "Kategori" },
    { key: "unit" as const, header: "Unit" },
    { key: "systemQty" as const, header: "Qty Sistem", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "countedQty" as const, header: "Qty Hitung", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "diff" as const, header: "Selisih", format: (v: unknown) => formatNumber(Number(v)) },
  ];

  const exportRows = rows.map((r) => {
    const item = db.items.find((i) => i.id === r.itemId);
    const cat = db.categories.find((c) => c.id === item?.categoryId);
    return {
      code: item?.code ?? "—",
      name: item?.name ?? "—",
      category: cat?.name ?? "—",
      unit: item?.unit ?? "—",
      systemQty: r.systemQty,
      countedQty: r.countedQty,
      diff: r.diff,
    };
  });

  const handleExport = (type: "xlsx" | "pdf") => {
    if (!project) return;
    const base = `laporan-project-${project.name.replace(/\s+/g, "-").toLowerCase()}`;
    const meta = {
      title: `Laporan Stock Opname — ${project.name}`,
      subtitle: `${db.warehouses.find((w) => w.id === project.warehouseId)?.name ?? ""} · ${db.branches.find((b) => b.id === project.branchId)?.name ?? ""}`,
    };
    if (type === "xlsx") exportXlsx(exportRows, exportColumns, base, "Laporan");
    else exportPdf(exportRows, exportColumns, base, meta);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Laporan per Project"
        description="Hasil opname lengkap per project: qty sistem, qty hasil hitung, dan selisih."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="sm:w-72"
        >
          <option value="all">Pilih project...</option>
          {db.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {project && (
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
        )}
      </div>

      {!project ? (
        <EmptyState
          icon={<ChartBar size={26} weight="bold" />}
          title="Pilih project"
          description="Pilih project untuk melihat laporan lengkap."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ChartBar size={26} weight="bold" />}
          title="Belum ada data"
          description="Project ini belum memiliki data scan."
        />
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">
                {project.name}
              </p>
              <p className="text-[11.5px] text-zinc-400">
                {db.warehouses.find((w) => w.id === project.warehouseId)?.name}
              </p>
            </div>
            <div className="flex items-center gap-4 text-[12px] text-zinc-500">
              <span>
                Total qty sistem{" "}
                <b className="font-mono text-zinc-900">
                  {formatNumber(rows.reduce((a, r) => a + r.systemQty, 0))}
                </b>
              </span>
              <span>
                Total qty hitung{" "}
                <b className="font-mono text-zinc-900">
                  {formatNumber(rows.reduce((a, r) => a + r.countedQty, 0))}
                </b>
              </span>
            </div>
          </div>
          <Table
            columns={["Kode", "Item", "Kategori", "Unit", "Qty Sistem", "Qty Hitung", "Selisih"]}
          >
            {rows.map((r) => {
              const item = db.items.find((i) => i.id === r.itemId);
              const cat = db.categories.find((c) => c.id === item?.categoryId);
              return (
                <tr key={r.itemId} className="transition-colors hover:bg-zinc-50/60">
                  <Td mono>{item?.code}</Td>
                  <Td className="text-[13px] font-semibold text-zinc-900">
                    {item?.name}
                  </Td>
                  <Td className="text-[12px] text-zinc-500">{cat?.name}</Td>
                  <Td className="text-[12px] text-zinc-500">{item?.unit}</Td>
                  <Td mono>{formatNumber(r.systemQty)}</Td>
                  <Td mono>{formatNumber(r.countedQty)}</Td>
                  <Td>
                    <span
                      className={cx(
                        "rounded-lg px-2 py-1 font-mono text-[12px] font-semibold",
                        r.diff === 0
                          ? "bg-zinc-50 text-zinc-400"
                          : r.diff > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                      )}
                    >
                      {r.diff > 0 ? `+${formatNumber(r.diff)}` : formatNumber(r.diff)}
                    </span>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </div>
  );
}
