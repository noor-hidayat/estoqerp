import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, History } from "lucide-react";

import { useOpnameProjects, useOpnameScanDetails, useItemsList, useLocations, useUsers, useOpnameScans } from "@/lib/api/query";
import type { OpnameScanDetail } from "@/types";
import { api } from "@/lib/api/client";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";

const SOURCE_LABELS: Record<string, string> = {
  SCANNER: "Scanner",
  CAMERA: "Camera",
  MANUAL: "Manual",
};

export default function ScanHistoryPage() {
  const { data: projects = [], isLoading: projectsLoading } = useOpnameProjects();
  const [projectId, setProjectId] = useState("all");
  const [source, setSource] = useState("all");
  const [date, setDate] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  const filterParams = useMemo(() => ({
    opnameId: projectId !== "all" ? projectId : undefined,
    source: source !== "all" ? source : undefined,
    date: date || undefined,
    query: query || undefined,
    page,
    pageSize,
  }), [projectId, source, date, query, page, pageSize]);

  const { data: recordsData, isLoading: recordsLoading } = useOpnameScanDetails(filterParams);
  const { data: items = [] } = useItemsList();
  const { data: locations = [] } = useLocations();
  const { data: users = [] } = useUsers();
  const { data: scans = [] } = useOpnameScans();

  const scanMap = useMemo(
    () => new Map(scans.map((s) => [s.id, s])),
    [scans]
  );

  const exportColumns = [
    { key: "waktu" as const, header: "Time" },
    { key: "project" as const, header: "Project" },
    { key: "barcode" as const, header: "Barcode" },
    { key: "item" as const, header: "Item" },
    { key: "qty" as const, header: "Qty", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "qtyMode" as const, header: "Qty Mode" },
    { key: "source" as const, header: "Source" },
    { key: "user" as const, header: "User" },
    { key: "location" as const, header: "Location" },
  ];

  const handleExport = async (type: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const exportParams: Record<string, string> = {};
      if (projectId !== "all") exportParams.opnameId = projectId;
      if (source !== "all") exportParams.source = source;
      if (date) exportParams.date = date;
      if (query) exportParams.query = query;
      exportParams.pageSize = String(recordsData?.total ?? 500);

      const sp = new URLSearchParams(exportParams);
      const res = await api.get<{ rows: OpnameScanDetail[]; total: number }>(
        `/opnameScanDetails?${sp.toString()}`
      );
      const data = res.rows.map((r) => {
        const item = items.find((i) => i.id === r.itemId);
        const project = projects.find((p) => p.id === r.opnameId);
        const scan = scanMap.get(r.scanId);
        const user = users.find((u) => u.id === scan?.scannedBy);
        const loc = locations.find((l) => l.id === r.locationId);
        return {
          waktu: formatDateTime(r.scannedAt),
          project: project?.name ?? "—",
          barcode: r.barcode,
          item: item?.name ?? "—",
          qty: r.quantity,
          qtyMode: r.qtyMode === "AUTO" ? "Auto" : "Manual",
          source: SOURCE_LABELS[r.source] ?? r.source,
          user: user?.name ?? "—",
          location: loc?.code ?? "—",
        };
      });
      const base = "scan-history";
      const meta = { title: "Scan History (Audit Trail)", subtitle: `Total ${data.length} scan transactions` };
      if (type === "xlsx") exportXlsx(data, exportColumns, base, "History");
      else exportPdf(data, exportColumns, base, meta);
    } finally {
      setExporting(false);
    }
  };

  if (projectsLoading) return <ShellLoader />;

  const rows = recordsData?.rows ?? [];
  const total = recordsData?.total ?? 0;

  const columns: DataTableColumn<OpnameScanDetail>[] = [
    {
      id: "time",
      header: "Time",
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTime(r.scannedAt)}
        </span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "project",
      header: "Project",
      cell: (r) => (
        <span className="max-w-[160px] truncate text-[12.5px] text-muted-foreground">
          {projects.find((p) => p.id === r.opnameId)?.name ?? "—"}
        </span>
      ),
      className: "max-w-[160px]",
    },
    {
      id: "barcode",
      header: "Barcode",
      cell: (r) => <span className="text-xs">{r.barcode}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "item",
      header: "Item",
      cell: (r) => {
        const item = items.find((i) => i.id === r.itemId);
        return (
          <span className="max-w-[220px] truncate text-[12.5px]">
            {item?.name ?? <span className="text-muted-foreground">Unknown</span>}
          </span>
        );
      },
      className: "max-w-[220px]",
    },
    {
      id: "qty",
      header: "Qty",
      align: "right",
      cell: (r) => (
        <span className="text-[13px] font-semibold tabular-nums">
          {formatNumber(r.quantity)}
        </span>
      ),
    },
    {
      id: "source",
      header: "Source",
      cell: (r) => (
        <Badge tone="neutral">
          {SOURCE_LABELS[r.source] ?? r.source}
        </Badge>
      ),
    },
    {
      id: "location",
      header: "Location",
      cell: (r) => (
        <span className="text-xs">
          {locations.find((l) => l.id === r.locationId)?.code ?? "—"}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Scan History"

      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={recordsLoading}
        searchPlaceholder="Search barcode, item, project, user, location..."
        searchValue={query}
        onSearchChange={(q) => {
          setQuery(q);
          setPage(1);
        }}
        filters={
          <>
            <Select
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setPage(1); }}
              className="h-8 w-48 text-xs"
            >
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <Select
              value={source}
              onChange={(e) => { setSource(e.target.value); setPage(1); }}
              className="h-8 w-36 text-xs"
            >
              <option value="all">All sources</option>
              <option value="SCANNER">Scanner</option>
              <option value="CAMERA">Camera</option>
              <option value="MANUAL">Manual</option>
            </Select>
            <Input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setPage(1); }}
              className="h-8 w-36 text-xs"
            />
          </>
        }
        toolbarRight={
          <>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => handleExport("xlsx")}
              disabled={exporting}
            >
              <FileSpreadsheet size={14} strokeWidth={2} className="text-primary" />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => handleExport("pdf")}
              disabled={exporting}
            >
              <FileDown size={14} strokeWidth={2} className="text-destructive" />
              PDF
            </Button>
          </>
        }
        pagination="server"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
        footerLeft={
          <>
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{total}</span> transactions
            </span>
            <Badge tone="neutral">Audit trail</Badge>
          </>
        }
        minWidth={980}
        emptyIcon={<History size={26} strokeWidth={2} />}
        emptyTitle="No scan data yet"
        emptyDescription="Adjust filters or start a scan to record transactions."
        onResetFilters={() => {
          setProjectId("all");
          setSource("all");
          setDate("");
          setQuery("");
          setPage(1);
        }}
      />
    </div>
  );
}