import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Folder, X } from "lucide-react";
import { useOpnameProjects } from "@/lib/api/query";
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

export default function ProjectWarehousePage() {
  const { data: projects = [], isLoading: projectsIsLoading } = useOpnameProjects();
  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const projectIdParam = searchParams.get("projectId");
  const prevProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (projectsIsLoading || projects.length === 0) return;
    const param = projectIdParam;
    if (param) {
      const proj = projects.find((p) => p.id === param);
      if (!proj) return;
      if (prevProjectIdRef.current !== param) {
        setFilters([{ id: crypto.randomUUID(), field: "projectName", operator: "is", values: [proj.name] }]);
        prevProjectIdRef.current = param;
      }
    } else if (prevProjectIdRef.current !== null) {
      setFilters([]);
      prevProjectIdRef.current = null;
    }
  }, [projectIdParam, projects, projectsIsLoading]);

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
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseName,
      cell: (r) => <span className="block truncate text-xs text-foreground">{r.warehouseName}</span>,
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
      id: "project",
      header: "Project",
      sortValue: (r) => r.projectName,
      cell: (r) => <span className="block truncate text-xs text-foreground">{r.projectName}</span>,
      className: "min-w-[200px]",
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
  ];

  if (projectsIsLoading) return <ShellLoader />;

  return (
    <div>
      <PageHeader title="Project Warehouse" />

      <DataTable
        columns={columns}
        data={filteredRows}
        getRowId={(r) => `${r.opnameId}:${r.warehouseId}`}
        searchPlaceholder="Search opname per gudang..."
        getSearchText={(r) => `${r.projectName} ${r.warehouseName} ${r.status}`}
        filterable={false}
        filters={
          <div className="flex items-center gap-1.5">
            <FilterBuilder
              fields={filterFields}
              filters={filters}
              onChange={setFilters}
            />
            {filters.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shadow-none"
                onClick={() => {
                  setFilters([]);
                  if (searchParams.has("projectId")) {
                    const next = new URLSearchParams(searchParams);
                    next.delete("projectId");
                    setSearchParams(next, { replace: true });
                    prevProjectIdRef.current = null;
                  }
                }}
                aria-label="Reset filter"
                title="Reset filter"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
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