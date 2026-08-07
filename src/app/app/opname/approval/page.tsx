"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Stamp,
  XCircle,
} from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import {
  projectCounted,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/compute";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { RoleGuard } from "@/components/ui/role-guard";

export default function ApprovalQueuePage() {
  const db = useDB();

  const pending = db.projects
    .filter((p) => p.status === "PENDING_APPROVAL")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const decided = db.projects
    .filter((p) => p.status === "APPROVED" || p.status === "REJECTED")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  const lastDecision = (id: string) =>
    db.approvals
      .filter((a) => a.projectId === id)
      .sort((a, b) => b.at.localeCompare(a.at))[0];

  return (
    <RoleGuard roles={["ADMIN", "APPROVER"]}>
      <PageHeader
        eyebrow="Stock Opname"
        title="Approval"
        description="Review dan setujui hasil opname sebelum menjadi data final."
      />

      <div className="mb-8">
        <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
          <Stamp size={15} weight="bold" />
          Menunggu keputusan · {pending.length}
        </h3>
        {pending.length === 0 ? (
          <div className="flex items-center gap-4 rounded-2xl border border-zinc-200/70 bg-white p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle size={22} weight="bold" />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-zinc-900">
                Tidak ada project menunggu
              </p>
              <p className="text-[12.5px] text-zinc-500">
                Project yang diajukan akan tampil di sini.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map((p) => {
              const wh = db.warehouses.find((w) => w.id === p.warehouseId);
              const variance = projectCounted(db, p);
              const diffItems = variance.filter((r) => r.diff !== 0);
              return (
                <Link
                  key={p.id}
                  href={`/app/opname/${p.id}/approval`}
                  className="group flex flex-col rounded-2xl border border-zinc-200/70 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-[0_24px_50px_-20px_rgb(37_99_235/0.15)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Badge tone={STATUS_TONE[p.status]} dot>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 transition-all group-hover:bg-blue-600 group-hover:text-white">
                      <ArrowRight size={15} weight="bold" />
                    </span>
                  </div>
                  <h4 className="mt-3 text-[15px] font-semibold text-zinc-900">
                    {p.name}
                  </h4>
                  <p className="mt-1 text-[12px] text-zinc-400">
                    {wh?.name} · diajukan {formatDate(p.createdAt)}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Badge tone={diffItems.length > 0 ? "amber" : "emerald"} dot>
                      {diffItems.length} item berselisih
                    </Badge>
                    <Badge tone="neutral">
                      {variance.length} item terhitung
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
          <Clock size={15} weight="bold" />
          Keputusan terakhir
        </h3>
        <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/70 bg-white">
          {decided.length === 0 && (
            <p className="px-5 py-8 text-center text-sm text-zinc-400">
              Belum ada project yang diputuskan.
            </p>
          )}
          {decided.map((p) => {
            const d = lastDecision(p.id);
            const approver = db.users.find((u) => u.id === d?.approvedBy);
            return (
              <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                <span
                  className={
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
                    (p.status === "APPROVED"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-red-50 text-red-600")
                  }
                >
                  {p.status === "APPROVED" ? (
                    <CheckCircle size={20} weight="bold" />
                  ) : (
                    <XCircle size={20} weight="bold" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-zinc-900">
                    {p.name}
                  </p>
                  <p className="text-[11.5px] text-zinc-400">
                    {approver?.name ?? "—"} · {d ? formatDate(d.at) : "—"}
                  </p>
                </div>
                <Badge
                  tone={p.status === "APPROVED" ? "emerald" : "red"}
                  dot
                >
                  {p.status === "APPROVED" ? "Disetujui" : "Ditolak"}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </RoleGuard>
  );
}
