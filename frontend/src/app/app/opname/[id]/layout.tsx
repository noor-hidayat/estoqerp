"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Outlet } from "react-router-dom";
import { CheckCircle2, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  useProject,
  useAllWarehouses,
  useBranches,
  useScanSessions,
  useScanRecords,
  useOpnameEntries,
  useRemove,
  useUpdate,
} from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cx } from "@/lib/utils";
import { ShellLoader } from "@/components/ui/loader";

const TABS = [
  { id: "", label: "Ringkasan", menu: "opname.detail" },
  { id: "scan", label: "Scan", menu: "opname.detail.scan" },
  { id: "sessions", label: "Scan Session", menu: "opname.detail.sessions" },
  { id: "variance", label: "Variance Review", menu: "opname.detail.variance" },
];

export default function ProjectLayout() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { access, isSystem, permissions } = useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: project, isLoading: projectLoading } = useProject(params.id);
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [] } = useBranches();
  const { data: sessions = [] } = useScanSessions({ projectId: params.id });
  const { data: recordsData } = useScanRecords({ projectId: params.id, pageSize: 10000 });
  const { data: entries = [] } = useOpnameEntries(params.id);

  const removeProject = useRemove("projects");
  const removeRecord = useRemove("scanRecords");
  const removeSession = useRemove("scanSessions");
  const removeEntry = useRemove("opnameEntries");
  const updateProject = useUpdate("projects");

  if (projectLoading) return <ShellLoader />;

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

  if (!access.branchIds.includes(project.branchId)) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-zinc-800">Akses terbatas</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-500">
          Project ini berada di luar plant yang diizinkan untuk akun Anda.
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

  const wh = warehouses.find((w) => w.id === project.warehouseId);
  const branch = branches.find((b) => b.id === project.branchId);
  const isActive = pathname === `/app/opname/${project.id}`;
  const canFinalize =
    can(isSystem, permissions, "opname", "update") && project.status === "IN_PROGRESS";
  const canDelete = can(isSystem, permissions, "opname", "delete");
  const visibleTabs = TABS.filter((tab) =>
    can(isSystem, permissions, tab.menu, "view")
  );

  const finalize = async () => {
    await updateProject.mutateAsync({ id: project.id, patch: { status: "APPROVED" } });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      for (const r of recordsData?.rows ?? []) {
        await removeRecord.mutateAsync(r.id);
      }
      for (const s of sessions) {
        await removeSession.mutateAsync(s.id);
      }
      for (const e of entries) {
        await removeEntry.mutateAsync(e.id);
      }
      await removeProject.mutateAsync(project.id);
      router.replace("/app/opname");
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
              {project.name}
            </h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              {branch?.name} · {wh?.name}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canFinalize && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void finalize()}
              >
                <CheckCircle2 size={14} strokeWidth={2} />
                Tandai Final
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} strokeWidth={2} />
                Hapus
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8 flex gap-1 overflow-x-auto rounded-lg border border-zinc-200 bg-white p-1">
        {visibleTabs.map((tab) => {
          const href =
            tab.id === ""
              ? `/app/opname/${project.id}`
              : `/app/opname/${project.id}/${tab.id}`;
          const activeTab =
            tab.id === ""
              ? isActive
              : pathname === href || pathname.startsWith(href + "/");
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
              <Trash2 size={15} strokeWidth={2} />
              Hapus Permanen
            </Button>
          </>
        }
      />
    </div>
  );
}
