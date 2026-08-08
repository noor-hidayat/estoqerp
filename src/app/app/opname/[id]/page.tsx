"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CheckCircle2,
  CircleAlert,
  ScanLine,
  Trash2,
} from "lucide-react";
import { useDB, useData } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { isManager } from "@/lib/roles";
import { projectCounted, projectProgress } from "@/lib/compute";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const db = useDB();
  const { update, remove } = useData();
  const { user } = useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  const canFinalize =
    isManager(user?.role ?? "STAFF") && project.status === "IN_PROGRESS";
  const canDelete = isManager(user?.role ?? "STAFF");

  const finalize = async () => {
    await update("projects", project.id, { status: "APPROVED" });
  };

  const handleDelete = async () => {
    setDeleting(true);
    for (const r of db.scanRecords.filter((r) => r.projectId === project.id)) {
      await remove("scanRecords", r.id);
    }
    for (const s of db.scanSessions.filter((s) => s.projectId === project.id)) {
      await remove("scanSessions", s.id);
    }
    for (const e of db.opnameEntries.filter((e) => e.projectId === project.id)) {
      await remove("opnameEntries", e.id);
    }
    await remove("projects", project.id);
    router.replace("/app/opname");
  };

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Progress lokasi"
          value={`${progress.pct}%`}
          sub={`${progress.counted}/${progress.total} lokasi terhitung`}
          icon={<ScanLine size={18} strokeWidth={2.2} />}
          accent
        />
        <Stat
          label="Qty terhitung"
          value={formatNumber(totalScanned)}
          sub={`${records.length} transaksi scan`}
          icon={<ScanLine size={18} strokeWidth={2.2} />}
        />
        <Stat
          label="Item berselisih"
          value={diffItems.length}
          sub={diffItems.length > 0 ? "Perlu review" : "Semua cocok"}
          icon={<CircleAlert size={18} strokeWidth={2.2} />}
        />
        <Stat
          label="Sesi scan"
          value={sessions.length}
          sub={`${sessions.filter((s) => s.status === "ACTIVE").length} sesi aktif`}
          icon={<ArrowLeftRight size={18} strokeWidth={2.2} />}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {project.status === "IN_PROGRESS" || project.status === "DRAFT" ? (
            <div className="relative overflow-hidden rounded-lg bg-zinc-950 p-6 text-zinc-100 sm:p-8">
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
                  className="mt-6 inline-flex h-11 items-center gap-2 rounded-md bg-emerald-600 px-6 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                >
                  <ScanLine size={16} strokeWidth={2.2} />
                  {project.status === "DRAFT" ? "Mulai Scan" : "Lanjutkan Scan"}
                </Link>
              </div>
            </div>
          ) : project.status === "APPROVED" ? (
            <div className="flex items-center gap-4 rounded-lg border border-emerald-200/70 bg-emerald-50/60 p-6 sm:p-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                <CheckCircle2 size={24} strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
                  Project final
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
                icon={<ScanLine size={24} strokeWidth={2} />}
                title="Belum ada sesi scan"
                description="Sesi scan akan tercatat di sini setelah dimulai dari halaman scan."
                className="py-10"
              />
            ) : (
              <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                {sessions.map((s, idx) => {
                  const rCount = records.filter((r) => r.sessionId === s.id).length;
                  const rQty = records
                    .filter((r) => r.sessionId === s.id)
                    .reduce((acc, r) => acc + r.quantity, 0);
                  const serial = sessions.length - idx;
                  return (
                    <Link
                      key={s.id}
                      href={`/app/opname/${project.id}/sessions/${s.id}`}
                      className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-zinc-50/60"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900 font-mono text-[11px] font-bold text-white">
                        #{String(serial).padStart(3, "0")}
                      </span>
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
                          {rCount} barcode · {formatNumber(rQty)} qty
                        </p>
                        <Badge tone={s.status === "ACTIVE" ? "amber" : "neutral"} dot>
                          {s.status === "ACTIVE" ? "Aktif" : "Selesai"}
                        </Badge>
                      </div>
                    </Link>
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
          <div className="rounded-lg border border-zinc-200 bg-white">
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

          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
            <h3 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-zinc-400">
              Aksi
            </h3>
            <div className="flex flex-col gap-2">
              <Link href={`/app/opname/${project.id}/scan`}>
                <Button variant="outline" className="w-full justify-start">
                  <ScanLine size={15} strokeWidth={2.2} />
                  Buka Scan Session
                </Button>
              </Link>
              {canFinalize && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => void finalize()}
                >
                  <CheckCircle2 size={15} strokeWidth={2.2} />
                  Tandai Final
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} strokeWidth={2.2} />
                  Hapus Project
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Hapus project?"
        description="Project, sesi scan, dan seluruh catatan scan di dalamnya akan dihapus permanen."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 size={15} strokeWidth={2.2} />
              Hapus Permanen
            </Button>
          </>
        }
      />
    </div>
  );
}
