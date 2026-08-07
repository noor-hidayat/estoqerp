"use client";

import { useMemo } from "react";
import {
  Coins,
  FilePdf,
  FileText,
  FileXls,
  Package,
  Warehouse as WarehouseIcon,
} from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import {
  projectProgress,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/compute";
import { formatRupiah } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { RoleGuard } from "@/components/ui/role-guard";

export default function SummaryReportPage() {
  const db = useDB();

  const data = useMemo(() => {
    const totalItems = db.items.length;
    const totalValue = db.items.reduce(
      (acc, item) =>
        acc +
        item.price *
          Object.values(item.systemStock).reduce((a, b) => a + b, 0),
      0
    );

    const projectRows = db.projects.map((p) => {
      const progress = projectProgress(db, p);
      return {
        id: p.id,
        name: p.name,
        warehouse: db.warehouses.find((w) => w.id === p.warehouseId)?.name ?? "—",
        branch: db.branches.find((b) => b.id === p.branchId)?.name ?? "—",
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
  }, [db]);

  const exportColumns = [
    { key: "name" as const, header: "Project" },
    { key: "branch" as const, header: "Cabang" },
    { key: "warehouse" as const, header: "Gudang" },
    { key: "counted" as const, header: "Item Terhitung" },
    { key: "total" as const, header: "Total Item" },
    { key: "pct" as const, header: "Completion %", format: (v: unknown) => `${v}%` },
  ];

  const handleExport = (type: "xlsx" | "pdf") => {
    const base = "summary-report";
    const meta = {
      title: "Summary Report — Stock Opname",
      subtitle: `Total nilai stok ${formatRupiah(data.totalValue)} · ${data.totalItems} item master · completion ${data.overallPct}%`,
    };
    if (type === "xlsx")
      exportXlsx(data.projectRows, exportColumns, base, "Summary");
    else exportPdf(data.projectRows, exportColumns, base, meta);
  };

  return (
    <RoleGuard roles={["ADMIN", "APPROVER"]}>
      <PageHeader
        eyebrow="Laporan"
        title="Summary Report"
        description="Ringkasan total nilai stok, jumlah item, dan persentase penyelesaian opname."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
              <FileXls size={15} weight="bold" className="text-emerald-600" />
              Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
              <FilePdf size={15} weight="bold" className="text-red-500" />
              PDF
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
            <Package size={18} weight="bold" />
          </div>
          <p className="text-[12px] font-medium text-zinc-400">Total item master</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {data.totalItems}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
            <WarehouseIcon size={18} weight="bold" />
          </div>
          <p className="text-[12px] font-medium text-zinc-400">Total gudang</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {db.warehouses.length}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700">
            <FileText size={18} weight="bold" />
          </div>
          <p className="text-[12px] font-medium text-zinc-400">Completion rata-rata</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {data.overallPct}%
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${data.overallPct}%` }}
            />
          </div>
        </div>
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-5">
          <div className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-700">
            <Coins size={18} weight="bold" />
          </div>
          <p className="text-[12px] font-medium text-zinc-400">Total nilai stok sistem</p>
          <p className="mt-1 font-mono text-xl font-semibold tracking-tight text-zinc-900">
            {formatRupiah(data.totalValue)}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-zinc-200/70 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            Ringkasan per project
          </h3>
        </div>
        <Table columns={["Project", "Cabang / Gudang", "Mode", "Progress", "Status"]}>
          {data.projectRows.map((p) => (
            <tr key={p.id} className="transition-colors hover:bg-zinc-50/60">
              <Td className="text-[13.5px] font-semibold text-zinc-900">
                {p.name}
              </Td>
              <Td className="text-[12px] text-zinc-500">
                {p.branch} · {p.warehouse}
              </Td>
              <Td>
                <Badge tone={p.mode === "COMPARE" ? "emerald" : "violet"}>
                  {p.mode === "COMPARE" ? "Banding" : "Scratch"}
                </Badge>
              </Td>
              <Td>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[12px] font-medium text-zinc-600">
                    {p.counted}/{p.total} · {p.pct}%
                  </span>
                </div>
              </Td>
              <Td>
                <Badge tone={STATUS_TONE[p.status]} dot>
                  {STATUS_LABELS[p.status]}
                </Badge>
              </Td>
            </tr>
          ))}
        </Table>
      </div>
    </RoleGuard>
  );
}
