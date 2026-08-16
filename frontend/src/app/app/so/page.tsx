"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Folder,
  FolderOpen,
  Loader2,
  Plus,
} from "lucide-react";
import { useProjects, useAllWarehouses, useOpnameProjects } from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatDate, cx } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";

interface OpnameRow {
  id: string;
  projectName: string;
  name: string;
  warehouseName: string;
  createdAt: string;
}

export default function OpnameProjectsPage() {
  const { access, isSystem, permissions } = useSession();
  const canCreate = can(isSystem, permissions, "opname", "create");
  const { data: projectsList = [], isLoading: projectsIsLoading } = useProjects();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: opnameProjects = [] } = useOpnameProjects();

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

  const parentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const proj of opnameProjects) map.set(proj.id, proj.name);
    return map;
  }, [opnameProjects]);

  const counts = useMemo(() => {
    const active = visibleProjects.filter(
      (p) => p.status === "IN_PROGRESS"
    ).length;
    const final = visibleProjects.filter((p) => p.status === "APPROVED").length;
    return { active, final };
  }, [visibleProjects]);

  if (projectsIsLoading) return <ShellLoader />;

  const rows: OpnameRow[] = projects.map((p) => ({
    id: p.id,
    projectName: p.projectId ? parentMap.get(p.projectId) ?? p.projectId : "—",
    name: p.name,
    warehouseName: warehouses.find((w) => w.id === p.warehouseId)?.name ?? "—",
    createdAt: p.createdAt,
  }));

  const columns: DataTableColumn<OpnameRow>[] = [
    {
      id: "id",
        header: "ID",
      sortValue: (r) => r.id,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "project",
      header: "Project",
      cell: (r) => <span className="text-xs text-muted-foreground">{r.projectName}</span>,
    },
    {
      id: "name",
      header: "Stock Opname",
      sortValue: (r) => r.name,
      cell: (r) => (
        <Link
          href={`/app/so/${r.id}`}
          className="block truncate font-medium text-foreground transition-colors hover:text-primary"
        >
          {r.name}
        </Link>
      ),
      className: "min-w-[200px]",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (r) => <span className="text-xs text-muted-foreground">{r.warehouseName}</span>,
    },
    {
      id: "created",
      header: "Created",
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(r.createdAt)}
        </span>
      ),
    },
    {
      id: "detail",
      header: "",
      align: "right",
      cell: (r) => (
        <Link
          href={`/app/so/${r.id}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          aria-label={`Open ${r.name}`}
        >
          <ArrowUpRight size={15} strokeWidth={2} />
        </Link>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Opname"

      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Total stock opnames",
            value: visibleProjects.length,
            icon: <FolderOpen size={16} strokeWidth={2} />,
            iconClass: "bg-primary text-primary-foreground",
            chip: "All",
            tone: "text-foreground",
          },
          {
            label: "In Progress",
            value: counts.active,
            icon: <Loader2 size={16} strokeWidth={2} />,
            iconClass: "bg-muted text-foreground",
            chip: "Active",
            tone: "text-foreground",
          },
          {
            label: "Final",
            value: counts.final,
            icon: <CheckCircle2 size={16} strokeWidth={2} />,
            iconClass: "bg-emerald-100 text-emerald-700",
            chip: "Completed",
            tone: "text-foreground",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-md border border-zinc-400 p-4">
            <div className="flex items-center justify-between">
              <span
                className={cx(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md",
                  s.iconClass
                )}
              >
                {s.icon}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-muted-foreground ring-1 ring-inset ring-border">
                {s.chip}
              </span>
            </div>
            <p className={cx("mt-3.5 font-mono text-xl font-semibold leading-none tracking-tight", s.tone)}>
              {s.value}
            </p>
            <p className="mt-1.5 text-[12px] font-medium text-muted-foreground">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {canCreate && (
        <div className="mb-4 flex justify-end">
          <Link href="/app/projects/new">
            <Button variant="primary">
              <Plus size={15} strokeWidth={2} />
              Create Project
            </Button>
          </Link>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search stock opname..."
        getSearchText={(r) => `${r.name} ${r.id} ${r.projectName} ${r.warehouseName}`}
        initialSort={{ id: "created", dir: "desc" }}
        minWidth={800}
        emptyIcon={<Folder size={26} strokeWidth={2} />}
        emptyTitle="No stock opnames yet"
        emptyDescription="Create your first stock opname to start the stock counting process."
      />
    </div>
  );
}