"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardText,
  FolderOpen,
  Plus,
  Scan,
} from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import {
  MODE_LABELS,
  projectProgress,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/compute";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

const FILTERS = [
  { id: "all", label: "Semua" },
  { id: "active", label: "Aktif" },
  { id: "PENDING_APPROVAL", label: "Menunggu Approval" },
  { id: "APPROVED", label: "Disetujui" },
  { id: "REJECTED", label: "Ditolak" },
  { id: "DRAFT", label: "Draft" },
];

export default function OpnameProjectsPage() {
  const db = useDB();
  const [filter, setFilter] = useState("all");

  const projects = useMemo(
    () =>
      [...db.projects]
        .filter((p) => {
          if (filter === "all") return true;
          if (filter === "active")
            return p.status === "IN_PROGRESS" || p.status === "PENDING_APPROVAL";
          return p.status === filter;
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [db, filter]
  );

  const warehouseName = (id: string) =>
    db.warehouses.find((w) => w.id === id)?.name ?? "—";
  const branchName = (id: string) =>
    db.branches.find((b) => b.id === id)?.name ?? "—";

  const counts = useMemo(() => {
    const active = db.projects.filter(
      (p) => p.status === "IN_PROGRESS" || p.status === "PENDING_APPROVAL"
    ).length;
    const pending = db.projects.filter(
      (p) => p.status === "PENDING_APPROVAL"
    ).length;
    return { active, pending };
  }, [db]);

  return (
    <div>
      <PageHeader
        eyebrow="Stock Opname"
        title="Projects"
        description="Kelompokkan sesi opname dalam satu project bernama, lalu jalankan scan dan approval."
        actions={
          <Link href="/app/opname/new">
            <Button variant="secondary">
              <Plus size={15} weight="bold" />
              Buat Project
            </Button>
          </Link>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total project",
            value: db.projects.length,
            icon: <FolderOpen size={18} weight="bold" />,
          },
          {
            label: "Berlangsung",
            value: counts.active,
            icon: <Scan size={18} weight="bold" />,
          },
          {
            label: "Menunggu approval",
            value: counts.pending,
            icon: <ClipboardText size={18} weight="bold" />,
          },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-200/70 bg-white p-5"
          >
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500">
              {s.icon}
            </div>
            <p className="text-[12px] font-medium text-zinc-400">{s.label}</p>
            <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight text-zinc-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <Tabs
          tabs={FILTERS.map((f) => ({
            id: f.id,
            label: f.label,
            count:
              f.id === "all"
                ? db.projects.length
                : f.id === "active"
                  ? counts.active
                  : db.projects.filter((p) => p.status === f.id).length,
          }))}
          active={filter}
          onChange={setFilter}
        />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<ClipboardText size={26} weight="bold" />}
          title="Tidak ada project"
          description="Buat project opname baru untuk mulai proses penghitungan stok."
          action={
            <Link href="/app/opname/new">
              <Button variant="secondary">Buat Project</Button>
            </Link>
          }
        />
      ) : (
        <Stagger className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const progress = projectProgress(db, p);
            return (
              <StaggerItem key={p.id}>
                <Link
                  href={`/app/opname/${p.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-zinc-200/70 bg-white p-6 transition-all hover:border-zinc-300 hover:shadow-[0_24px_50px_-20px_rgb(24_24_27/0.12)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Badge tone={STATUS_TONE[p.status]} dot>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                    <span className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-300 transition-all group-hover:bg-zinc-900 group-hover:text-white">
                      <ArrowUpRight size={15} weight="bold" />
                    </span>
                  </div>
                  <h3 className="mt-4 text-[16px] font-semibold leading-snug tracking-tight text-zinc-900">
                    {p.name}
                  </h3>
                  <p className="mt-1.5 text-[12.5px] text-zinc-400">
                    {warehouseName(p.warehouseId)} · {branchName(p.branchId)}
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <Badge tone={p.mode === "COMPARE" ? "emerald" : "violet"}>
                      {MODE_LABELS[p.mode]}
                    </Badge>
                  </div>

                  <div className="mt-auto pt-5">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>
                        Progress {progress.counted}/{progress.total} item
                      </span>
                      <span className="font-mono font-semibold text-zinc-600">
                        {progress.pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                    <p className="mt-3 text-[11px] text-zinc-400">
                      Dibuat {formatDate(p.createdAt)}
                    </p>
                  </div>
                </Link>
              </StaggerItem>
            );
          })}
        </Stagger>
      )}
    </div>
  );
}
