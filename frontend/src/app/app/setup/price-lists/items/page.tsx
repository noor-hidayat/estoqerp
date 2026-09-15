import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { History, FileSpreadsheet, FileDown } from "lucide-react";
import { usePriceLists, useItemsList } from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";
import type { PriceListLine } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";
import { formatNumber, timeAgo } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";

function useAllPriceListLines(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ["priceListLines", "all", params],
    queryFn: () => api.get<PriceListLine[]>(`/priceListLines${params ? `?${new URLSearchParams(params as any).toString()}` : ""}`),
  });
}

export default function ItemPricelistPage() {
  const navigate = useNavigate();
  const { data: priceLists = [] } = usePriceLists();
  const { data: items = [] } = useItemsList();
  const [priceListFilter, setPriceListFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState(false);

  const filterParams = useMemo(() => ({
    priceListId: priceListFilter !== "all" ? priceListFilter : undefined,
    query: query || undefined,
  }), [priceListFilter, query]);

  const { data: linesRaw = [], isLoading } = useAllPriceListLines(filterParams as any);
  const lines = useMemo(() => {
    let filtered = [...linesRaw];
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter((l: any) => {
        const pl = priceLists.find((p) => p.id === l.priceListId);
        const it = items.find((i: any) => i.id === l.itemId);
        return (
          String(l.unitPrice).toLowerCase().includes(q) ||
          pl?.code.toLowerCase().includes(q) ||
          pl?.name.toLowerCase().includes(q) ||
          it?.code.toLowerCase().includes(q) ||
          it?.name.toLowerCase().includes(q)
        );
      });
    }
    return filtered;
  }, [linesRaw, query, priceLists, items]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return lines.slice(start, start + pageSize);
  }, [lines, page, pageSize]);

  const total = lines.length;

  const exportColumns = [
    { key: "priceList" as const, header: "Price List" },
    { key: "item" as const, header: "Item" },
    { key: "price" as const, header: "Unit Price", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "currency" as const, header: "Currency" },
    { key: "minQty" as const, header: "Min Qty" },
  ];

  const handleExport = async (type: "xlsx" | "pdf") => {
    setExporting(true);
    try {
      const data = lines.map((l: any) => {
        const pl = priceLists.find((p) => p.id === l.priceListId);
        const it = items.find((i: any) => i.id === l.itemId);
        return {
          priceList: pl ? `${pl.code} — ${pl.name}` : l.priceListId.slice(0, 8),
          item: it ? `${it.code} — ${it.name}` : l.itemId.slice(0, 8),
          price: l.unitPrice,
          currency: l.currency,
          minQty: l.minQty,
        };
      });
      const base = "item-pricelist";
      const meta = { title: "Item Pricelist", subtitle: `Total ${data.length} records` };
      if (type === "xlsx") exportXlsx(data, exportColumns, base, "ItemPricelist");
      else exportPdf(data, exportColumns, base, meta);
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<any>[] = [
    {
      id: "priceList",
      header: "Price List",
      cell: (r: any) => {
        const pl = priceLists.find((p) => p.id === r.priceListId);
        return (
          <button
            onClick={() => navigate(`/app/setup/price-lists/${r.priceListId}`)}
            className="text-left"
          >
            <div className="text-xs font-medium text-primary hover:underline">{pl ? `${pl.code}` : r.priceListId.slice(0, 8)}</div>
            <div className="text-xs text-muted-foreground">{pl?.name ?? ""}</div>
          </button>
        );
      },
      className: "min-w-[180px]",
    },
    {
      id: "item",
      header: "Item",
      cell: (r: any) => {
        const it = items.find((i: any) => i.id === r.itemId);
        return (
          <div>
            <div className="text-xs font-medium">{it ? it.code : r.itemId.slice(0, 8)}</div>
            <div className="text-xs text-muted-foreground">{it?.name ?? ""}</div>
          </div>
        );
      },
      className: "min-w-[200px]",
    },
    {
      id: "price",
      header: "Unit Price",
      align: "right",
      cell: (r: any) => <span className="text-xs font-semibold tabular-nums">Rp {formatNumber(Number(r.unitPrice))}</span>,
    },
    {
      id: "currency",
      header: "Currency",
      cell: (r: any) => <Badge variant="secondary" className="text-xs">{r.currency}</Badge>,
      className: "w-[90px]",
    },
    {
      id: "minQty",
      header: "Min Qty",
      align: "right",
      cell: (r: any) => <span className="text-xs">{r.minQty}</span>,
    },
    {
      id: "created",
      header: "Created",
      cell: (r: any) => <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>,
    },
  ];

  if (isLoading) return <ShellLoader />;

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <PageHeader title="Item Pricelist" description="Daftar semua harga item per price list — seperti History Scan" />
      <DataTable
        columns={columns}
        data={paginated}
        getRowId={(r) => r.id}
        onRowClick={(r) => navigate(`/app/setup/price-lists/${r.priceListId}`)}
        loading={isLoading}
        searchPlaceholder="Search price list, item, price..."
        searchValue={query}
        onSearchChange={(q) => {
          setQuery(q);
          setPage(1);
        }}
        filters={
          <Select value={priceListFilter} onChange={(e) => { setPriceListFilter(e.target.value); setPage(1); }} className="h-8 w-48 text-xs">
            <option value="all">All price lists</option>
            {priceLists.map((pl) => (
              <option key={pl.id} value={pl.id}>
                {pl.code} — {pl.name}
              </option>
            ))}
          </Select>
        }
        toolbarRight={
          <>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => handleExport("xlsx")} disabled={exporting}>
              <FileSpreadsheet size={14} className="text-primary" /> Excel
            </Button>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => handleExport("pdf")} disabled={exporting}>
              <FileDown size={14} className="text-destructive" /> PDF
            </Button>
          </>
        }
        pagination="server"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(ps) => { setPageSize(ps); setPage(1); }}
        minWidth={900}
        emptyIcon={<History size={26} strokeWidth={2} />}
        emptyTitle="No item pricelist yet"
        emptyDescription="Add price via Price Lists → Detail → Item Pricelist tab or via Price Lists page."
        onResetFilters={() => { setPriceListFilter("all"); setQuery(""); setPage(1); }}
      />
    </RoleGuard>
  );
}
