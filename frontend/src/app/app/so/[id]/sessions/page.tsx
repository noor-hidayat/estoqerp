"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ScanLine } from "lucide-react";
import { useOpnameProject, useProjectScans } from "@/lib/api/query";
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
  lastItemName?: string;
  lastItemUnit?: string;
  barcodes: number;
  qty: number;
  warehouses: string[];
  locations: string[];
  status: string;
  startedAt: string;
  completedAt: string | null;
}

export default function ScanSessionsPage() {
  const params = useParams<{ id: string }>();
  const { data: project, isLoading: projectLoading } = useOpnameProject(params.id);
  const { data: sessionsData, isLoading: sessionsLoading } = useProjectScans(params.id);
  const { isSystem, permissions } = useSession();
  const canDetail = can(isSystem, permissions, "opname.detail.sessions.detail", "view");
  const canScan = can(isSystem, permissions, "opname.detail.scan", "view");

  if (!can(isSystem, permissions, "opname.detail.sessions", "view")) {
    return <AccessDenied />;
  }

  if (projectLoading || sessionsLoading) return <ShellLoader />;
  if (!project) return null;

  const scans = sessionsData?.scans ?? [];

  const rows: SessionRow[] = scans.map((s) => ({
    id: s.id,
    lastItemName: s.lastItemName,
    lastItemUnit: s.lastItemUnit,
    barcodes: s.barcodes ?? 0,
    qty: s.qty ?? 0,
    warehouses: s.warehouses ?? [],
    locations: s.locations ?? [],
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt ?? null,
  }));

  const columns: DataTableColumn<SessionRow>[] = [
    {
      id: "code",
      header: "Scan Code",
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
      id: "location",
      header: "Locations",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.locations.join(", ") || "—"}
        </span>
      ),
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
          {r.completedAt ? formatDateTime(r.completedAt) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
          {r.status}
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
            href={`/app/so/${project.id}/sessions/${r.id}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="View scan"
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
          <span className="font-semibold text-foreground">{scans.length}</span>{" "}
          scan records · <span className="font-semibold text-foreground">{project.name}</span>
        </p>
        {canScan && (
          <Link href={`/app/so/${project.id}/scan`}>
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
          label="Total Scans"
          value={scans.length}
          sub={`${scans.filter((s) => s.status === "DRAFT").length} draft scans`}
          icon={<ScanLine size={16} strokeWidth={2} />}
          accent
        />
        <Stat
          compact
          label="Total Barcodes"
          value={formatNumber(sessionsData?.totalBarcodes ?? 0)}
          sub="Barcodes scanned"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Total Qty"
          value={formatNumber(sessionsData?.totalQty ?? 0)}
          sub="Units counted"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Unique Items"
          value={formatNumber(sessionsData?.itemCount ?? 0)}
          sub="Different items scanned"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search scans..."
        getSearchText={(r) => `${r.id} ${r.lastItemName} ${r.locations.join(" ")}`}
        initialSort={{ id: "start", dir: "desc" }}
        minWidth={980}
        emptyIcon={<ScanLine size={26} strokeWidth={2} />}
        emptyTitle="No scan records yet"
        emptyDescription="Scan records will appear here after scanning from the scan page."
      />
    </div>
  );
}