"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Outlet } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useDB } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import {
  MODE_LABELS,
  projectProgress,
  STATUS_LABELS,
  STATUS_TONE,
} from "@/lib/compute";
import { Badge } from "@/components/ui/badge";
import { cx } from "@/lib/utils";

const TABS = [
  { id: "", label: "Ringkasan" },
  { id: "scan", label: "Scan Session" },
  { id: "variance", label: "Variance Review" },
];

export default function ProjectLayout() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const db = useDB();
  const { user } = useSession();

  const project = db.projects.find((p) => p.id === params.id);

  if (!project) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-zinc-800">
          Project tidak ditemukan
        </p>
        <Link
          href="/app/opname"
          className="mt-2 inline-block text-sm text-emerald-600 hover:text-emerald-700"
        >
          Kembali ke Projects
        </Link>
      </div>
    );
  }

  if (user?.role === "ADMIN" && project.branchId !== user.branchId) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-zinc-800">Akses terbatas</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
          Project ini berada di luar plant Anda. Anda hanya dapat mengelola
          project pada cabang yang di-setting pada akun Anda.
        </p>
        <Link
          href="/app/opname"
          className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-700"
        >
          Kembali ke Projects
        </Link>
      </div>
    );
  }

  const wh = db.warehouses.find((w) => w.id === project.warehouseId);
  const branch = db.branches.find((b) => b.id === project.branchId);
  const progress = projectProgress(db, project);

  const isActive = pathname === `/app/opname/${project.id}`;

  return (
    <div>
      <Link
        href="/app/opname"
        className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
      >
        <ArrowLeft size={15} strokeWidth={2.2} />
        Kembali ke Projects
      </Link>

      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[project.status]} dot>
                {STATUS_LABELS[project.status]}
              </Badge>
              <Badge tone={project.mode === "COMPARE" ? "emerald" : "violet"}>
                {MODE_LABELS[project.mode]}
              </Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
              {project.name}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              {branch?.name} · {wh?.name}
            </p>
          </div>
          <div className="shrink-0 rounded-lg border border-zinc-200 bg-white px-5 py-4 text-right">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Progress
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
              {progress.pct}%
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-400">
              {progress.counted}/{progress.total} lokasi
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8 flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1">
        {TABS.map((tab) => {
          const href =
            tab.id === ""
              ? `/app/opname/${project.id}`
              : `/app/opname/${project.id}/${tab.id}`;
          const activeTab =
            tab.id === "" ? isActive : pathname === href;
          return (
            <Link
              key={tab.id || "overview"}
              href={href}
              className={cx(
                "shrink-0 rounded-md px-4 py-2 text-[13px] font-medium transition-colors",
                activeTab
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
