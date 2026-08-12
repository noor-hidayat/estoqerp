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
import { useProjects, useAllWarehouses } from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { STATUS_LABELS } from "@/lib/compute";
import { formatDate, cx } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ShellLoader } from "@/components/ui/loader";

export default function OpnameProjectsPage() {
  const { access, isSystem, permissions } = useSession();
  const canCreate = can(isSystem, permissions, "opname", "create");
  const { data: projectsList = [], isLoading: projectsIsLoading } = useProjects();
  const { data: warehouses = [] } = useAllWarehouses();

  const visibleProjects = useMemo(() => {
    if (access.branchIds.length === 0) return projectsList;
    return projectsList.filter((p) => access.branchIds.includes(p.branchId));
  }, [projectsList, access.branchIds]);

  const projects = useMemo(
    () =>
      [...visibleProjects].sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name)
      ),
    [visibleProjects]
  );

  const counts = useMemo(() => {
    const active = visibleProjects.filter(
      (p) => p.status === "IN_PROGRESS"
    ).length;
    const final = visibleProjects.filter((p) => p.status === "APPROVED").length;
    return { active, final };
  }, [visibleProjects]);

  if (projectsIsLoading) return <ShellLoader />;

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Kelompokkan sesi opname dalam satu project bernama, lalu jalankan sesi scan."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Total project",
            value: visibleProjects.length,
            icon: <FolderOpen size={16} strokeWidth={2} />,
            iconClass: "bg-zinc-900 text-zinc-50",
            chip: "Semua",
            tone: "text-zinc-900",
          },
          {
            label: "Berlangsung",
            value: counts.active,
            icon: <ScanLine size={16} strokeWidth={2} />,
            iconClass: "bg-amber-100 text-amber-700",
            chip: "Aktif",
            tone: "text-amber-600",
          },
          {
            label: "Final",
            value: counts.final,
            icon: <ClipboardList size={16} strokeWidth={2} />,
            iconClass: "bg-emerald-100 text-emerald-700",
            chip: "Selesai",
            tone: "text-emerald-600",
          },
        ].map((s, i) => (
          <div
            key={s.label}
            className="animate-fade-up group rounded-xl border border-zinc-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_36px_-16px_rgb(17_17_17/0.14)]"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <div className="flex items-center justify-between">
              <span
                className={cx(
                  "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105",
                  s.iconClass
                )}
              >
                {s.icon}
              </span>
              <span className="rounded-full bg-zinc-50 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-zinc-400 ring-1 ring-inset ring-zinc-200/70">
                {s.chip}
              </span>
            </div>
            <p className={cx("mt-3.5 font-mono text-xl font-semibold leading-none tracking-tight", s.tone)}>
              {s.value}
            </p>
            <p className="mt-1.5 text-[12px] font-medium text-zinc-500">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {canCreate && (
        <div className="mb-4 flex justify-end">
          <Link href="/app/opname/new">
            <Button variant="primary">
              <Plus size={15} strokeWidth={2} />
              Buat Project
            </Button>
          </Link>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="animate-fade-up rounded-xl border border-zinc-200 bg-white p-14">
          <EmptyState
            icon={<Folder size={28} strokeWidth={2} />}
            title="Belum ada project"
            description="Buat project opname pertama untuk mulai proses penghitungan stok."
            action={
              canCreate ? (
                <Link href="/app/opname/new">
                  <Button variant="primary">
                    <Plus size={15} strokeWidth={2} />
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
                <Folder size={16} strokeWidth={2} />
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
            storageKey="opname"
            columns={["ID", "Project", "Warehouse", "Dibuat", "Detail"]}
          >
            {projects.map((p) => (
              <tr
                key={p.id}
                className="group transition-colors hover:bg-zinc-50/70"
              >
                <Td mono nowrap className="text-[12px] text-zinc-500">
                  {p.id}
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
                <Td nowrap className="text-[12.5px] text-zinc-500">
                  {warehouses.find((w) => w.id === p.warehouseId)?.name ?? "—"}
                </Td>
                <Td nowrap className="text-[12.5px] text-zinc-500">
                  {formatDate(p.createdAt)}
                </Td>
                <Td>
                  <Link
                    href={`/app/opname/${p.id}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-300 transition-all hover:bg-zinc-900 hover:text-white"
                  >
                    <ArrowUpRight size={15} strokeWidth={2} />
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
