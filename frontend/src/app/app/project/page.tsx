import { useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { useOpnameProjects, useDeleteOpnameProject } from "@/lib/api/query";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cx, timeAgo } from "@/lib/utils";

interface ProjectRow {
  id: string;
  name: string;
  jumlahGudang: number;
  deadline: string | null;
  progress: { pct: number };
  status: string;
  createdAt: string;
}

export default function ProjectsPage() {
  const { data: projects, isLoading } = useOpnameProjects();
  const deleteMut = useDeleteOpnameProject();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleBulkDelete = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (
      !confirm(
        `Delete ${n} selected project${n > 1 ? "s" : ""} and all stock opnames within ${n > 1 ? "them" : "it"}?`
      )
    )
      return;
    try {
      for (const id of [...selected]) {
        await deleteMut.mutateAsync(id);
      }
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete projects");
    }
  };

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      id: "id",
      header: "ID",
      sortValue: (p) => p.id,
      cell: (p) => (
        <span className="text-[10.5px] font-semibold tracking-tight text-muted-foreground">
          {p.id}
        </span>
      ),
    },
    {
      id: "name",
      header: "Project Name",
      sortValue: (p) => p.name,
      cell: (p) => (
        <Link
          to={`/app/so?projectId=${p.id}`}
          className="truncate font-medium text-foreground transition-colors hover:text-primary"
        >
          {p.name}
        </Link>
      ),
    },
    {
      id: "deadline",
      header: "Deadline",
      sortValue: (p) => p.deadline ?? "",
      cell: (p) => (
        <span className="text-muted-foreground">
            {p.deadline ? new Date(p.deadline).toLocaleDateString("id-ID") : "—"}
        </span>
      ),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (p) => p.jumlahGudang,
      cell: (p) => (
        <span className="text-[12.5px] tabular-nums text-muted-foreground">
          {p.jumlahGudang} Warehouse
        </span>
      ),
    },
    {
      id: "progress",
      header: "Progress",
      sortValue: (p) => p.progress.pct,
      cell: (p) => (
        <div className="flex min-w-36 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cx(
                "h-full rounded-full",
                p.progress.pct >= 100 ? "bg-primary" : "bg-primary/70"
              )}
              style={{ width: `${p.progress.pct}%` }}
            />
          </div>
          <span className="shrink-0 text-[11.5px] font-semibold text-muted-foreground">
            {p.progress.pct}%
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (p) => p.status,
      cell: (p) => <StatusBadge status={p.status} />,
    },
    {
      id: "created",
      header: "Created",
      sortValue: (p) => p.createdAt,
      cell: (p) => (
        <span className="text-muted-foreground">{timeAgo(p.createdAt)}</span>
      ),
    },
  ];

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Projects"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" asChild>
            <Link to="/app/project/new">
              <Plus size={14} strokeWidth={2} />
              Create Project
            </Link>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={(projects ?? []) as ProjectRow[]}
        getRowId={(p) => p.id}
        loading={isLoading}
        getSearchText={(p) => `${p.name} ${p.id} ${p.jumlahGudang}`}
        searchPlaceholder="Search project name..."
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        toolbarRight={
          selected.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleBulkDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selected.size})
            </Button>
          ) : null
        }
        emptyIcon={<FolderKanban size={24} className="text-muted-foreground" />}
        emptyTitle="No projects yet"
        emptyDescription="Create your first stock opname project."
        footerLeft={
          <span className="text-sm text-muted-foreground">
            Total <span className="font-semibold text-foreground">{projects?.length ?? 0}</span>{" "}
            projects
          </span>
        }
      />
    </div>
  );
}