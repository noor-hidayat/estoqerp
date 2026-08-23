"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeftRight,
  CircleAlert,
  ScanLine,
  Warehouse as WarehouseIcon,
} from "lucide-react";
import {
  useOpnameProject,
  useOpnameStats,
  useProjectScans,
  useOpnameProjectDetail,
} from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatId, formatNumber, timeAgo } from "@/lib/utils";
import { Stat } from "@/components/ui/stat";
import { ShellLoader } from "@/components/ui/loader";
import { AccessDenied } from "@/components/ui/role-guard";

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const { isSystem, permissions } = useSession();
  const { data: project, isLoading: projectLoading } = useOpnameProject(params.id);
  const { data: stats, isLoading: statsLoading } = useOpnameStats(params.id);
  const { data: scansData, isLoading: scansLoading } = useProjectScans(params.id);
  const { data: detail, isLoading: detailLoading } = useOpnameProjectDetail(params.id);

  const canView = (menu: string) => can(isSystem, permissions, menu, "view");
  const canSessions = canView("opname.detail.sessions");
  const canScan = canView("opname.detail.scan");
  const canVariance = canView("opname.detail.variance");

  if (!canView("opname.detail")) {
    return <AccessDenied />;
  }

  if (projectLoading || statsLoading || scansLoading || detailLoading) return <ShellLoader />;
  if (!project) return null;

  const scans = scansData?.scans ?? [];
  const variance = stats?.variance ?? [];
  const progress = stats?.progress ?? { total: 0, counted: 0, pct: 0 };
  const totalScanned = variance.reduce((acc, r) => acc + r.countedQty, 0);
  const diffItems = variance.filter((r) => r.diff !== 0);
  const warehouses = detail?.warehouses ?? [];

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          compact
          label="Location progress"
          value={`${progress.pct}%`}
          sub={`${progress.counted}/${progress.total} locations counted`}
          icon={<ScanLine size={16} strokeWidth={2} />}
          accent
        />
        <Stat
          compact
          label="Qty counted"
          value={formatNumber(totalScanned)}
          sub={`${scansData?.totalBarcodes ?? 0} barcodes scanned`}
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Items with variance"
          value={diffItems.length}
          sub={diffItems.length > 0 ? "Needs review" : "All match"}
          icon={<CircleAlert size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Scan records"
          value={scans.length}
          sub={`${warehouses.length} warehouses`}
          icon={<ArrowLeftRight size={16} strokeWidth={2} />}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_10px_30px_-12px_rgb(17_17_17/0.08)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                Scan history
              </h2>
              {canSessions && (
                <Link
                  href={`/app/so/${project.id}/sessions`}
                  className="text-[12px] font-medium text-primary hover:text-primary/80"
                >
                  View all
                </Link>
              )}
            </div>

            {scans.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No scans yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {scans.slice(0, 10).map((s, i) => (
                  <Link
                    key={s.id}
                    href={
                      canScan
                        ? `/app/so/${project.id}/scan`
                        : `/app/so/${project.id}/sessions/${s.id}`
                    }
                    className={`grid grid-cols-[110px_1fr_72px_90px_110px_96px] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60 ${
                      i % 2 === 1 ? "bg-muted/40" : ""
                    }`}
                  >
                    <span className="truncate font-mono text-[11px] font-semibold tracking-tight text-muted-foreground">
                      {formatId(s.id)}
                    </span>
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {s.lastItemName}
                    </span>
                    <span className="truncate font-mono text-[11px] text-muted-foreground">
                      {(s.locations ?? []).join(", ")}
                    </span>
                    <span className="text-right font-mono text-[13px] font-semibold text-foreground">
                      {formatNumber(s.qty ?? 0)}
                    </span>
                    <span className="truncate text-[11.5px] text-muted-foreground">
                      {s.userName}
                    </span>
                    <span className="truncate text-right text-[11px] text-muted-foreground">
                      {timeAgo(s.startedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {warehouses.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Warehouses
                </h2>
              </div>
              <div className="divide-y divide-border">
                {warehouses.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <WarehouseIcon size={15} strokeWidth={2} className="shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {w.warehouseName ?? "—"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {w.branchName ?? "—"} · {w.countedLokasi ?? 0}/{w.totalLokasi ?? 0} locations
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                      {w.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Top variance
            </h3>
            {canVariance && (
              <Link
                href={`/app/so/${project.id}/variance`}
                className="text-[12px] font-medium text-primary hover:text-primary/80"
              >
                View all
              </Link>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card">
            {variance.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No variance data yet.
              </p>
            )}
            {variance.slice(0, 7).map((row) => {
              const d = row.diff;
              return (
                <div
                  key={`${row.itemId}-${row.warehouseId}`}
                  className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {row.itemName ?? "—"}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {row.warehouseName} · system {formatNumber(row.systemQty)} → physical{" "}
                      {formatNumber(row.countedQty)}
                    </p>
                  </div>
                  <span
                    className={
                      "shrink-0 font-mono text-[13px] font-semibold " +
                      (d === 0
                        ? "text-muted-foreground"
                        : d > 0
                          ? "text-emerald-600"
                          : "text-destructive")
                    }
                  >
                    {d > 0 ? `+${formatNumber(d)}` : formatNumber(d)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}