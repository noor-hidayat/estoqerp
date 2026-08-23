"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Folder,
  FolderOpen,
  Loader2,
  Plus,
} from "lucide-react";
import { useOpnameProjects } from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatDate, timeAgo, cx } from "@/lib/utils";
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

const WH_STATUS_OPTIONS = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

interface OpnameWhRow {
  opnameId: string;
  projectName: string;
  warehouseId: string;
  warehouseName: string;
  status: string;
  pct: number;
  countedLokasi: number;
  totalLokasi: number;
  createdAt: string;
}

export default function OpnameProjectsPage() {
  const { isSystem, permissions } = useSession();
  const canCreate = can(isSystem, permissions, "opname", "create");
  const { data: projects = [], isLoading: projectsIsLoading } = useOpnameProjects();
  const [filters, setFilters] = useState<FilterRule[]>([]);

  const rows: OpnameWhRow[] = useMemo(() => {
    const out: OpnameWhRow[] = [];
    for (const p of projects) {
      for (const w of p.warehouses) {
        out.push({
          opnameId: p.id,
          projectName: p.name,
          warehouseId: w.warehouseId,
          warehouseName: w.warehouseName,
          status: w.status,
          pct: w.pct ?? 0,
          countedLokasi: w.countedLokasi ?? 0,
          totalLokasi: w.totalLokasi ?? 0,
          createdAt: p.createdAt,
        });
      }
    }
    return out.sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) ||
        a.projectName.localeCompare(b.projectName) ||
        a.warehouseName.localeCompare(b.warehouseName)
    );
  }, [projects]);

  const counts = useMemo(() => {
    const active = projects.filter((p) => p.status === "IN_PROGRESS").length;
    const final = projects.filter((p) => p.status === "APPROVED").length;
    return { active, final };
  }, [projects]);

  const filterFields = useMemo<FilterBuilderField[]>(() => {
    const projectNames = [...new Set(rows.map((r) => r.projectName))].sort((a, b) => a.localeCompare(b));
    const warehouseNames = [...new Set(rows.map((r) => r.warehouseName))].filter(Boolean).sort();
    return [
      {
        key: "projectName",
        label: "Project Name",
        type: "text",
        values: projectNames.map((v) => ({ value: v, label: v })),
      },
      {
        key: "warehouse",
        label: "Warehouse",
        type: "select",
        options: warehouseNames.map((v) => ({ value: v, label: v })),
      },
      { key: "pct", label: "Progress", type: "number" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: WH_STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
      },
      { key: "createdAt", label: "Created", type: "date" },
    ];
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (filters.length === 0) return rows;
    const valueOf = (r: OpnameWhRow, key: string): unknown => {
      switch (key) {
        case "projectName":
          return r.projectName;
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

  const columns: DataTableColumn<OpnameWhRow>[] = [
    {
      id: "project",
      header: "Project",
      sortValue: (r) => r.projectName,
      cell: (r) => (
        <Link
          href={`/app/so/${r.opnameId}`}
          className="block truncate font-medium text-foreground transition-colors hover:text-primary"
        >
          {r.projectName}
        </Link>
      ),
      className: "min-w-[200px]",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseName,
      cell: (r) => <span className="text-xs text-foreground">{r.warehouseName}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => <StatusBadge status={r.status} />,
    },
    {
      id: "progress",
      header: "Progress",
      sortValue: (r) => r.pct,
      cell: (r) => (
        <div className="flex min-w-44 items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cx("h-full rounded-full", r.pct >= 100 ? "bg-primary" : "bg-primary/70")}
              style={{ width: `${r.pct}%` }}
            />
          </div>
          <span className="shrink-0 font-mono text-[11.5px] font-semibold text-muted-foreground">
            {r.pct}%
          </span>
          <span className="shrink-0 text-[10.5px] text-muted-foreground">
            {r.countedLokasi}/{r.totalLokasi}
          </span>
        </div>
      ),
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
          href={`/app/so/${r.opnameId}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          aria-label={`Open ${r.projectName}`}
        >
          <ArrowUpRight size={15} strokeWidth={2} />
        </Link>
      ),
    },
  ];

  if (projectsIsLoading) return <ShellLoader />;

  return (
    <div>
      <PageHeader
        title="Stock Opname"
        actions={
          canCreate ? (
            <Button size="sm" className="h-7 px-2.5 text-xs" asChild>
              <Link href="/app/project/new">
                <Plus size={14} strokeWidth={2} />
                Create Project
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Total stock opnames",
            value: projects.length,
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

      <DataTable
        columns={columns}
        data={filteredRows}
        getRowId={(r) => `${r.opnameId}:${r.warehouseId}`}
        searchPlaceholder="Search opname per gudang..."
        getSearchText={(r) => `${r.projectName} ${r.warehouseName} ${r.status}`}
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
