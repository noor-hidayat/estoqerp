"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ScanLine } from "lucide-react";
import { useProject, useScanSessions, useScanRecords, useItemsList } from "@/lib/api/query";
import { formatDateTime, formatId, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/ui/role-guard";

interface SessionRow {
  id: string;
  lastItemName: string;
  lastItemUnit: string;
  barcodes: number;
  qty: number;
  startedAt: string;
  endedAt: string | null;
}

export default function ScanSessionsPage() {
  const params = useParams<{ id: string }>();
  const { data: project, isLoading: projectLoading } = useProject(params.id);
  const { data: sessions = [], isLoading: sessionsLoading } = useScanSessions({ projectId: params.id });
  const { data: recordsData } = useScanRecords({ projectId: params.id, pageSize: 10000 });
  const { data: items = [] } = useItemsList();
  const { isSystem, permissions } = useSession();
  const canDetail = can(isSystem, permissions, "opname.detail.sessions.detail", "view");
  const canScan = can(isSystem, permissions, "opname.detail.scan", "view");

  if (!can(isSystem, permissions, "opname.detail.sessions", "view")) {
    return <AccessDenied />;
  }

  if (projectLoading || sessionsLoading) return <ShellLoader />;
  if (!project) return null;

  const records = recordsData?.rows ?? [];

  const stats = sessions.map((s) => {
    const recs = records
      .filter((r) => r.sessionId === s.id)
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
    return {
      session: s,
      recs,
      qty: recs.reduce((a, r) => a + r.quantity, 0),
      barcodes: recs.length,
      lastItemName: recs[0]
        ? items.find((i) => i.id === recs[0].itemId)?.name ?? "—"
        : "—",
      lastItemUnit: recs[0]
        ? items.find((i) => i.id === recs[0].itemId)?.unit ?? "—"
        : "—",
    };
  });

  const distinctItems = new Set(
    records.map((r) => r.itemId).filter(Boolean)
  ).size;

  const rows: SessionRow[] = stats.map(({ session: s, qty, barcodes, lastItemName, lastItemUnit }) => ({
    id: s.id,
    lastItemName,
    lastItemUnit,
    barcodes,
    qty,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
  }));

  const columns: DataTableColumn<SessionRow>[] = [
    {
      id: "code",
      header: "Session Code",
      sortValue: (r) => r.id,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{formatId(r.id)}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "item",
      header: "Item Name",
      cell: (r) => <span className="text-[12.5px]">{r.lastItemName}</span>,
      className: "min-w-[160px]",
    },
    {
      id: "barcodes",
      header: "Qty Barcode",
      align: "right",
      sortValue: (r) => r.barcodes,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{formatNumber(r.barcodes)}</span>,
    },
    {
      id: "qty",
      header: "Qty",
      align: "right",
      sortValue: (r) => r.qty,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{formatNumber(r.qty)}</span>,
    },
    {
      id: "unit",
      header: "UOM",
      cell: (r) => <span className="text-[12.5px]">{r.lastItemUnit}</span>,
    },
    {
      id: "start",
      header: "Start",
      sortValue: (r) => r.startedAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(r.startedAt)}
        </span>
      ),
    },
    {
      id: "end",
      header: "End",
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.endedAt ? formatDateTime(r.endedAt) : "—"}
        </span>
      ),
    },
    {
      id: "detail",
      header: "",
      align: "right",
      cell: (r) =>
        canDetail ? (
          <Link
            href={`/app/project/so/${project.id}/sessions/${r.id}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="View session"
          >
            <ScanLine size={15} strokeWidth={2} />
          </Link>
        ) : (
          <span className="inline-flex h-7 w-7 items-center justify-center text-muted-foreground opacity-50">
            <ScanLine size={15} strokeWidth={2} />
          </span>
        ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">{sessions.length}</span>{" "}
          scan sessions · <span className="font-semibold text-foreground">{project.name}</span>
        </p>
        {canScan && (
          <Link href={`/app/project/so/${project.id}/scan`}>
            <Button variant="secondary" size="sm">
              <ScanLine size={14} strokeWidth={2} />
              Open Scan Page
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          compact
          label="Total Sessions"
          value={stats.length}
          sub={`${stats.filter((s) => s.session.status === "ACTIVE").length} active sessions`}
          icon={<ScanLine size={16} strokeWidth={2} />}
          accent
        />
        <Stat
          compact
          label="Total Barcodes"
          value={formatNumber(stats.reduce((a, s) => a + s.barcodes, 0))}
          sub="Barcodes scanned"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Total Qty"
          value={formatNumber(stats.reduce((a, s) => a + s.qty, 0))}
          sub="Units counted"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Unique Items"
          value={formatNumber(distinctItems)}
          sub="Different items scanned"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search sessions..."
        getSearchText={(r) => `${r.id} ${r.lastItemName}`}
        initialSort={{ id: "start", dir: "desc" }}
        minWidth={980}
        emptyIcon={<ScanLine size={26} strokeWidth={2} />}
        emptyTitle="No scan sessions yet"
        emptyDescription="Scan sessions will be recorded here after starting from the scan page."
      />
    </div>
  );
}