"use client";

import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, History } from "lucide-react";

import { useProjects, useScanRecords, useItemsList, useLocations, useUsers, useScanSessions } from "@/lib/api/query";
import type { ScanRecord } from "@/types";
import { api } from "@/lib/api/client";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { ShellLoader } from "@/components/ui/loader";

const SOURCE_LABELS: Record<string, string> = {
  SCANNER: "Scanner",
  CAMERA: "Kamera",
  MANUAL: "Manual",
};

export default function ScanHistoryPage() {
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const [projectId, setProjectId] = useState("all");
  const [source, setSource] = useState("all");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  const filterParams = useMemo(() => ({
    projectId: projectId !== "all" ? projectId : undefined,
    source: source !== "all" ? source : undefined,
    date: date || undefined,
    page,
    pageSize,
  }), [projectId, source, date, page, pageSize]);

  const { data: recordsData, isLoading: recordsLoading } = useScanRecords(filterParams);
  const { data: items = [] } = useItemsList();
  const { data: locations = [] } = useLocations();
  const { data: users = [] } = useUsers();
  const { data: sessions = [] } = useScanSessions();

  const sessionMap = useMemo(
    () => new Map(sessions.map((s) => [s.id, s])),
    [sessions]
  );

  const exportColumns = [
    { key: "waktu" as const, header: "Waktu" },
    { key: "project" as const, header: "Project" },
    { key: "barcode" as const, header: "Barcode" },
    { key: "item" as const, header: "Item" },
    { key: "qty" as const, header: "Qty", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "qtyMode" as const, header: "Mode Qty" },
    { key: "source" as const, header: "Sumber" },
    { key: "user" as const, header: "User" },
    { key: "location" as const, header: "Lokasi" },
  ];

  const handleExport = async (type: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const exportParams: Record<string, string> = {};
      if (projectId !== "all") exportParams.projectId = projectId;
      if (source !== "all") exportParams.source = source;
      if (date) exportParams.date = date;
      exportParams.pageSize = String(recordsData?.total ?? 500);

      const sp = new URLSearchParams(exportParams);
      const res = await api.get<{ rows: ScanRecord[]; total: number }>(
        `/scanRecords?${sp.toString()}`
      );
      const data = res.rows.map((r) => {
        const item = items.find((i) => i.id === r.itemId);
        const project = projects.find((p) => p.id === r.projectId);
        const session = sessionMap.get(r.sessionId);
        const user = users.find((u) => u.id === session?.scannedBy);
        const loc = locations.find((l) => l.id === r.locationId);
        return {
          waktu: formatDateTime(r.scannedAt),
          project: project?.name ?? "—",
          barcode: r.barcode,
          item: item?.name ?? "—",
          qty: r.quantity,
          qtyMode: r.qtyMode === "AUTO" ? "Otomatis" : "Manual",
          source: SOURCE_LABELS[r.source] ?? r.source,
          user: user?.name ?? "—",
          location: loc?.code ?? "—",
        };
      });
      const base = "riwayat-scan";
      const meta = { title: "Riwayat Scan (Audit Trail)", subtitle: `Total ${data.length} transaksi scan` };
      if (type === "xlsx") exportXlsx(data, exportColumns, base, "Riwayat");
      else exportPdf(data, exportColumns, base, meta);
    } finally {
      setExporting(false);
    }
  };

  if (projectsLoading) return <ShellLoader />;

  const rows = recordsData?.rows ?? [];
  const total = recordsData?.total ?? 0;

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Riwayat Scan"
        description="Log transaksi scan mentah untuk keperluan audit trail."
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Select
            label="Project"
            value={projectId}
            onChange={(e) => { setProjectId(e.target.value); setPage(1); }}
            className="sm:w-56"
          >
            <option value="all">Semua project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            label="Sumber"
            value={source}
            onChange={(e) => { setSource(e.target.value); setPage(1); }}
            className="sm:w-40"
          >
            <option value="all">Semua sumber</option>
            <option value="SCANNER">Scanner</option>
            <option value="CAMERA">Kamera</option>
            <option value="MANUAL">Manual</option>
          </Select>
          <Input
            label="Tanggal"
            type="date"
            value={date}
            onChange={(e) => { setDate(e.target.value); setPage(1); }}
            className="sm:w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")} disabled={exporting}>
            <FileSpreadsheet size={15} strokeWidth={2} className="text-emerald-600" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")} disabled={exporting}>
            <FileDown size={15} strokeWidth={2} className="text-red-500" />
            PDF
          </Button>
        </div>
      </div>

      {recordsLoading ? (
        <ShellLoader />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<History size={26} strokeWidth={2} />}
          title="Belum ada data scan"
          description="Sesuaikan filter atau mulai sesi scan untuk mencatat transaksi."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <p className="text-[13px] text-zinc-500">
              <span className="font-semibold text-zinc-900">{total}</span>{" "}
              transaksi
            </p>
            <Badge tone="neutral">Audit trail</Badge>
          </div>
          <Table
            storageKey="reports-history"
            columns={["Waktu", "Project", "Barcode", "Item", "Qty", "Sumber", "Lokasi"]}
          >
            {rows.map((r) => {
              const item = items.find((i) => i.id === r.itemId);
              const project = projects.find((p) => p.id === r.projectId);
              const loc = locations.find((l) => l.id === r.locationId);
              return (
                <tr key={r.id} className="transition-colors hover:bg-zinc-50/60">
                  <Td className="whitespace-nowrap text-[12px] text-zinc-500">
                    {formatDateTime(r.scannedAt)}
                  </Td>
                  <Td truncate className="max-w-[160px] text-[12.5px] text-zinc-600">
                    {project?.name ?? "—"}
                  </Td>
                  <Td mono className="text-[12px]">
                    {r.barcode}
                  </Td>
                  <Td truncate className="max-w-[220px] text-[12.5px]">
                    {item?.name ?? <span className="text-zinc-400">Tidak dikenal</span>}
                  </Td>
                  <Td mono className="text-right text-[13px] font-semibold">
                    {formatNumber(r.quantity)}
                  </Td>
                  <Td>
                    <Badge tone="neutral">
                      {SOURCE_LABELS[r.source] ?? r.source}
                    </Badge>
                  </Td>
                  <Td mono className="text-[12px]">
                    {loc?.code ?? "—"}
                  </Td>
                </tr>
              );
            })}
          </Table>
          <div className="border-t border-zinc-100 px-5 py-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
