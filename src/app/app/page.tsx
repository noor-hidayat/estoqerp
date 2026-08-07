"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Barcode,
  ChartLineUp,
  ClipboardText,
  Scan,
  Stamp,
  WarningCircle,
} from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { formatDate, relativeTime } from "@/lib/utils";
import {
  isActiveProject,
  MODE_LABELS,
  projectCounted,
  projectProgress,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/compute";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

export default function DashboardPage() {
  const db = useDB();
  const { user } = useSession();

  const data = useMemo(() => {
    const projects = db.projects;
    const active = projects.filter(isActiveProject);
    const pending = projects.filter(
      (p) => p.status === "PENDING_APPROVAL"
    ).length;
    const scansToday = db.scanRecords.filter(
      (r) => new Date(r.scannedAt).toDateString() === new Date().toDateString()
    ).length;

    const varianceItems = new Set(
      projects.flatMap((p) =>
        projectCounted(db, p)
          .filter((r) => r.diff !== 0)
          .map((r) => r.itemId)
      )
    ).size;

    const activeProject = active[0] ?? null;
    const progress = activeProject
      ? projectProgress(db, activeProject)
      : null;

    const recentScans = [...db.scanRecords]
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt))
      .slice(0, 6);

    const latestProjects = [...db.projects]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 4);

    const warehouseName = (id: string) =>
      db.warehouses.find((w) => w.id === id)?.name ?? "—";
    const userName = (id: string) =>
      db.users.find((u) => u.id === id)?.name ?? "—";
    const itemName = (id?: string) =>
      db.items.find((i) => i.id === id)?.name ?? "Tidak dikenal";

    return {
      active,
      pending,
      scansToday,
      varianceItems,
      activeProject,
      progress,
      recentScans,
      latestProjects,
      warehouseName,
      userName,
      itemName,
    };
  }, [db]);

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-8">
        <p className="text-[12px] font-medium text-zinc-400">{today}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
          Selamat datang, {user?.name.split(" ")[0]}
        </h1>
        <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-zinc-500">
          Berikut ringkasan aktivitas stock opname Anda hari ini.
        </p>
      </div>

      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <Stat
            label="Project berlangsung"
            value={data.active.length}
            sub={`${data.pending} menunggu approval`}
            icon={<ClipboardText size={18} weight="bold" />}
          />
        </StaggerItem>
        <StaggerItem>
          <Stat
            label="Scan hari ini"
            value={data.scansToday}
            sub="Transaksi terdeteksi"
            icon={<Scan size={18} weight="bold" />}
            accent
          />
        </StaggerItem>
        <StaggerItem>
          <Stat
            label="Item dengan selisih"
            value={data.varianceItems}
            sub="Tersebar di semua project"
            icon={<WarningCircle size={18} weight="bold" />}
          />
        </StaggerItem>
        <StaggerItem>
          <Stat
            label="Format barcode aktif"
            value={db.barcodeFormats.filter((f) => f.isActive).length}
            sub={`${db.barcodeFormats.length} total format`}
            icon={<Barcode size={18} weight="bold" />}
          />
        </StaggerItem>
      </Stagger>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {data.activeProject && data.progress ? (
            <StaggerItem>
              <div className="relative overflow-hidden rounded-[1.5rem] bg-zinc-950 p-6 text-zinc-100 sm:p-8">
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.07]"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, transparent 0 39px, #fff 39px 40px)",
                  }}
                />
                <div className="relative">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <Badge tone="amber" dot>
                        {STATUS_LABELS[data.activeProject.status]}
                      </Badge>
                      <span className="text-[11px] uppercase tracking-widest text-zinc-500">
                        Project aktif
                      </span>
                    </div>
                    <Link
                      href={`/app/opname/${data.activeProject.id}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-zinc-100 ring-1 ring-white/15 transition-colors hover:bg-white/20"
                    >
                      <ArrowUpRight size={16} weight="bold" />
                    </Link>
                  </div>
                  <h2 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">
                    {data.activeProject.name}
                  </h2>
                  <p className="mt-1 text-[13px] text-zinc-400">
                    {data.warehouseName(data.activeProject.warehouseId)} ·{" "}
                    {MODE_LABELS[data.activeProject.mode]}
                  </p>

                  <div className="mt-6 flex items-end justify-between gap-4">
                    <div>
                      <p className="font-mono text-3xl font-semibold tracking-tight text-emerald-400">
                        {data.progress.pct}%
                      </p>
                      <p className="text-[12px] text-zinc-500">
                        {data.progress.counted} dari {data.progress.total} item
                        terhitung
                      </p>
                    </div>
                    <div className="h-2 w-full max-w-[240px] overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${data.progress.pct}%` }}
                        transition={{ type: "spring", stiffness: 80, damping: 22 }}
                      />
                    </div>
                  </div>

                  <Link
                    href={`/app/opname/${data.activeProject.id}/scan`}
                    className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-6 text-sm font-medium text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-500 active:scale-[0.98]"
                  >
                    <Scan size={16} weight="bold" />
                    Lanjutkan Scan
                  </Link>
                </div>
              </div>
            </StaggerItem>
          ) : (
            <StaggerItem>
              <div className="rounded-[1.5rem] border border-zinc-200/70 bg-white p-8">
                <div className="flex items-center gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
                    <ClipboardText size={22} weight="bold" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-semibold text-zinc-800">
                      Belum ada project berjalan
                    </h3>
                    <p className="text-[13px] text-zinc-500">
                      Buat project opname baru untuk mulai menghitung stok.
                    </p>
                  </div>
                </div>
                <Link
                  href="/app/opname/new"
                  className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-zinc-900 px-5 text-[13px] font-medium text-zinc-50 transition-all hover:bg-zinc-800 active:scale-[0.98]"
                >
                  Buat Project
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </div>
            </StaggerItem>
          )}

          <Stagger className="grid gap-4 sm:grid-cols-2">
            {data.latestProjects.map((p) => {
              const progress = projectProgress(db, p);
              return (
                <StaggerItem key={p.id}>
                  <Link
                    href={`/app/opname/${p.id}`}
                    className="group block rounded-2xl border border-zinc-200/70 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-[0_20px_40px_-15px_rgb(24_24_27/0.08)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[14px] font-semibold leading-snug text-zinc-900">
                        {p.name}
                      </p>
                      <Badge tone={STATUS_TONE[p.status]} dot>
                        {STATUS_LABELS[p.status]}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[12px] text-zinc-400">
                      {data.warehouseName(p.warehouseId)} · dibuat{" "}
                      {formatDate(p.createdAt)}
                    </p>
                    <div className="mt-4 flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${progress.pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] font-medium text-zinc-500">
                        {progress.pct}%
                      </span>
                    </div>
                  </Link>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Aktivitas scan terakhir
            </h3>
            <Link
              href="/app/reports/history"
              className="text-[12px] font-medium text-emerald-600 hover:text-emerald-700"
            >
              Lihat semua
            </Link>
          </div>
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/70 bg-white">
            {data.recentScans.length === 0 && (
              <p className="p-6 text-center text-sm text-zinc-400">
                Belum ada aktivitas scan.
              </p>
            )}
            {data.recentScans.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Scan size={14} weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-zinc-800">
                    {data.itemName(r.itemId)}
                  </p>
                  <p className="truncate font-mono text-[11px] text-zinc-400">
                    {r.barcode}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[13px] font-semibold text-zinc-900">
                    +{r.quantity}
                  </p>
                  <p className="text-[10.5px] text-zinc-400">
                    {relativeTime(r.scannedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200/70 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Stamp size={18} weight="bold" />
              </span>
              <div className="flex-1">
                <p className="text-[13.5px] font-semibold text-zinc-900">
                  Approval menunggu
                </p>
                <p className="text-[12px] text-zinc-400">
                  {data.pending} project siap direview
                </p>
              </div>
              <Link
                href="/app/opname/approval"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-800"
              >
                <ChartLineUp size={15} weight="bold" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
