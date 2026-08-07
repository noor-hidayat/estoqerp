"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowsLeftRight,
  CheckCircle,
  Scan,
  Stamp,
  WarningCircle,
} from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { projectCounted, projectProgress } from "@/lib/compute";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const db = useDB();
  const { hasRole } = useSession();

  const project = db.projects.find((p) => p.id === params.id);
  if (!project) return null;

  const variance = projectCounted(db, project);
  const progress = projectProgress(db, project);
  const sessions = db.scanSessions
    .filter((s) => s.projectId === project.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const records = db.scanRecords.filter((r) => r.projectId === project.id);
  const totalScanned = records.reduce((acc, r) => acc + r.quantity, 0);
  const diffItems = variance.filter((r) => r.diff !== 0);

  const locationName = (id?: string) =>
    db.locations.find((l) => l.id === id)?.code ?? "—";
  const userName = (id: string) => db.users.find((u) => u.id === id)?.name ?? "—";
  const userHue = (id: string) =>
    db.users.find((u) => u.id === id)?.avatarHue ?? 200;
  const canApprove = hasRole(["ADMIN", "APPROVER"]);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Progress item"
          value={`${progress.pct}%`}
          sub={`${progress.counted}/${progress.total} item terhitung`}
          icon={<Scan size={18} weight="bold" />}
          accent
        />
        <Stat
          label="Qty terhitung"
          value={formatNumber(totalScanned)}
          sub={`${records.length} transaksi scan`}
          icon={<Scan size={18} weight="bold" />}
        />
        <Stat
          label="Item berselisih"
          value={diffItems.length}
          sub={diffItems.length > 0 ? "Perlu review" : "Semua cocok"}
          icon={<WarningCircle size={18} weight="bold" />}
        />
        <Stat
          label="Sesi scan"
          value={sessions.length}
          sub={`${sessions.filter((s) => s.status === "ACTIVE").length} sesi aktif`}
          icon={<ArrowsLeftRight size={18} weight="bold" />}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {project.status === "IN_PROGRESS" || project.status === "DRAFT" ? (
            <div className="relative overflow-hidden rounded-[1.5rem] bg-zinc-950 p-6 text-zinc-100 sm:p-8">
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, transparent 0 39px, #fff 39px 40px)",
                }}
              />
              <div className="relative">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-400">
                  {project.status === "DRAFT" ? "Siap dimulai" : "Sedang berjalan"}
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">
                  {project.status === "DRAFT"
                    ? "Mulai sesi scan untuk project ini"
                    : "Lanjutkan penghitungan fisik"}
                </h2>
                <p className="mt-1.5 max-w-[52ch] text-[13px] leading-relaxed text-zinc-400">
                  Buka halaman scan untuk memilih lokasi dan mulai membaca
                  barcode dengan scanner fisik atau kamera HP.
                </p>
                <Link
                  href={`/app/opname/${project.id}/scan`}
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-emerald-600 px-6 text-sm font-medium text-white shadow-lg shadow-emerald-600/25 transition-all hover:bg-emerald-500 active:scale-[0.98]"
                >
                  <Scan size={16} weight="bold" />
                  {project.status === "DRAFT" ? "Mulai Scan" : "Lanjutkan Scan"}
                </Link>
              </div>
            </div>
          ) : project.status === "PENDING_APPROVAL" ? (
            <div className="rounded-[1.5rem] border border-blue-200/70 bg-blue-50/60 p-6 sm:p-8">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                  <Stamp size={22} weight="bold" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                    Menunggu approval
                  </h2>
                  <p className="mt-1 text-[13px] text-zinc-500">
                    Supervisor akan mereview hasil sebelum menjadi data final.
                  </p>
                </div>
              </div>
              {canApprove && (
                <Link
                  href={`/app/opname/${project.id}/approval`}
                  className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-zinc-900 px-5 text-[13px] font-medium text-zinc-50 transition-all hover:bg-zinc-800 active:scale-[0.98]"
                >
                  Review Sekarang
                </Link>
              )}
            </div>
          ) : project.status === "APPROVED" ? (
            <div className="flex items-center gap-4 rounded-[1.5rem] border border-emerald-200/70 bg-emerald-50/60 p-6 sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <CheckCircle size={24} weight="bold" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                  Project disetujui
                </h2>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Hasil opname telah menjadi data final dan siap di-export.
                </p>
              </div>
            </div>
          ) : null}

          <div>
            <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Sesi scan
            </h3>
            {sessions.length === 0 ? (
              <EmptyState
                icon={<Scan size={24} weight="bold" />}
                title="Belum ada sesi scan"
                description="Sesi scan akan tercatat di sini setelah dimulai dari halaman scan."
                className="py-10"
              />
            ) : (
              <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/70 bg-white">
                {sessions.map((s) => {
                  const rCount = records.filter((r) => r.sessionId === s.id).length;
                  return (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                      <Avatar name={userName(s.scannedBy)} hue={userHue(s.scannedBy)} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-medium text-zinc-800">
                          {userName(s.scannedBy)}
                        </p>
                        <p className="text-[11.5px] text-zinc-400">
                          {locationName(s.locationId)} · {formatDateTime(s.startedAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-[13px] font-semibold text-zinc-900">
                          {rCount} scan
                        </p>
                        <Badge tone={s.status === "ACTIVE" ? "amber" : "neutral"} dot>
                          {s.status === "ACTIVE" ? "Aktif" : "Selesai"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Variance teratas
            </h3>
            <Link
              href={`/app/opname/${project.id}/variance`}
              className="text-[12px] font-medium text-emerald-600 hover:text-emerald-700"
            >
              Lihat semua
            </Link>
          </div>
          <div className="rounded-2xl border border-zinc-200/70 bg-white">
            {variance.length === 0 && (
              <p className="p-6 text-center text-sm text-zinc-400">
                Belum ada data variance.
              </p>
            )}
            {variance.slice(0, 6).map((row) => {
              const item = db.items.find((i) => i.id === row.itemId);
              const d = row.diff;
              return (
                <div
                  key={row.itemId}
                  className="flex items-center gap-3 border-b border-zinc-100 px-5 py-3.5 last:border-0"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                    style={{ background: `hsl(${item?.hue ?? 200} 55% 45%)` }}
                  >
                    {item?.name.split(" ").slice(0, 2).map((w) => w[0]).join("") ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-zinc-800">
                      {item?.name ?? "—"}
                    </p>
                    <p className="font-mono text-[11px] text-zinc-400">
                      sistem {formatNumber(row.systemQty)} → fisik{" "}
                      {formatNumber(row.countedQty)}
                    </p>
                  </div>
                  <span
                    className={
                      "shrink-0 font-mono text-[13px] font-semibold " +
                      (d === 0
                        ? "text-zinc-400"
                        : d > 0
                          ? "text-emerald-600"
                          : "text-red-600")
                    }
                  >
                    {d > 0 ? `+${formatNumber(d)}` : formatNumber(d)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200/70 bg-white p-5">
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-zinc-400">
              Aksi
            </h3>
            <div className="flex flex-col gap-2">
              <Link href={`/app/opname/${project.id}/scan`}>
                <Button variant="outline" className="w-full justify-start">
                  <Scan size={15} weight="bold" />
                  Buka Scan Session
                </Button>
              </Link>
              {canApprove && (
                <Link href={`/app/opname/${project.id}/approval`}>
                  <Button variant="outline" className="w-full justify-start">
                    <Stamp size={15} weight="bold" />
                    Approval
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
