"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FileDown,
  FileSpreadsheet,
  NotebookText,
  Search,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { accessibleWarehouseIds } from "@/lib/permissions";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { useStockLedger, useAllWarehouses } from "@/lib/api/query";
import type { StockLedgerRow } from "@/types";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function StockLedgerPage() {
  const { isSystem, access } = useSession();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: allWarehouses = [] } = useAllWarehouses();

  const params = {
    query: debouncedQuery || undefined,
    warehouseId: warehouseId === "all" ? undefined : warehouseId,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize,
  };
  const { data: result, isLoading } = useStockLedger(params);

  const allowedWhs = useMemo(() => {
    const ids = accessibleWarehouseIds(isSystem, access, allWarehouses);
    return ids.length > 0 ? allWarehouses.filter((w) => ids.includes(w.id)) : allWarehouses;
  }, [allWarehouses, isSystem, access]);

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;

  const exportColumns = [
    { key: "transactionDate" as const, header: "Date", format: (v: unknown) => formatDateTime(String(v)) },
    { key: "transactionType" as const, header: "Type" },
    { key: "itemCode" as const, header: "Item Code" },
    { key: "itemName" as const, header: "Item" },
    { key: "warehouseName" as const, header: "Warehouse" },
    { key: "batchNumber" as const, header: "Batch" },
    { key: "qtyIn" as const, header: "In", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "qtyOut" as const, header: "Out", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "qtyBalance" as const, header: "Balance", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "referenceId" as const, header: "Reference" },
    { key: "createdByName" as const, header: "By" },
  ];

  const handleExport = async (type: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const sp = new URLSearchParams();
      if (debouncedQuery) sp.set("query", debouncedQuery);
      if (warehouseId !== "all") sp.set("warehouseId", warehouseId);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      sp.set("pageSize", String(total || 500));
      const res = await api.get<{ rows: StockLedgerRow[] }>(
        `/stock-ledger?${sp.toString()}`
      );
      const base = "stock-ledger";
      const meta = {
        title: "Stock — Stock Ledger",
        subtitle: `${total} entries`,
      };
      if (type === "xlsx") exportXlsx(res.rows, exportColumns, base, "Stock Ledger");
      else exportPdf(res.rows, exportColumns, base, meta);
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<StockLedgerRow>[] = [
    {
      id: "date",
      header: "Date",
      sortValue: (r) => r.transactionDate,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(r.transactionDate)}
        </span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "type",
      header: "Type",
      sortValue: (r) => r.transactionType,
      cell: (r) => (
        <span className="text-xs font-medium text-foreground">{r.transactionType}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "item",
      header: "Item",
      sortValue: (r) => r.itemName ?? "",
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">{r.itemCode ?? "—"}</span>
          <span className="text-[13px] font-medium text-foreground">{r.itemName ?? "—"}</span>
        </div>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseName ?? "",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.warehouseCode ?? r.warehouseName ?? "—"}
        </span>
      ),
      className: "min-w-[120px]",
    },
    {
      id: "batch",
      header: "Batch",
      sortValue: (r) => r.batchNumber ?? "",
      cell: (r) => (
        <span className="font-mono text-xs text-foreground">{r.batchNumber ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "qtyIn",
      header: "In",
      align: "right",
      sortValue: (r) => r.qtyIn,
      cell: (r) => (
        <span className="font-mono text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          {r.qtyIn > 0 ? `+${formatNumber(r.qtyIn)}` : "—"}
        </span>
      ),
    },
    {
      id: "qtyOut",
      header: "Out",
      align: "right",
      sortValue: (r) => r.qtyOut,
      cell: (r) => (
        <span className="font-mono text-xs font-medium tabular-nums text-destructive">
          {r.qtyOut > 0 ? `−${formatNumber(r.qtyOut)}` : "—"}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      sortValue: (r) => r.qtyBalance,
      cell: (r) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {formatNumber(r.qtyBalance)}
        </span>
      ),
    },
    {
      id: "ref",
      header: "Reference",
      sortValue: (r) => r.referenceId ?? "",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">{r.referenceId ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "by",
      header: "By",
      sortValue: (r) => r.createdByName ?? "",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{r.createdByName ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
  ];

  return (
    <MenuGate menu="inventory.stockLedger">
      <PageHeader title="Stock Ledger" />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={isLoading}
        filters={
          <>
            <div className="relative">
              <Search
                size={14}
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search item, type, ref..."
                className="h-8 w-[220px] pl-8 text-xs shadow-none focus-visible:ring-1"
              />
            </div>
            <Select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
              className="h-8 w-52 text-xs"
            >
              <option value="all">All warehouses</option>
              {allowedWhs.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="h-8 w-36 text-xs"
            />
            <span className="text-xs text-muted-foreground">s.d.</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
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
              onClick={() => void handleExport("xlsx")}
              disabled={exporting}
            >
              <FileSpreadsheet size={14} strokeWidth={2} className="text-primary" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => void handleExport("pdf")}
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
        onPageSizeChange={(ps) => {
          setPageSize(ps);
          setPage(1);
        }}
        minWidth={920}
        emptyIcon={<NotebookText size={26} strokeWidth={2} />}
        emptyTitle="No ledger entries"
        emptyDescription="Post a transaction to start recording stock movements."
        onResetFilters={() => {
          setQuery("");
          setWarehouseId("all");
          setFrom("");
          setTo("");
          setPage(1);
        }}
      />

      <p className="mt-4 text-[12px] text-muted-foreground">
        Data per {formatDate(new Date().toISOString())} — riwayat mutasi stok dari transaksi
        yang sudah diposting.
      </p>
    </MenuGate>
  );
}
