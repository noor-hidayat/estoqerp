"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import {
  useOpnameProjects,
} from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { cx } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/ui/role-guard";

interface VarianceStats {
  projectId: string;
  progress: { total: number; counted: number; pct: number };
  variance: { itemId: string; itemCode: string; itemName: string; unit: string; warehouseId: string; warehouseName: string; systemQty: number; countedQty: number; diff: number }[];
}

interface VarianceRow {
  projectId: string;
  projectName: string;
  warehouseName: string;
  itemCode: string;
  itemName: string;
  diff: number;
}

export default function VarianceReviewPage() {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("projectId") ?? "";
  const [projectId, setProjectId] = useState(urlProjectId || "all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (urlProjectId) setProjectId(urlProjectId);
  }, [urlProjectId]);

  const { data: projects = [] } = useOpnameProjects();

  const targetProjects = useMemo(
    () =>
      projectId === "all"
        ? projects
        : projects.filter((p) => p.id === projectId),
    [projects, projectId]
  );

  const statsQueries = useQueries({
    queries: targetProjects.map((project) => ({
      queryKey: ["opname-stats", project.id],
      queryFn: () => api.get<VarianceStats>(`/opname-projects/${project.id}/stats`),
      staleTime: 30_000,
    })),
  });

  const rows = useMemo(() => {
    return targetProjects.flatMap((project, i) => {
      const data = statsQueries[i]?.data;
      if (!data?.variance) return [];
      return data.variance
        .map((r) => ({
          projectId: project.id,
          projectName: project.name,
          warehouseName: r.warehouseName,
          itemCode: r.itemCode,
          itemName: r.itemName,
          diff: r.diff,
        }))
        .filter((r) => r.diff !== 0);
    }).filter((r) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return r.itemName.toLowerCase().includes(q) || r.itemCode.includes(q);
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [targetProjects, statsQueries, query]);

  const { isSystem, permissions } = useSession();

  if (!can(isSystem, permissions, "opname.variance", "view")) {
    return <AccessDenied />;
  }

  const anyLoading = statsQueries.some((q) => q.isLoading);

  const totalDiff = rows.reduce((a, r) => a + r.diff, 0);

  const columns: DataTableColumn<VarianceRow>[] = [
    {
      id: "code",
      header: "Item Code",
      sortValue: (r) => r.itemCode,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.itemCode}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "name",
      header: "Item Name",
      sortValue: (r) => r.itemName,
      cell: (r) => <span className="font-medium text-foreground">{r.itemName}</span>,
      className: "min-w-[200px]",
    },
    {
      id: "project",
      header: "Project",
      sortValue: (r) => r.projectName,
      cell: (r) => (
        <Link
          href={`/app/so/${r.projectId}`}
          className="text-[13px] text-muted-foreground transition-colors hover:text-primary"
        >
          {r.projectName}
        </Link>
      ),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      cell: (r) => <span className="text-xs text-muted-foreground">{r.warehouseName}</span>,
    },
    {
      id: "diff",
      header: "Variance",
      align: "right",
      sortValue: (r) => r.diff,
      cell: (r) => (
        <span
          className={cx(
            "font-mono text-xs font-semibold tabular-nums",
            r.diff === 0
              ? "text-muted-foreground"
              : r.diff > 0
                ? "text-emerald-600"
                : "text-destructive"
          )}
        >
          {r.diff > 0 ? `+${formatNumber(r.diff)}` : formatNumber(r.diff)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Variance Review"

      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => `${r.projectId}-${r.itemCode}`}
        loading={anyLoading}
        searchPlaceholder="Search item / project..."
        searchValue={query}
        onSearchChange={setQuery}
        filters={
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="h-8 w-60 text-xs"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        }
        footerLeft={
          <Badge tone={totalDiff >= 0 ? "emerald" : "red"} dot>
            Total variance:{" "}
            <span className="font-mono">
              {totalDiff >= 0 ? `+${formatNumber(totalDiff)}` : formatNumber(totalDiff)}
            </span>
          </Badge>
        }
        minWidth={760}
        emptyIcon={<Scale size={26} strokeWidth={2} />}
        emptyTitle="No variance"
        emptyDescription="No items with variance for this filter."
        onResetFilters={() => {
          setQuery("");
          setProjectId("all");
        }}
      />
    </div>
  );
}