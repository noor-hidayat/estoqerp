"use client";

import { useMemo, useState } from "react";
import { FilePdf, FileXls, MapPin, MapTrifold } from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import { formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { cx } from "@/lib/utils";

export default function LocationReportPage() {
  const db = useDB();
  const [projectId, setProjectId] = useState(db.projects[0]?.id ?? "");

  const project = db.projects.find((p) => p.id === projectId);

  const locationRows = useMemo(() => {
    if (!project) return [];
    const records = db.scanRecords.filter((r) => r.projectId === project.id);
    const byLocation = new Map<string, typeof records>();

    for (const r of records) {
      const key = r.locationId ?? "unknown";
      const arr = byLocation.get(key) ?? [];
      arr.push(r);
      byLocation.set(key, arr);
    }

    return [...byLocation.entries()].map(([locationId, recs]) => {
      const loc = db.locations.find((l) => l.id === locationId);
      const items = new Map<string, number>();
      for (const r of recs) {
        if (!r.itemId) continue;
        items.set(r.itemId, (items.get(r.itemId) ?? 0) + r.quantity);
      }
      return {
        locationId,
        code: loc?.code ?? "Tanpa lokasi",
        name: loc?.name ?? "",
        scans: recs.length,
        totalQty: recs.reduce((a, r) => a + r.quantity, 0),
        distinctItems: items.size,
        items: [...items.entries()].map(([itemId, qty]) => ({
          itemId,
          qty,
        })),
      };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }, [db, project]);

  const exportColumns = [
    { key: "code" as const, header: "Lokasi" },
    { key: "name" as const, header: "Nama" },
    { key: "scans" as const, header: "Jumlah Scan" },
    { key: "distinctItems" as const, header: "Item Unik" },
    { key: "totalQty" as const, header: "Total Qty", format: (v: unknown) => formatNumber(Number(v)) },
  ];

  const handleExport = (type: "xlsx" | "pdf") => {
    const rows = locationRows.map((l) => ({
      code: l.code,
      name: l.name,
      scans: l.scans,
      distinctItems: l.distinctItems,
      totalQty: l.totalQty,
    }));
    const base = "laporan-per-lokasi";
    const meta = {
      title: "Laporan per Lokasi",
      subtitle: project ? `Breakdown hasil per rak/bin — ${project.name}` : undefined,
    };
    if (type === "xlsx") exportXlsx(rows, exportColumns, base, "Lokasi");
    else exportPdf(rows, exportColumns, base, meta);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Laporan per Lokasi"
        description="Breakdown hasil hitung fisik per rak/bin location."
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="sm:w-72"
        >
          {db.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        {project && locationRows.length > 0 && (
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
        <EmptyState icon={<MapTrifold size={26} weight="bold" />} title="Pilih project" description="Pilih project untuk melihat breakdown per lokasi." />
      ) : locationRows.length === 0 ? (
        <EmptyState icon={<MapPin size={26} weight="bold" />} title="Belum ada data" description="Project ini belum memiliki data scan per lokasi." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {locationRows.map((l) => (
            <div key={l.locationId} className="rounded-2xl border border-zinc-200/70 bg-white p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-emerald-400">
                    <MapPin size={18} weight="bold" />
                  </span>
                  <div>
                    <p className="font-mono text-[15px] font-semibold text-zinc-900">
                      {l.code}
                    </p>
                    {l.name && (
                      <p className="text-[11.5px] text-zinc-400">{l.name}</p>
                    )}
                  </div>
                </div>
                <span
                  className={cx(
                    "rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold",
                    l.scans > 0 ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                  )}
                >
                  {l.scans} scan
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-zinc-50 px-4 py-3">
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-zinc-400">
                    Item unik
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-zinc-900">
                    {l.distinctItems}
                  </p>
                </div>
                <div className="rounded-xl bg-zinc-50 px-4 py-3">
                  <p className="text-[10.5px] font-medium uppercase tracking-wider text-zinc-400">
                    Total qty
                  </p>
                  <p className="mt-0.5 font-mono text-lg font-semibold text-zinc-900">
                    {formatNumber(l.totalQty)}
                  </p>
                </div>
              </div>

              {l.items.length > 0 && (
                <div className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100 pt-3">
                  {l.items.map(({ itemId, qty }) => {
                    const item = db.items.find((i) => i.id === itemId);
                    return (
                      <div key={itemId} className="flex items-center justify-between py-2">
                        <p className="truncate pr-3 text-[12.5px] text-zinc-700">
                          {item?.name ?? "—"}
                        </p>
                        <p className="shrink-0 font-mono text-[12.5px] font-semibold text-zinc-900">
                          {formatNumber(qty)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
