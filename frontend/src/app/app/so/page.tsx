"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  Folder,
  FolderOpen,
  Loader2,
  Plus,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useProjects, useAllWarehouses } from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatDate, timeAgo, cx } from "@/lib/utils";
import { STATUS_LABELS } from "@/lib/compute";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";
import {
  FilterBuilder,
  matchesFilterRule,
  type FilterBuilderField,
  type FilterRule,
} from "@/components/ui/filter-builder";

interface OpnameRow {
  id: string;
  projectId: string | null;
  name: string;
  warehouseName: string;
  createdAt: string;
  status: string;
  pct: number;
}

export default function OpnameProjectsPage() {
  const { access, isSystem, permissions } = useSession();
  const canCreate = can(isSystem, permissions, "opname", "create");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: projectsList = [], isLoading: projectsIsLoading } = useProjects();
  const { data: warehouses = [] } = useAllWarehouses();

  const [filters, setFilters] = useState<FilterRule[]>(() => {
    const projectId = searchParams.get("projectId");
    return projectId
      ? [{ id: "project-seed", field: "project", operator: "is", values: [projectId] }]
      : [];
  });

  useEffect(() => {
    if (searchParams.get("projectId")) router.replace("/app/so");
  }, [router, searchParams]);

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

  const statsQueries = useQueries({
    queries: projects.map((p) => ({
      queryKey: ["project-stats", p.id] as const,
      queryFn: () =>
        api.get<{ progress: { total: number; counted: number; pct: number } }>(
          `/projects/${p.id}/stats`
        ),
    })),
  });

  const counts = useMemo(() => {
    const active = visibleProjects.filter(
      (p) => p.status === "IN_PROGRESS"
    ).length;
    const final = visibleProjects.filter((p) => p.status === "APPROVED").length;
    return { active, final };
  }, [visibleProjects]);

  const rows: OpnameRow[] = projects.map((p, i) => ({
    id: p.id,
    projectId: p.projectId ?? null,
    name: p.name,
    warehouseName: warehouses.find((w) => w.id === p.warehouseId)?.name ?? "—",
    createdAt: p.createdAt,
    status: p.status,
    pct: statsQueries[i]?.data?.progress?.pct ?? 0,
  }));

  const filterFields = useMemo<FilterBuilderField[]>(() => {
    const names = [...new Set(projects.map((p) => p.name))].sort((a, b) =>
      a.localeCompare(b)
    );
    const ids = [...new Set(projects.map((p) => p.id))].sort();
    const parentIds = [
      ...new Set(projects.map((p) => p.projectId).filter(Boolean) as string[]),
    ].sort();
    return [
      {
        key: "project",
        label: "Project",
        type: "text",
        values: parentIds.map((v) => ({ value: v, label: v })),
      },
      {
        key: "name",
        label: "Project Name",
        type: "text",
        values: names.map((v) => ({ value: v, label: v })),
      },
      {
        key: "id",
        label: "ID",
        type: "text",
        values: ids.map((v) => ({ value: v, label: v })),
      },
      {
        key: "warehouse",
        label: "Warehouse",
        type: "select",
        options: warehouses.map((w) => ({ value: w.name, label: w.name })),
      },
      { key: "pct", label: "Progress", type: "number" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: (Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map(
          (s) => ({ value: s, label: STATUS_LABELS[s] })
        ),
      },
      { key: "createdAt", label: "Created", type: "date" },
    ];
  }, [projects, warehouses]);

  const filteredRows = useMemo(() => {
    if (filters.length === 0) return rows;
    const valueOf = (r: OpnameRow, key: string): unknown => {
      switch (key) {
        case "project":
          return r.projectId;
        case "name":
          return r.name;
        case "id":
          return r.id;
        case "warehouse":
          return r.warehouseName;
        case "pct":
          return r.pct;
        case "status":
          return r.status;
        case "createdAt":
          return r.createdAt ? r.createdAt.slice(0, 10) : null;
        default:
          return null;
      }
    };
    return rows.filter((r) =>
      filters.every((rule) => matchesFilterRule(valueOf(r, rule.field), rule))
    );
  }, [rows, filters]);

  const columns: DataTableColumn<OpnameRow>[] = [
    {
      id: "id",
        header: "ID",
      sortValue: (r) => r.id,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.id}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "name",
      header: "Project Name",
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
      header: "Project Warehouse",
      cell: (r) => <span className="text-xs text-muted-foreground">{r.warehouseName}</span>,
    },
    {
      id: "progress",
      header: "Progress",
      sortValue: (r) => r.pct,
      cell: (r) => (
        <div className="flex min-w-36 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cx(
                "h-full rounded-full",
                r.pct >= 100 ? "bg-primary" : "bg-primary/70"
              )}
              style={{ width: `${r.pct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11.5px] font-semibold text-muted-foreground">
            {r.pct}%
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      id: "created",
      header: "Created",
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground" title={formatDate(r.createdAt)}>
          {timeAgo(r.createdAt)}
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

  if (projectsIsLoading) return <ShellLoader />;

  return (
    <div>
      <PageHeader title="Stock Opname" />

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
          <Link href="/app/project/new">
            <Button variant="primary">
              <Plus size={15} strokeWidth={2} />
              Create Project
            </Button>
          </Link>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredRows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search stock opname..."
        getSearchText={(r) => `${r.name} ${r.id} ${r.warehouseName} ${r.status}`}
        filterable={false}
        filters={
          <FilterBuilder
            fields={filterFields}
            filters={filters}
            onChange={setFilters}
          />
        }
        initialSort={{ id: "created", dir: "desc" }}
        minWidth={800}
        emptyIcon={<Folder size={26} strokeWidth={2} />}
        emptyTitle="No stock opnames yet"
        emptyDescription="Create your first stock opname to start the stock counting process."
      />
    </div>
  );
}