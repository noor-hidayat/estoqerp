"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ScanLine } from "lucide-react";
import { useOpnameProject, useOpnameScans, useOpnameScanDetails, useItemsList, useLocations, useUsers } from "@/lib/api/query";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/ui/role-guard";

interface RecordRow {
  id: string;
  barcode: string;
  itemName: string;
  itemCode?: string;
  quantity: number;
  batch?: string;
  identified: boolean;
  scannedAt: string;
}

export default function ScanDetailPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const { data: project, isLoading: projectLoading } = useOpnameProject(params.id);
  const { data: scans = [], isLoading: scansLoading } = useOpnameScans({ opnameId: params.id });
  const { data: recordsData } = useOpnameScanDetails({ scanId: params.sessionId, pageSize: 10000 });
  const { data: items = [] } = useItemsList();
  const { data: locations = [] } = useLocations();
  const { data: users = [] } = useUsers();
  const { isSystem, permissions } = useSession();

  if (!can(isSystem, permissions, "opname.detail.sessions.detail", "view")) {
    return <AccessDenied />;
  }

  if (projectLoading || scansLoading) return <ShellLoader />;

  const scan = scans.find((s) => s.id === params.sessionId);

  if (!project || !scan) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-foreground">
          Scan not found
        </p>
        <Link
          href={`/app/so/${params.id}`}
          className="mt-2 inline-block text-sm text-primary hover:text-primary/80"
        >
          Back to Project
        </Link>
      </div>
    );
  }

  const records = (recordsData?.rows ?? [])
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));

  const totalBarcodes = records.length;
  const totalQty = records.reduce((a, r) => a + r.quantity, 0);
  const distinctItems = new Set(records.map((r) => r.itemId).filter(Boolean))
    .size;

  const user = users.find((u) => u.id === scan.scannedBy);
  const locIds = new Set(records.map((r) => r.locationId).filter(Boolean) as string[]);
  const locationsUsed = locations.filter((l) => locIds.has(l.id));

  const itemOf = (itemId?: string) =>
    items.find((i) => i.id === itemId);

  const rows: RecordRow[] = records.map((r) => {
    const item = itemOf(r.itemId);
    return {
      id: r.id,
      barcode: r.barcode,
      itemName: item?.name ?? "—",
      itemCode: item?.code,
      quantity: r.quantity,
      batch: r.batch,
      identified: Boolean(r.itemId),
      scannedAt: r.scannedAt,
    };
  });

  const columns: DataTableColumn<RecordRow>[] = [
    {
      id: "barcode",
      header: "Barcode",
      sortValue: (r) => r.barcode,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.barcode}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "item",
      header: "Item",
      cell: (r) => (
        <div>
          <p className="text-[13px] font-medium text-foreground">{r.itemName}</p>
          {r.itemCode && (
            <p className="font-mono text-[10.5px] text-muted-foreground">{r.itemCode}</p>
          )}
        </div>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "qty",
      header: "Qty",
      align: "right",
      sortValue: (r) => r.quantity,
      cell: (r) => <span className="font-mono text-xs tabular-nums">{formatNumber(r.quantity)}</span>,
    },
    {
      id: "batch",
      header: "Batch",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">{r.batch || "—"}</span>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: (r) =>
        r.identified ? (
          <Badge tone="emerald" dot>
            Identified
          </Badge>
        ) : (
          <Badge tone="neutral" dot>
            Unknown
          </Badge>
        ),
    },
    {
      id: "time",
      header: "Time",
      sortValue: (r) => r.scannedAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(r.scannedAt)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Project", href: "/app/so" },
          { label: "Project Details", href: `/app/so/${project.id}` },
          { label: "Scan Details" },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">
          {project.name}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {locationsUsed.length > 0
            ? locationsUsed.map((l) => `${l.code} — ${l.name}`).join(", ")
            : "Location —"}{" "}
          · {user?.name ?? "—"}
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">
            Total barcodes scanned
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {formatNumber(totalBarcodes)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">barcodes</p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Total qty</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-600">
            {formatNumber(totalQty)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">units counted</p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Unique items</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
            {formatNumber(distinctItems)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">different items</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        searchPlaceholder="Search barcode or item..."
        getSearchText={(r) => `${r.barcode} ${r.itemName}`}
        initialSort={{ id: "time", dir: "desc" }}
        minWidth={820}
        emptyIcon={<ScanLine size={26} strokeWidth={2} />}
        emptyTitle="No scans in this record yet"
        emptyDescription="Barcode scans in this record will be shown here."
      />
    </div>
  );
}