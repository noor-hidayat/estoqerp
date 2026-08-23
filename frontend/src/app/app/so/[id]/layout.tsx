"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Outlet } from "react-router-dom";
import { CheckCircle2, Trash2 } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import {
  useOpnameProject,
  useUpdateOpnameProject,
  useDeleteOpnameProject,
} from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cx } from "@/lib/utils";
import { ShellLoader } from "@/components/ui/loader";

const TABS = [
  { id: "", label: "Summary", menu: "opname.detail" },
  { id: "scan", label: "Scan", menu: "opname.detail.scan" },
  { id: "sessions", label: "Scan History", menu: "opname.detail.sessions" },
  { id: "variance", label: "Variance Review", menu: "opname.detail.variance" },
];

export default function ProjectLayout() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { isSystem, permissions } = useSession();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: project, isLoading: projectLoading } = useOpnameProject(params.id);
  const updateProject = useUpdateOpnameProject();
  const deleteProject = useDeleteOpnameProject();

  if (projectLoading) return <ShellLoader />;

  if (!project) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-foreground">
          Stock opname not found
        </p>
        <Link
          href="/app/so"
          className="mt-2 inline-block text-sm text-primary hover:text-primary/80"
        >
          Back to Stock Opname
        </Link>
      </div>
    );
  }

  const isActive = pathname === `/app/so/${project.id}`;
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
      await deleteProject.mutateAsync(project.id);
      router.replace("/app/so");
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
              {project.name}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {project.mode === "COMPARE" ? "Compare" : "Scratch"} ·{" "}
              {project.description || "Stock opname project"}
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
                Mark as Final
              </Button>
            )}
            {canDelete && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 size={14} strokeWidth={2} />
                Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mb-8 flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {visibleTabs.map((tab) => {
          const href =
            tab.id === ""
              ? `/app/so/${project.id}`
              : `/app/so/${project.id}/${tab.id}`;
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
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
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
        title="Delete project?"
        description="Project, its warehouses, and all scan records within it will be permanently deleted."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 size={15} strokeWidth={2} />
              Permanently Delete
            </Button>
          </>
        }
      />
    </div>
  );
}