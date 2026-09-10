import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileDown,
  FileSpreadsheet,
  NotebookText,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { accessibleWarehouseIds } from "@/lib/permissions";
import { formatDate, formatDateTime, formatNumber, formatQty } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { useStockLedger, useAllWarehouses, useItemsList } from "@/lib/api/query";
import type { StockLedgerRow } from "@/types";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function StockLedgerPage() {
  const navigate = useNavigate();
  const { isSystem, access } = useSession();
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  const { data: allWarehouses = [] } = useAllWarehouses();
  const { data: items = [] } = useItemsList();

  const params = {
    itemId: itemId || undefined,
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
    { key: "itemCode" as const, header: "Item Code" },
    { key: "itemName" as const, header: "Item Name" },
    { key: "warehouseName" as const, header: "Warehouse" },
    { key: "unit" as const, header: "UOM" },
    { key: "qtyIn" as const, header: "In", format: (v: unknown) => formatQty(v as any) },
    { key: "qtyOut" as const, header: "Out", format: (v: unknown) => formatQty(v as any) },
    { key: "qtyBalance" as const, header: "Balance", format: (v: unknown) => formatQty(v as any) },
    { key: "valuationRate" as const, header: "Valuation Rate", format: (v: unknown) => `Rp ${formatNumber(Number(v))}` },
    { key: "stockValue" as const, header: "Stock Value", format: (v: unknown) => `Rp ${formatNumber(Number(v))}` },
    { key: "transactionId" as const, header: "Movement No" },
  ];

  const handleExport = async (type: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const sp = new URLSearchParams();
      if (itemId) sp.set("itemId", itemId);
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
      id: "itemCode",
      header: "Item Code",
      sortValue: (r) => r.itemCode ?? "",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{r.itemCode ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "itemName",
      header: "Item Name",
      sortValue: (r) => r.itemName ?? "",
      cell: (r) => (
        <span
          className="block max-w-[280px] truncate text-[13px] font-medium text-foreground"
          title={r.itemName}
        >
          {r.itemName ?? "—"}
        </span>
      ),
      className: "min-w-[160px]",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseName ?? "",
      cell: (r) => (
        <span
          className="block max-w-[220px] truncate text-xs text-muted-foreground"
          title={r.warehouseName}
        >
          {r.warehouseName ?? "—"}
        </span>
      ),
      className: "min-w-[120px]",
    },
    {
      id: "uom",
      header: "UOM",
      sortValue: (r) => r.unit ?? "",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{r.unit ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "qtyIn",
      header: "In",
      align: "right",
      sortValue: (r) => r.qtyIn,
      cell: (r) => (
        <span className="text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
          {r.qtyIn > 0 ? `+${formatQty(r.qtyIn)}` : "—"}
        </span>
      ),
    },
    {
      id: "qtyOut",
      header: "Out",
      align: "right",
      sortValue: (r) => r.qtyOut,
      cell: (r) => (
        <span className="text-xs font-medium tabular-nums text-destructive">
          {r.qtyOut > 0 ? `−${formatQty(r.qtyOut)}` : "—"}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      sortValue: (r) => r.qtyBalance,
      cell: (r) => (
        <span className="text-xs font-semibold tabular-nums">
          {formatQty(r.qtyBalance)}
        </span>
      ),
    },
    {
      id: "valuationRate",
      header: "Valuation Rate",
      align: "right",
      sortValue: (r) => r.valuationRate ?? 0,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.valuationRate ? `Rp ${formatNumber(r.valuationRate)}` : "—"}
        </span>
      ),
    },
    {
      id: "stockValue",
      header: "Stock Value",
      align: "right",
      sortValue: (r) => r.stockValue ?? 0,
      cell: (r) => (
        <span className="text-xs font-semibold tabular-nums">
          {r.stockValue ? `Rp ${formatNumber(r.stockValue)}` : "—"}
        </span>
      ),
    },
    {
      id: "movementNo",
      header: "Movement No",
      sortValue: (r) => r.transactionId,
      cell: (r) =>
        r.transactionId ? (
          <button
            className="text-xs font-medium text-primary hover:underline"
            onClick={() => navigate(`/app/transaction/${r.transactionId}`)}
          >
            {r.transactionId}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
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
            <SearchableSelect
              options={items.map((i) => ({ value: i.id, label: `${i.code}: ${i.name}` }))}
              value={itemId}
              onChange={(v) => {
                setItemId(v);
                setPage(1);
              }}
              placeholder="Search item code or name..."
              compact
              className="w-64"
            />
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
        minWidth={1280}
        emptyIcon={<NotebookText size={26} strokeWidth={2} />}
        emptyTitle="No ledger entries"
        emptyDescription="Post a transaction to start recording stock movements."
        onResetFilters={() => {
          setItemId("");
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