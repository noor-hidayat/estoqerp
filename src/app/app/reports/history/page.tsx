"use client";

import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, History } from "lucide-react";
import { useDB } from "@/hooks/use-db";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

const SOURCE_LABELS: Record<string, string> = {
  SCANNER: "Scanner",
  CAMERA: "Kamera",
  MANUAL: "Manual",
};

export default function ScanHistoryPage() {
  const db = useDB();
  const [projectId, setProjectId] = useState("all");
  const [source, setSource] = useState("all");
  const [date, setDate] = useState("");

  const rows = useMemo(() => {
    return [...db.scanRecords]
      .filter((r) => {
        if (projectId !== "all" && r.projectId !== projectId) return false;
        if (source !== "all" && r.source !== source) return false;
        if (date && r.scannedAt.slice(0, 10) !== date) return false;
        return true;
      })
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
  }, [db, projectId, source, date]);

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

  const handleExport = (type: "xlsx" | "pdf") => {
    const data = rows.map((r) => {
      const item = db.items.find((i) => i.id === r.itemId);
      const project = db.projects.find((p) => p.id === r.projectId);
      const session = db.scanSessions.find((s) => s.id === r.sessionId);
      const user = db.users.find((u) => u.id === session?.scannedBy);
      const loc = db.locations.find((l) => l.id === r.locationId);
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
    const meta = { title: "Riwayat Scan (Audit Trail)", subtitle: `Total ${rows.length} transaksi scan` };
    if (type === "xlsx") exportXlsx(data, exportColumns, base, "Riwayat");
    else exportPdf(data, exportColumns, base, meta);
  };

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
            onChange={(e) => setProjectId(e.target.value)}
            className="sm:w-56"
          >
            <option value="all">Semua project</option>
            {db.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Select
            label="Sumber"
            value={source}
            onChange={(e) => setSource(e.target.value)}
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
            onChange={(e) => setDate(e.target.value)}
            className="sm:w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")}>
            <FileSpreadsheet size={15} strokeWidth={2.2} className="text-emerald-600" />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <FileDown size={15} strokeWidth={2.2} className="text-red-500" />
            PDF
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<History size={26} strokeWidth={2} />}
          title="Belum ada data scan"
          description="Sesuaikan filter atau mulai sesi scan untuk mencatat transaksi."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <p className="text-[13px] text-zinc-500">
              <span className="font-semibold text-zinc-900">{rows.length}</span>{" "}
              transaksi
            </p>
            <Badge tone="neutral">Audit trail</Badge>
          </div>
          <Table
            columns={["Waktu", "Project", "Barcode", "Item", "Qty", "Mode", "Sumber", "Lokasi"]}
          >
            {rows.slice(0, 100).map((r) => {
              const item = db.items.find((i) => i.id === r.itemId);
              const project = db.projects.find((p) => p.id === r.projectId);
              const loc = db.locations.find((l) => l.id === r.locationId);
              return (
                <tr key={r.id} className="transition-colors hover:bg-zinc-50/60">
                  <Td className="whitespace-nowrap text-[12px] text-zinc-500">
                    {formatDateTime(r.scannedAt)}
                  </Td>
                  <Td className="max-w-[160px] truncate text-[12.5px] text-zinc-600">
                    {project?.name ?? "—"}
                  </Td>
                  <Td mono className="text-[12px]">
                    {r.barcode}
                  </Td>
                  <Td className="max-w-[220px] truncate text-[12.5px]">
                    {item?.name ?? <span className="text-zinc-400">Tidak dikenal</span>}
                  </Td>
                  <Td mono className="text-[13px] font-semibold">
                    {formatNumber(r.quantity)}
                  </Td>
                  <Td>
                    <Badge tone={r.qtyMode === "AUTO" ? "violet" : "amber"}>
                      {r.qtyMode === "AUTO" ? "Otomatis" : "Manual"}
                    </Badge>
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
          {rows.length > 100 && (
            <p className="border-t border-zinc-100 px-5 py-3 text-center text-[12px] text-zinc-400">
              Menampilkan 100 dari {rows.length} transaksi. Gunakan filter untuk
              mempersempit.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
