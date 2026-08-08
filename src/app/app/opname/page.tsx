"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardList,
  Folder,
  FolderOpen,
  Plus,
  ScanLine,
} from "lucide-react";
import { useDB } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { isManager } from "@/lib/roles";
import {
  MODE_LABELS,
  projectCode,
  projectProgress,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/compute";
import { formatDate, cx } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default function OpnameProjectsPage() {
  const db = useDB();
  const { user } = useSession();

  const visibleProjects = useMemo(() => {
    if (user?.role === "ADMIN") {
      return db.projects.filter((p) => p.branchId === user.branchId);
    }
    return db.projects;
  }, [db, user]);

  const projects = useMemo(
    () =>
      [...visibleProjects].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [visibleProjects]
  );

  const counts = useMemo(() => {
    const active = visibleProjects.filter(
      (p) => p.status === "IN_PROGRESS"
    ).length;
    const final = visibleProjects.filter((p) => p.status === "APPROVED").length;
    return { active, final };
  }, [visibleProjects]);

  const progressColor = (pct: number, status: string) => {
    if (status === "APPROVED") return "bg-emerald-500";
    if (pct === 100) return "bg-emerald-500";
    return "bg-amber-400";
  };

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Kelompokkan sesi opname dalam satu project bernama, lalu jalankan sesi scan."
        actions={
          isManager(user?.role ?? "STAFF") ? (
            <Link href="/app/opname/new">
              <Button variant="primary">
                <Plus size={15} strokeWidth={2.2} />
                Buat Project
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Total project",
            value: visibleProjects.length,
            icon: <FolderOpen size={18} strokeWidth={2.2} />,
            iconClass: "bg-zinc-900 text-zinc-50",
            chip: "Semua",
            tone: "text-zinc-900",
          },
          {
            label: "Berlangsung",
            value: counts.active,
            icon: <ScanLine size={18} strokeWidth={2.2} />,
            iconClass: "bg-amber-100 text-amber-700",
            chip: "Aktif",
            tone: "text-amber-600",
          },
          {
            label: "Final",
            value: counts.final,
            icon: <ClipboardList size={18} strokeWidth={2.2} />,
            iconClass: "bg-emerald-100 text-emerald-700",
            chip: "Selesai",
            tone: "text-emerald-600",
          },
        ].map((s, i) => (
          <div
            key={s.label}
            className="animate-fade-up group rounded-xl border border-zinc-200 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_36px_-16px_rgb(17_17_17/0.14)]"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-center justify-between">
              <span
                className={cx(
                  "inline-flex h-10 w-10 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105",
                  s.iconClass
                )}
              >
                {s.icon}
              </span>
              <span className="rounded-full bg-zinc-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 ring-1 ring-inset ring-zinc-200/70">
                {s.chip}
              </span>
            </div>
            <p className={cx("mt-6 font-mono text-[30px] font-semibold leading-none tracking-tight", s.tone)}>
              {s.value}
            </p>
            <p className="mt-2 text-[13px] font-medium text-zinc-500">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="animate-fade-up rounded-xl border border-zinc-200 bg-white p-14">
          <EmptyState
            icon={<Folder size={28} strokeWidth={2} />}
            title="Belum ada project"
            description="Buat project opname pertama untuk mulai proses penghitungan stok."
            action={
              isManager(user?.role ?? "STAFF") ? (
                <Link href="/app/opname/new">
                  <Button variant="primary">
                    <Plus size={15} strokeWidth={2.2} />
                    Buat Project
                  </Button>
                </Link>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div
          className="animate-fade-up overflow-hidden rounded-xl border border-zinc-200 bg-white"
          style={{ animationDelay: "280ms" }}
        >
          <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
                <Folder size={16} strokeWidth={2.2} />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold tracking-tight text-zinc-900">
                  Daftar Project
                </h2>
                <p className="text-[12px] text-zinc-400">
                  {projects.length} project · {counts.active} berlangsung
                </p>
              </div>
            </div>
            <Badge tone="neutral" dot>
              {STATUS_LABELS.APPROVED}
            </Badge>
          </div>
          <Table
            columns={["ID", "Project", "Status", "Mode", "Progress", "Dibuat", ""]}
          >
            {projects.map((p) => {
              const progress = projectProgress(db, p);
              return (
                <tr
                  key={p.id}
                  className="group transition-colors hover:bg-zinc-50/70"
                >
                  <Td mono className="text-[12px] text-zinc-500">
                    {projectCode(db, p)}
                  </Td>
                  <Td>
                    <Link
                      href={`/app/opname/${p.id}`}
                      className="block"
                    >
                      <p className="text-[14px] font-semibold tracking-tight text-zinc-900 transition-colors group-hover:text-emerald-700">
                        {p.name}
                      </p>
                    </Link>
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[p.status]} dot>
                      {STATUS_LABELS[p.status]}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] font-medium text-zinc-500">
                      {MODE_LABELS[p.mode]}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex min-w-[140px] items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div
                          className={cx(
                            "h-full rounded-full transition-all duration-500",
                            progressColor(progress.pct, p.status)
                          )}
                          style={{ width: `${progress.pct}%` }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right font-mono text-[12px] font-semibold text-zinc-600">
                        {progress.pct}%
                      </span>
                    </div>
                  </Td>
                  <Td className="text-[12.5px] text-zinc-500">
                    {formatDate(p.createdAt)}
                  </Td>
                  <Td>
                    <Link
                      href={`/app/opname/${p.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-zinc-900 hover:text-white"
                    >
                      <ArrowUpRight size={15} strokeWidth={2.2} />
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </div>
  );
}
