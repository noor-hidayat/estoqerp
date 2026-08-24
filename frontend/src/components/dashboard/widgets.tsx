"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Barcode,
  ChevronRight,
  ClipboardList,
  Gauge,
  Package,
  ScanLine,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatId, formatNumber, relativeTime } from "@/lib/utils";
import {
  StockOpnameChart,
  type WarehouseOpnameRow,
} from "@/components/dashboard/stock-opname-chart";
import { VarianceSummary } from "@/components/dashboard/variance-summary";
import { useStockBalanceSummary } from "@/lib/api/query";
import type { ProjectStatus } from "@/types";

export interface DashboardData {
  active: number;
  final: number;
  totalScan: number;
  totalItems: number;
  progressPct: number;
  progressCounted: number;
  progressTotal: number;
  recentSessions: {
    id: string;
    code: string;
    product: string;
    qty: number;
    scannedBy: string;
    at: string;
  }[];
  projectProgressRows: {
    id: string;
    name: string;
    pct: number;
    warehouse: string;
    counted: number;
    total: number;
    status: ProjectStatus;
  }[];
  warehouseOpname: WarehouseOpnameRow[];
}

export interface WidgetProps {
  data: DashboardData;
  dragHandle?: ReactNode;
}

// ---------------------------------------------------------------------------
// KPI SUMMARY
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  icon,
  tone = "primary",
  dragHandle,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "primary" | "emerald" | "sky";
  dragHandle?: ReactNode;
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-50 text-emerald-600",
    sky: "bg-sky-50 text-sky-600",
  } as const;
  return (
    <Card className="@container/card">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardDescription>{label}</CardDescription>
          <CardTitle className="mt-1 text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {value}
          </CardTitle>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {dragHandle}
          <div
            className={cn(
              "flex size-9 items-center justify-center rounded-lg",
              tones[tone]
            )}
          >
            {icon}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

type KpiTone = "primary" | "emerald" | "sky";

function KpiWidget({
  label,
  value,
  icon,
  tone = "primary",
  dragHandle,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: KpiTone;
  dragHandle?: ReactNode;
}) {
  return (
    <MetricCard
      label={label}
      value={value}
      icon={icon}
      tone={tone}
      dragHandle={dragHandle}
    />
  );
}

export function KpiActiveProjectsWidget({ data, dragHandle }: WidgetProps) {
  return (
    <KpiWidget
      label="Active Projects"
      value={formatNumber(data.active)}
      icon={<ClipboardList size={17} strokeWidth={2} />}
      dragHandle={dragHandle}
    />
  );
}

export function KpiTotalScansWidget({ data, dragHandle }: WidgetProps) {
  return (
    <KpiWidget
      label="Total Scans"
      value={formatNumber(data.totalScan)}
      icon={<ScanLine size={17} strokeWidth={2} />}
      tone="emerald"
      dragHandle={dragHandle}
    />
  );
}

export function KpiProgressWidget({ data, dragHandle }: WidgetProps) {
  return (
    <KpiWidget
      label="Progress"
      value={`${data.progressPct}%`}
      icon={<Gauge size={17} strokeWidth={2} />}
      tone="sky"
      dragHandle={dragHandle}
    />
  );
}

export function KpiTotalItemsWidget({ data, dragHandle }: WidgetProps) {
  return (
    <KpiWidget
      label="Total Items"
      value={formatNumber(data.totalItems)}
      icon={<Package size={17} strokeWidth={2} />}
      dragHandle={dragHandle}
    />
  );
}

// ---------------------------------------------------------------------------
// STOCK OPNAME CHART
// ---------------------------------------------------------------------------

const CHART_LIMIT = 7;

export function StockOpnameChartWidget({ data, dragHandle }: WidgetProps) {
  const [expanded, setExpanded] = useState(false);
  const wh = data.warehouseOpname;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Stock Opname per Warehouse</CardTitle>
        <div className="flex items-center gap-1">
          {dragHandle}
          {wh.length > CHART_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 text-primary"
            >
              {expanded ? "Collapse" : `View all (${wh.length})`}
              <ChevronRight
                size={13}
                strokeWidth={2.5}
                className={cn(
                  "transition-transform",
                  expanded && "rotate-90"
                )}
              />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {wh.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No warehouse data yet.
          </p>
        ) : (
          <StockOpnameChart warehouses={wh} expanded={expanded} />
        )}
      </CardContent>
      <CardFooter className="flex items-center justify-center gap-6 border-t text-sm">
        <span className="flex items-center gap-2 font-medium leading-none">
          <span className="size-2.5 rounded-sm bg-[var(--chart-1)]" />
          Opname Result
        </span>
        <span className="flex items-center gap-2 font-medium leading-none">
          <span className="size-2.5 rounded-sm bg-[var(--chart-2)]" />
          System Stock
        </span>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// VARIANCE SUMMARY
// ---------------------------------------------------------------------------

export function VarianceSummaryWidget({ data, dragHandle }: WidgetProps) {
  return (
    <VarianceSummary warehouses={data.warehouseOpname} dragHandle={dragHandle} />
  );
}

// ---------------------------------------------------------------------------
// RECENT ACTIVITY
// ---------------------------------------------------------------------------

export function RecentActivityWidget({ data, dragHandle }: WidgetProps) {
  const sessions = data.recentSessions;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Recent Activity</CardTitle>
        <div className="flex items-center gap-2">
          {dragHandle}
          <Badge tone="success" dot>
            Live
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No scan sessions yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-6 py-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Barcode size={14} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatId(s.code)}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {s.product}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.scannedBy} · {formatNumber(s.qty)} scanned
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(s.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CardFooter className="border-t px-6 py-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-primary"
        >
          <Link href="/app/report/history">
            View all activity
            <ChevronRight size={13} strokeWidth={2.5} />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PROJECT PROGRESS
// ---------------------------------------------------------------------------

export function ProjectProgressWidget({ data, dragHandle }: WidgetProps) {
  const rows = data.projectProgressRows;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Project Progress</CardTitle>
        {dragHandle}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No projects yet.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((p) => {
              const done = p.pct >= 100;
              return (
                <Link
                  key={p.id}
                  href={`/app/so?projectId=${p.id}`}
                  className="group block px-6 py-4 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[13px] font-semibold text-foreground group-hover:text-primary">
                      {p.name}
                    </p>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="font-mono text-[12.5px] font-bold text-foreground">
                        {p.pct}%
                      </span>
                      <StatusBadge status={done ? "APPROVED" : p.status} />
                    </div>
                  </div>
                  <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${p.pct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-3">
                    <p className="truncate text-[11px] text-muted-foreground">
                      {p.warehouse} · {p.counted} of {p.total} locations
                      completed
                    </p>
                    <ArrowUpRight
                      size={13}
                      strokeWidth={2.5}
                      className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// STOCK ON HAND
// ---------------------------------------------------------------------------

export function StockOnHandWidget({ dragHandle }: WidgetProps) {
  const { data: summary, isLoading } = useStockBalanceSummary();
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Stock on Hand</CardTitle>
        {dragHandle}
      </CardHeader>
      <CardContent>
        {isLoading || !summary ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : (
          <div>
            <p className="text-3xl font-semibold tabular-nums">
              {formatNumber(summary.totalQty)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              total unit stok sistem
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4 text-center">
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {formatNumber(summary.totalItems)}
                </p>
                <p className="text-[11px] text-muted-foreground">Jenis item</p>
              </div>
              <div>
                <p className="text-lg font-semibold tabular-nums">
                  {formatNumber(summary.totalRows)}
                </p>
                <p className="text-[11px] text-muted-foreground">Baris saldo</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="border-t px-6 py-3">
        <Button asChild variant="ghost" size="sm" className="text-primary">
          <Link href="/app/inventory/balance">
            View stock balance
            <ChevronRight size={13} strokeWidth={2.5} />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// REGISTRY + DEFAULT LAYOUT
// ---------------------------------------------------------------------------

export type WidgetId =
  | "kpi-active-projects"
  | "kpi-total-scans"
  | "kpi-progress"
  | "kpi-total-items"
  | "stock-opname-chart"
  | "variance-summary"
  | "recent-activity"
  | "stock-on-hand"
  | "project-progress";

export const WIDGETS: Record<
  WidgetId,
  { title: string; defaultSpan: number; Component: (p: WidgetProps) => ReactNode }
> = {
  "kpi-active-projects": {
    title: "Active Projects",
    defaultSpan: 1,
    Component: KpiActiveProjectsWidget,
  },
  "kpi-total-scans": {
    title: "Total Scans",
    defaultSpan: 1,
    Component: KpiTotalScansWidget,
  },
  "kpi-progress": {
    title: "Progress",
    defaultSpan: 1,
    Component: KpiProgressWidget,
  },
  "kpi-total-items": {
    title: "Total Items",
    defaultSpan: 1,
    Component: KpiTotalItemsWidget,
  },
  "stock-opname-chart": {
    title: "Stock Opname per Warehouse",
    defaultSpan: 2,
    Component: StockOpnameChartWidget,
  },
  "variance-summary": {
    title: "Variance Summary",
    defaultSpan: 1,
    Component: VarianceSummaryWidget,
  },
  "recent-activity": {
    title: "Recent Activity",
    defaultSpan: 2,
    Component: RecentActivityWidget,
  },
  "stock-on-hand": {
    title: "Stock on Hand",
    defaultSpan: 1,
    Component: StockOnHandWidget,
  },
  "project-progress": {
    title: "Project Progress",
    defaultSpan: 2,
    Component: ProjectProgressWidget,
  },
};

export const DEFAULT_LAYOUT: { order: WidgetId[]; hidden: WidgetId[] } = {
  order: [
    "kpi-active-projects",
    "kpi-total-scans",
    "kpi-progress",
    "kpi-total-items",
    "stock-opname-chart",
    "variance-summary",
    "recent-activity",
    "stock-on-hand",
    "project-progress",
  ],
  hidden: [],
};
