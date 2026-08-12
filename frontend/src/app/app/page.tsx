"use client";

import Link from "next/link";
import {
  ClipboardList,
  Gauge,
  Package,
  ScanLine,
} from "lucide-react";
import { useDashboard } from "@/lib/api/query";
import { formatId, formatNumber, relativeTime } from "@/lib/utils";
import { Stat } from "@/components/ui/stat";
import { ShellLoader } from "@/components/ui/loader";

export default function DashboardPage() {
  const { data: dashboard, isLoading, isError } = useDashboard();

  if (isLoading) return <ShellLoader />;

  if (isError || !dashboard) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-zinc-200 bg-white p-14 text-center">
        <p className="text-lg font-semibold text-zinc-800">Dashboard tidak dapat dimuat</p>
        <p className="mt-2 max-w-sm text-sm text-zinc-500">
          Role Anda mungkin tidak memiliki akses ke halaman ini.
        </p>
        <Link
          href="/app/opname"
          className="mt-4 text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          Buka Projects
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          compact
          label="Project Aktif"
          value={dashboard.active}
          sub={`${dashboard.final} project final`}
          icon={<ClipboardList size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Total Scan"
          value={dashboard.totalScan}
          sub="Total barcode di-scan"
          icon={<ScanLine size={16} strokeWidth={2} />}
          accent
        />
        <Stat
          compact
          label="Progress"
          value={`${dashboard.progressPct}%`}
          sub={`${dashboard.progressCounted} dari ${dashboard.progressTotal} lokasi`}
          icon={<Gauge size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Total Item"
          value={dashboard.totalItems}
          sub="Item di master data"
          icon={<Package size={16} strokeWidth={2} />}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* AKTIVITAS TERBARU */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_10px_30px_-12px_rgb(17_17_17/0.08)]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Aktivitas terbaru
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-semibold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </span>
          </div>

          <div className="divide-y divide-zinc-100">
            {dashboard.recentSessions.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-zinc-400">
                Belum ada sesi scan.
              </p>
            )}
            {dashboard.recentSessions.map((s, i) => (
              <div
                key={s.id}
                className={`grid grid-cols-[100px_1fr_56px_110px_96px] items-center gap-3 px-5 py-2.5 ${
                  i % 2 === 1 ? "bg-zinc-50/40" : ""
                }`}
              >
                <span className="truncate font-mono text-[11px] font-semibold tracking-tight text-zinc-600">
                  {formatId(s.code)}
                </span>
                <span className="truncate text-[13px] font-medium text-zinc-800">
                  {s.product}
                </span>
                <span className="text-right font-mono text-[13px] font-semibold text-zinc-900">
                  {formatNumber(s.qty)}
                </span>
                <span className="truncate text-[11.5px] text-zinc-500">
                  {s.scannedBy}
                </span>
                <span className="truncate text-right text-[11px] text-zinc-400">
                  {relativeTime(s.at)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* PROJECT PROGRESS */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_10px_30px_-12px_rgb(17_17_17/0.08)]">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Project Progress
            </h2>
          </div>

          <div className="space-y-5 px-5 py-4">
            {dashboard.projectProgressRows.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-400">
                Belum ada project.
              </p>
            )}
            {dashboard.projectProgressRows.map((p) => (
              <Link key={p.id} href={`/app/opname/${p.id}`} className="group block">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[13px] font-semibold text-zinc-800 group-hover:text-emerald-700">
                    {p.name}
                  </p>
                  <span className="font-mono text-[12.5px] font-semibold text-zinc-900">
                    {p.pct}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-400">{p.warehouse}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
