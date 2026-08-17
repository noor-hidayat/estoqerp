"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeftRight,
  CircleAlert,
  ScanLine,
} from "lucide-react";
import { useProject, useProjectStats, useScanSessions, useScanRecords, useUsers, useItemsList, useLocations } from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatId, formatNumber, relativeTime } from "@/lib/utils";
import { Stat } from "@/components/ui/stat";
import { ShellLoader } from "@/components/ui/loader";
import { AccessDenied } from "@/components/ui/role-guard";

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const { isSystem, permissions } = useSession();
  const { data: project, isLoading: projectLoading } = useProject(params.id);
  const { data: stats, isLoading: statsLoading } = useProjectStats(params.id);
  const { data: sessions = [] } = useScanSessions({ projectId: params.id });
  const { data: recordsData } = useScanRecords({ projectId: params.id, pageSize: 10000 });
  const { data: users = [] } = useUsers();
  const { data: items = [] } = useItemsList();
  const { data: locations = [] } = useLocations();

  const canView = (menu: string) => can(isSystem, permissions, menu, "view");
  const canSessions = canView("opname.detail.sessions");
  const canScan = canView("opname.detail.scan");
  const canVariance = canView("opname.detail.variance");

  if (!canView("opname.detail")) {
    return <AccessDenied />;
  }

  if (projectLoading || statsLoading) return <ShellLoader />;
  if (!project) return null;

  const records = recordsData?.rows ?? [];
  const variance = stats?.variance ?? [];
  const progress = stats?.progress ?? { total: 0, counted: 0, pct: 0 };
  const totalScanned = records.reduce((acc, r) => acc + r.quantity, 0);
  const diffItems = variance.filter((r) => r.diff !== 0);

  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "—";

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
          sub={`${records.length} scan transactions`}
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
          label="Scan sessions"
          value={sessions.length}
          sub={`${sessions.filter((s) => s.status === "ACTIVE").length} active sessions`}
          icon={<ArrowLeftRight size={16} strokeWidth={2} />}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_10px_30px_-12px_rgb(17_17_17/0.08)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
                Scan sessions
              </h2>
              {canSessions && (
                <Link
                  href={`/app/project/so/${project.id}/sessions`}
                  className="text-[12px] font-medium text-primary hover:text-primary/80"
                >
                  View all
                </Link>
              )}
            </div>

            {sessions.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No scan sessions yet.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {sessions.slice(0, 10).map((s, i) => {
                  const recs = records
                    .filter((r) => r.sessionId === s.id)
                    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
                  const last = recs[0];
                  const rQty = recs.reduce((acc, r) => acc + r.quantity, 0);
                  return (
                    <Link
                      key={s.id}
                      href={
                        canScan
                          ? `/app/project/so/${project.id}/scan`
                          : `/app/project/so/${project.id}/sessions/${s.id}`
                      }
                      className={`grid grid-cols-[110px_1fr_72px_90px_110px_96px] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60 ${
                        i % 2 === 1 ? "bg-muted/40" : ""
                      }`}
                    >
                      <span className="truncate font-mono text-[11px] font-semibold tracking-tight text-muted-foreground">
                        {formatId(s.id)}
                      </span>
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {items.find((it) => it.id === last?.itemId)?.name ?? "—"}
                      </span>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">
                        {locations.find((l) => l.id === s.locationId)?.code ?? "—"}
                      </span>
                      <span className="text-right font-mono text-[13px] font-semibold text-foreground">
                        {formatNumber(rQty)}
                      </span>
                      <span className="truncate text-[11.5px] text-muted-foreground">
                        {userName(s.scannedBy)}
                      </span>
                      <span className="truncate text-right text-[11px] text-muted-foreground">
                        {relativeTime(s.startedAt)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">
              Top variance
            </h3>
            {canVariance && (
              <Link
                href={`/app/project/so/${project.id}/variance`}
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
                  key={row.itemId}
                  className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-foreground">
                      {row.itemName ?? "—"}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      system {formatNumber(row.systemQty)} → physical{" "}
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
