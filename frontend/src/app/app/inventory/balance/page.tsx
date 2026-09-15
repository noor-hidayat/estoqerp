import { useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  FileDown,
  FileSpreadsheet,
  Search,
  X,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { accessibleWarehouseIds } from "@/lib/permissions";
import { formatDate, formatNumber, formatQty } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import {
  useStockBalanceLedger,
  useStockBalanceSummary,
  useAllWarehouses,
  useItems,
  useUoms,
  type StockBalanceLedgerRow,
} from "@/lib/api/query";
import type { Item } from "@/types";
import { api } from "@/lib/api/client";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function StockBalancePage() {
  const { isSystem, access } = useSession();
  const [itemQuery, setItemQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [warehouseId, setWarehouseId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(itemQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [itemQuery]);

  useEffect(() => {
    if (!itemQuery) return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setItemQuery("");
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [itemQuery]);

  const { data: allWarehouses = [] } = useAllWarehouses();
  const { data: uoms = [] } = useUoms();
  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const { data: suggestionsResult, isLoading: suggestionsLoading } = useItems({
    query: debouncedQuery || undefined,
    pageSize: 10,
  });
  const suggestions = suggestionsResult?.rows ?? [];

  const ledgerParams = {
    itemId: selectedItem?.id,
    warehouseId: warehouseId === "all" ? undefined : warehouseId,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize,
  };
  const {
    data: result,
    isLoading,
  } = useStockBalanceLedger(ledgerParams);
  const { data: summary } = useStockBalanceSummary(ledgerParams);

  const allowedWhs = useMemo(
    () => {
      const ids = accessibleWarehouseIds(isSystem, access, allWarehouses);
      return ids.length > 0
        ? allWarehouses.filter((w) => ids.includes(w.id))
        : allWarehouses;
    },
    [allWarehouses, isSystem, access]
  );

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;
  const totalItems = summary?.totalItems ?? 0;
  const totalQty = summary?.totalQty ?? 0;

  const exportColumns = [
    { key: "code" as const, header: "Item Code" },
    { key: "name" as const, header: "Item Name" },
    { key: "itemGroup" as const, header: "Item Group" },
    { key: "warehouse" as const, header: "Warehouse" },
    { key: "balanceDate" as const, header: "Date", format: (v: unknown) => (v ? formatDate(String(v)) : "") },
    { key: "openingQty" as const, header: "Opening Stock", format: (v: unknown) => formatQty(v as any) },
    { key: "inQty" as const, header: "In Qty", format: (v: unknown) => formatQty(v as any) },
    { key: "outQty" as const, header: "Out Qty", format: (v: unknown) => formatQty(v as any) },
    { key: "closingQty" as const, header: "Closing Stock", format: (v: unknown) => formatQty(v as any) },
  ];

  const handleExport = async (type: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const sp = new URLSearchParams();
      if (selectedItem) sp.set("itemId", selectedItem.id);
      if (warehouseId !== "all") sp.set("warehouseId", warehouseId);
      if (from) sp.set("from", from);
      if (to) sp.set("to", to);
      sp.set("pageSize", String(total || 500));
      const res = await api.get<{ rows: StockBalanceLedgerRow[] }>(
        `/stock-balances/ledger?${sp.toString()}`
      );
      const base = "stock-ledger";
      const meta = {
        title: "Stock — Stock Monitoring",
        subtitle: `${totalItems} items · total qty ${formatQty(totalQty)}`,
      };
      if (type === "xlsx")
        exportXlsx(res.rows, exportColumns, base, "Stock");
      else exportPdf(res.rows, exportColumns, base, meta);
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<StockBalanceLedgerRow>[] = [
    {
      id: "code",
      header: "Item Code",
      sortValue: (r) => r.code,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.code}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "name",
      header: "Item Name",
      sortValue: (r) => r.name,
      cell: (r) => (
        <span
          className="block max-w-[300px] truncate font-medium text-foreground"
          title={r.name}
        >
          {r.name}
        </span>
      ),
      className: "min-w-[200px]",
    },
    {
      id: "itemGroup",
      header: "Item Group",
      sortValue: (r) => r.itemGroup ?? "",
      cell: (r) => (
        <span
          className="block max-w-[160px] truncate text-xs text-muted-foreground"
          title={r.itemGroup ?? undefined}
        >
          {r.itemGroup ?? ""}
        </span>
      ),
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouse,
      cell: (r) => (
        <span
          className="block max-w-[220px] truncate text-xs text-muted-foreground"
          title={r.warehouse}
        >
          {r.warehouse}
        </span>
      ),
      className: "min-w-[140px]",
    },
    {
      id: "balanceDate",
      header: "Date",
      sortValue: (r) => r.balanceDate,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.balanceDate ? formatDate(r.balanceDate) : ""}
        </span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "openingQty",
      header: "Opening Stock",
      align: "right",
      sortValue: (r) => r.openingQty,
      cell: (r) => <span className="text-xs font-medium tabular-nums">{formatQty(r.openingQty)}</span>,
    },
    {
      id: "inQty",
      header: "In Qty",
      align: "right",
      sortValue: (r) => r.inQty,
      cell: (r) => <span className="text-xs font-medium tabular-nums">{formatQty(r.inQty)}</span>,
    },
    {
      id: "outQty",
      header: "Out Qty",
      align: "right",
      sortValue: (r) => r.outQty,
      cell: (r) => <span className="text-xs font-medium tabular-nums">{formatQty(r.outQty)}</span>,
    },
    {
      id: "closingQty",
      header: "Closing Stock",
      align: "right",
      sortValue: (r) => r.closingQty,
      cell: (r) => <span className="text-xs font-medium tabular-nums">{formatQty(r.closingQty)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Stock Balance"

      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Total item</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(totalItems)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Total closing stock</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatQty(totalQty)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Stock rows</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">
            {formatNumber(total)}
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        loading={isLoading}
        filters={
          <>
            <div ref={pickerRef} className="relative">
              <Search
                size={14}
                strokeWidth={2}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={selectedItem ? `${selectedItem.code} — ${selectedItem.name}` : itemQuery}
                onChange={(e) => {
                  if (selectedItem) {
                    setSelectedItem(null);
                    setPage(1);
                  }
                  setItemQuery(e.target.value);
                }}
                placeholder="Search item (code, name, unit, barcode)..."
                className="h-8 w-[300px] pl-8 pr-7 text-xs shadow-none focus-visible:ring-1"
              />
              {selectedItem && (
                <button
                  type="button"
                  aria-label="Clear item"
                  onClick={() => {
                    setSelectedItem(null);
                    setItemQuery("");
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              {!selectedItem && itemQuery && (
                <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                  <div className="max-h-64 overflow-y-auto">
                    {suggestionsLoading ? (
                      <p className="px-3.5 py-3 text-[12.5px] text-muted-foreground">
                        Searching...
                      </p>
                    ) : suggestions.length === 0 ? (
                      <p className="px-3.5 py-3 text-[12.5px] text-muted-foreground">
                        No matching items
                      </p>
                    ) : (
                      suggestions.map((it) => (
                        <button
                          key={it.id}
                          type="button"
                          onClick={() => {
                            setSelectedItem(it);
                            setItemQuery("");
                            setPage(1);
                          }}
                          className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[12.5px] text-foreground transition-colors hover:bg-accent"
                        >
                          <span className="text-xs text-muted-foreground">{it.code}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {it.uomId ? (uomById.get(it.uomId)?.name ?? "") : ""}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <Select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
              className="h-8 w-56 text-xs"
            >
              <option value="all">All warehouses</option>
              {allowedWhs.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <div className="w-40 [&>div]:gap-0 [&_input]:h-8 [&_input]:text-xs">
              <DatePicker
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  setPage(1);
                }}
              />
            </div>
            <span className="text-xs text-muted-foreground">s.d.</span>
            <div className="w-40 [&>div]:gap-0 [&_input]:h-8 [&_input]:text-xs">
              <DatePicker
                value={to}
                onChange={(v) => {
                  setTo(v);
                  setPage(1);
                }}
              />
            </div>
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
        minWidth={900}
        emptyIcon={<Boxes size={26} strokeWidth={2} />}
        emptyTitle="No stock data"
        emptyDescription="No item data yet or adjust filters."
        onResetFilters={() => {
          setSelectedItem(null);
          setItemQuery("");
          setWarehouseId("all");
          setFrom("");
          setTo("");
          setPage(1);
        }}
      />
    </div>
  );
}