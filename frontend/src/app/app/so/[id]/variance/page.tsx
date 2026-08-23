"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Scale,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { useOpnameProject, useOpnameStats, useUpdateOpnameProject } from "@/lib/api/query";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { AccessDenied } from "@/components/ui/role-guard";
import { cx } from "@/lib/utils";

interface VarianceRow {
  itemId: string;
  itemName: string;
  itemCode: string;
  unit: string;
  warehouseName: string;
  systemQty: number;
  countedQty: number;
  diff: number;
}

export default function ProjectVariancePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { isSystem, permissions } = useSession();

  const { data: project, isLoading: projectLoading } = useOpnameProject(id);
  const { data: projectStats } = useOpnameStats(id);
  const updateProject = useUpdateOpnameProject();

  const [onlyDiff, setOnlyDiff] = useState(true);

  if (!can(isSystem, permissions, "opname.detail.variance", "view")) {
    return <AccessDenied />;
  }

  if (projectLoading) return <ShellLoader />;
  if (!project) return null;

  const rows = projectStats?.variance ?? [];

  const filtered: VarianceRow[] = onlyDiff ? rows.filter((r) => r.diff !== 0) : rows;
  const totalSystem = rows.reduce((a, r) => a + r.systemQty, 0);
  const totalCounted = rows.reduce((a, r) => a + r.countedQty, 0);
  const diffItems = rows.filter((r) => r.diff !== 0).length;
  const canFinalize =
    can(isSystem, permissions, "opname", "update") && project.status === "IN_PROGRESS";

  const finalize = () => {
    void updateProject.mutateAsync({
      id: project.id,
      patch: { status: "APPROVED" },
    });
  };

  const columns: DataTableColumn<VarianceRow>[] = [
    {
      id: "item",
      header: "Item",
      sortValue: (r) => r.itemName,
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-foreground">{r.itemName}</p>
          <p className="font-mono text-[10.5px] text-muted-foreground">
            {r.itemCode} · {r.unit}
          </p>
        </div>
      ),
      className: "min-w-[220px]",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseName,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.warehouseName}</span>,
    },
    {
      id: "system",
      header: "System Qty",
      align: "right",
      sortValue: (r) => r.systemQty,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{formatNumber(r.systemQty)}</span>,
    },
    {
      id: "counted",
      header: "Physical Qty",
      align: "right",
      sortValue: (r) => r.countedQty,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{formatNumber(r.countedQty)}</span>,
    },
    {
      id: "diff",
      header: "Variance",
      align: "right",
      sortValue: (r) => r.diff,
      cell: (r) => {
        const d = r.diff;
        return (
          <span
            className={cx(
              "font-mono text-xs font-semibold tabular-nums",
              d === 0
                ? "text-muted-foreground"
                : d > 0
                  ? "text-emerald-600"
                  : "text-destructive"
            )}
          >
            {d > 0 ? `+${formatNumber(d)}` : formatNumber(d)}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => {
        const d = r.diff;
        return (
          <Badge
            tone={d === 0 ? "neutral" : d > 0 ? "emerald" : "red"}
            dot
          >
            {d === 0
              ? "Match"
              : d > 0
                ? "Excess"
                : "Shortage"}
          </Badge>
        );
      },
    },
  ];

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">System qty</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {formatNumber(totalSystem)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Stock reference in stock balance
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Physical qty counted</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-600">
            {formatNumber(totalCounted)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            From scan results
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Items with variance</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {diffItems}
            <span className="ml-1 text-sm font-medium text-muted-foreground">
              of {rows.length} items
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Needs rechecking
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnlyDiff(true)}
            className={cx(
              "rounded-md px-4 py-2 text-[12.5px] font-medium transition-colors",
              onlyDiff
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
            )}
          >
            Only variance
          </button>
          <button
            onClick={() => setOnlyDiff(false)}
            className={cx(
              "rounded-md px-4 py-2 text-[12.5px] font-medium transition-colors",
              !onlyDiff
                ? "bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
            )}
          >
            All items
          </button>
        </div>

        {canFinalize && (
          <Button variant="secondary" onClick={finalize}>
            Mark as Final
            <ArrowRight size={15} strokeWidth={2} />
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(r) => `${r.itemId}-${r.warehouseName}`}
        searchPlaceholder="Search items..."
        getSearchText={(r) => `${r.itemName} ${r.itemCode} ${r.warehouseName}`}
        minWidth={860}
        emptyIcon={<CheckCircle2 size={26} strokeWidth={2} />}
        emptyTitle="No variance"
        emptyDescription="All items match system stock. Add a scan if needed."
      />

      {filtered.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
          <Scale size={14} strokeWidth={2} />
          Variance is calculated automatically from total scan per item per warehouse vs system
          stock balance.
        </p>
      )}
    </div>
  );
}