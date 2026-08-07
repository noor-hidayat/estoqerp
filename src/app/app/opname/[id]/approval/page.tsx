"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Check,
  CheckCircle,
  Clock,
  ShieldCheck,
  Stamp,
  X,
} from "@phosphor-icons/react";
import { useData } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { newUid } from "@/lib/mock/store";
import { projectCounted, STATUS_LABELS } from "@/lib/compute";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { RoleGuard } from "@/components/ui/role-guard";
import { cx } from "@/lib/utils";
import type { Approval } from "@/types";

export default function ProjectApprovalPage() {
  const params = useParams<{ id: string }>();
  const { db, insert, update } = useData();
  const { user } = useSession();
  const [note, setNote] = useState("");
  const [confirmReject, setConfirmReject] = useState(false);

  const project = db.projects.find((p) => p.id === params.id);
  if (!project) return null;

  const approvals = db.approvals
    .filter((a) => a.projectId === project.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const variance = projectCounted(db, project);
  const diffItems = variance.filter((r) => r.diff !== 0);
  const totalQty = variance.reduce((a, r) => a + r.countedQty, 0);

  const submitReview = async () => {
    await update("projects", project.id, { status: "PENDING_APPROVAL" });
  };

  const decide = async (status: Approval["status"]) => {
    if (status === "REJECTED" && !confirmReject) {
      setConfirmReject(true);
      return;
    }
    const approval: Approval = {
      id: newUid("apr"),
      projectId: project.id,
      approvedBy: user?.id ?? "",
      status,
      note: note.trim() || undefined,
      at: new Date().toISOString(),
    };
    await insert("approvals", approval);
    await update("projects", project.id, {
      status: status === "APPROVED" ? "APPROVED" : "REJECTED",
    });
    setNote("");
    setConfirmReject(false);
  };

  const isPending = project.status === "PENDING_APPROVAL";
  const isInProgress = project.status === "IN_PROGRESS";

  return (
    <RoleGuard roles={["ADMIN", "APPROVER"]}>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {isInProgress && (
            <div className="rounded-2xl border border-zinc-200/70 bg-white p-6">
              <div className="flex items-center gap-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
                  <Clock size={20} weight="bold" />
                </span>
                <div className="flex-1">
                  <p className="text-[14px] font-semibold text-zinc-900">
                    Scan masih berlangsung
                  </p>
                  <p className="text-[12.5px] text-zinc-500">
                    Setelah scan selesai, ajukan project untuk direview
                    supervisor.
                  </p>
                </div>
                <Button variant="secondary" onClick={submitReview}>
                  <Stamp size={15} weight="bold" />
                  Ajukan Review
                </Button>
              </div>
            </div>
          )}

          {isPending && (
            <div className="rounded-2xl border border-blue-200/70 bg-blue-50/50 p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
                  <ShieldCheck size={22} weight="bold" />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-zinc-900">
                    Menunggu keputusan supervisor
                  </h2>
                  <p className="text-[12.5px] text-zinc-500">
                    Tinjau variance di bawah sebelum menyetujui hasil final.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200/70 bg-white p-5">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[11px] text-zinc-400">Total qty fisik</p>
                    <p className="font-mono text-xl font-semibold text-zinc-900">
                      {totalQty}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Item terhitung</p>
                    <p className="font-mono text-xl font-semibold text-zinc-900">
                      {variance.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-zinc-400">Item berselisih</p>
                    <p className="font-mono text-xl font-semibold text-zinc-900">
                      {diffItems.length}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {diffItems.slice(0, 5).map((r) => {
                    const item = db.items.find((i) => i.id === r.itemId);
                    return (
                      <span
                        key={r.itemId}
                        className={cx(
                          "rounded-full px-3 py-1 font-mono text-[11px] font-medium",
                          r.diff > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        )}
                      >
                        {item?.code} {r.diff > 0 ? "+" : ""}
                        {r.diff}
                      </span>
                    );
                  })}
                  {diffItems.length > 5 && (
                    <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] text-zinc-500">
                      +{diffItems.length - 5} lainnya
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Catatan keputusan (opsional)"
                  rows={3}
                  className="w-full resize-none rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                {confirmReject && (
                  <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
                    Yakin menolak hasil ini? Klik “Tolak” sekali lagi untuk
                    konfirmasi.
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Button
                  className="flex-1"
                  onClick={() => decide("APPROVED")}
                >
                  <Check size={16} weight="bold" />
                  Setujui & Finalisasi
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 text-red-600 hover:border-red-300 hover:bg-red-50"
                  onClick={() => decide("REJECTED")}
                >
                  <X size={16} weight="bold" />
                  Tolak
                </Button>
              </div>
            </div>
          )}

          {(project.status === "APPROVED" || project.status === "REJECTED") && (
            <div
              className={cx(
                "flex items-center gap-4 rounded-2xl border p-6",
                project.status === "APPROVED"
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-red-200 bg-red-50/60"
              )}
            >
              <span
                className={cx(
                  "flex h-12 w-12 items-center justify-center rounded-2xl",
                  project.status === "APPROVED"
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-red-100 text-red-600"
                )}
              >
                {project.status === "APPROVED" ? (
                  <CheckCircle size={24} weight="bold" />
                ) : (
                  <X size={24} weight="bold" />
                )}
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-zinc-900">
                  Hasil opname {project.status === "APPROVED" ? "disetujui" : "ditolak"}
                </h2>
                <p className="text-[12.5px] text-zinc-500">
                  Status project: {STATUS_LABELS[project.status]}.
                  {project.status === "APPROVED"
                    ? " Data telah final dan dapat di-export."
                    : " Ajukan opname ulang untuk revisi."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Riwayat keputusan
            </h3>
            <Badge tone="neutral">{approvals.length} catatan</Badge>
          </div>
          <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/70 bg-white">
            {approvals.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-zinc-400">
                Belum ada keputusan approval.
              </p>
            )}
            {approvals.map((a) => {
              const approver = db.users.find((u) => u.id === a.approvedBy);
              return (
                <div key={a.id} className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={approver?.name ?? "?"}
                      hue={approver?.avatarHue ?? 200}
                      size="sm"
                    />
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-zinc-800">
                        {approver?.name ?? "—"}
                      </p>
                      <p className="text-[11px] text-zinc-400">
                        {formatDateTime(a.at)}
                      </p>
                    </div>
                    <Badge
                      tone={a.status === "APPROVED" ? "emerald" : "red"}
                      dot
                    >
                      {a.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                    </Badge>
                  </div>
                  {a.note && (
                    <p className="mt-2.5 rounded-lg bg-zinc-50 px-3 py-2 text-[12px] leading-relaxed text-zinc-600">
                      “{a.note}”
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
