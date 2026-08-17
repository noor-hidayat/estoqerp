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
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/lib/api/query";
import { cn, formatId, formatNumber, relativeTime } from "@/lib/utils";
import {
  StockOpnameChart,
  type WarehouseOpnameRow,
} from "@/components/dashboard/stock-opname-chart";
import { VarianceSummary } from "@/components/dashboard/variance-summary";

function MetricCard({
  label,
  value,
  icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "primary" | "emerald" | "sky";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-50 text-emerald-600",
    sky: "bg-sky-50 text-sky-600",
  } as const;
  return (
    <Card className="@container/card">
      <CardHeader className="relative">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="mt-1 text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        <div
          className={cn(
            "absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg",
            tones[tone]
          )}
        >
          {icon}
        </div>
      </CardHeader>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex items-center justify-end">
        <Skeleton className="h-8 w-44 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: dashboard, isLoading, isError } = useDashboard();
  const [chartExpanded, setChartExpanded] = useState(false);

  const recentSessions = dashboard?.recentSessions ?? [];

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !dashboard) {
    return (
      <Card className="flex min-h-[50vh] flex-col items-center justify-center p-14 text-center">
        <p className="text-lg font-semibold text-foreground">
          Dashboard could not be loaded
        </p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Your role may not have access to this page.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/app/project/so">Open Projects</Link>
        </Button>
      </Card>
    );
  }

  const whOpname: WarehouseOpnameRow[] = dashboard.warehouseOpname ?? [];
  const LIMIT = 7;

  return (
    <div className="space-y-6">
      {/* ===== KPI SUMMARY ===== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Active Projects"
          value={formatNumber(dashboard.active)}
          icon={<ClipboardList size={17} strokeWidth={2} />}
        />
        <MetricCard
          label="Total Scans"
          value={formatNumber(dashboard.totalScan)}
          icon={<ScanLine size={17} strokeWidth={2} />}
          tone="emerald"
        />
        <MetricCard
          label="Progress"
          value={`${dashboard.progressPct}%`}
          icon={<Gauge size={17} strokeWidth={2} />}
          tone="sky"
        />
        <MetricCard
          label="Total Items"
          value={formatNumber(dashboard.totalItems)}
          icon={<Package size={17} strokeWidth={2} />}
        />
      </div>

      {/* ===== ANALYTICS: CHART + VARIANCE ===== */}
      <section className="grid items-start gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Stock Opname per Warehouse</CardTitle>
            {whOpname.length > LIMIT && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChartExpanded((v) => !v)}
                className="shrink-0 text-primary"
              >
                {chartExpanded ? "Collapse" : `View all (${whOpname.length})`}
                <ChevronRight
                  size={13}
                  strokeWidth={2.5}
                  className={cn(
                    "transition-transform",
                    chartExpanded && "rotate-90"
                  )}
                />
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {whOpname.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No warehouse data yet.
              </p>
            ) : (
              <StockOpnameChart
                warehouses={whOpname}
                expanded={chartExpanded}
              />
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

        <VarianceSummary warehouses={whOpname} />
      </section>

      {/* ===== BOTTOM: ACTIVITY + PROGRESS ===== */}
      <section className="grid items-start gap-5 lg:grid-cols-2">
        {/* AKTIVITAS TERBARU */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Activity</CardTitle>
            <Badge tone="success" dot>
              Live
            </Badge>
          </CardHeader>

          <CardContent className="p-0">
            {recentSessions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No scan sessions yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {recentSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 px-6 py-3.5"
                  >
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

        {/* PROJECT PROGRESS */}
        <Card>
          <CardHeader>
            <CardTitle>Project Progress</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {dashboard.projectProgressRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No projects yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {dashboard.projectProgressRows.map((p) => {
                  const done = p.pct >= 100;
                  return (
                    <Link
                      key={p.id}
                      href={`/app/project/${p.id}`}
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
                          <StatusBadge
                            status={done ? "APPROVED" : p.status}
                          />
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
      </section>
    </div>
  );
}