import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import {
  useStockMovementsInfinite,
  useMovementTypes,
  useAllWarehouses,
} from "@/lib/api/query";
import type { StockMovementListRow } from "@/types";
import { formatDate, timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import * as SelectPrimitive from "@radix-ui/react-select";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "emerald",
};

const LIMIT_OPTIONS = [20, 100, 500, 2500] as const;

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeId, setTypeId] = useState("all");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [limit, setLimit] = useState<number>(20);
  const [sortId, setSortId] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: types = [] } = useMovementTypes();
  const { data: warehouses = [] } = useAllWarehouses();

  const infinite = useStockMovementsInfinite({
    query: debouncedQuery || undefined,
    typeId: typeId === "all" ? undefined : typeId,
    fromWarehouseId: fromWarehouseId || undefined,
    toWarehouseId: toWarehouseId || undefined,
    sort: sortId ?? undefined,
    dir: sortDir,
    limit,
  });

  const rows = useMemo(() => {
    const pages = (infinite.data as unknown as { pages: { rows: StockMovementListRow[] }[] } | undefined)?.pages;
    if (!pages) return [] as StockMovementListRow[];
    return pages.flatMap((p) => p.rows);
  }, [infinite.data]);

  const hasNext = (infinite.data as unknown as { pages: { hasNext: boolean }[] } | undefined)?.pages?.slice(-1)[0]?.hasNext ?? false;
  const isLoading = infinite.isLoading;
  const isFetchingNext = infinite.isFetchingNextPage;

  const columns: DataTableColumn<StockMovementListRow>[] = [
    {
      id: "number",
      header: "Movement No",
      sortValue: (m) => m.id,
      cell: (m) => (
        <button
          className="font-mono text-xs font-medium text-primary hover:underline"
          onClick={() => navigate(`/app/transaction/${m.id}`)}
        >
          {m.id}
        </button>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "type",
      header: "Type",
      sortValue: (m) => m.typeName ?? "",
      cell: (m) => (
        <span className="text-xs text-foreground">{m.typeName ?? m.typeCode ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "date",
      header: "Posting Date",
      sortValue: (m) => m.movementDate,
      cell: (m) => (
        <span className="text-xs text-muted-foreground">{formatDate(m.movementDate)}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (m) => m.status,
      cell: (m) => (
        <Badge tone={STATUS_TONE[m.status] ?? "neutral"}>{m.status}</Badge>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "by",
      header: "By",
      sortValue: (m) => m.createdByName ?? "",
      cell: (m) => (
        <span className="text-xs text-muted-foreground">{m.createdByName ?? "—"}</span>
      ),
    },
    {
      id: "created",
      header: "Created",
      sortValue: (m) => m.createdAt,
      cell: (m) => (
        <span className="text-xs text-muted-foreground">{timeAgo(m.createdAt)}</span>
      ),
      className: "whitespace-nowrap",
    },
  ];

  return (
    <MenuGate menu="inventory.transactions">
      <PageHeader
        title="Transaction"
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 w-7 px-0"
              onClick={() => void infinite.refetch()}
              aria-label="Reload transactions"
              disabled={infinite.isFetching}
            >
              <RefreshCw size={14} strokeWidth={2} className="text-muted-foreground" />
            </Button>
            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/transaction/new")}>
              <Plus size={14} strokeWidth={2} />
              New Transaction
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(m) => m.id}
        loading={isLoading}
        pagination="none"
        // sort lazy: tidak kirim sort di awal (backend pakai index createdAt), hanya pas klik header
        initialSort={null}
        sortColumnId="createdAt"
        onSortChange={(s) => {
          // s null = tidak ada sort (awal) -> biarkan null, backend pakai default createdAt index
          // s ada = user klik header -> kirim ke backend
          setSortId(s?.id ?? null);
          setSortDir(s?.dir ?? "desc");
        }}
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
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by no..."
                className="h-8 w-[240px] pl-8 text-xs shadow-none focus-visible:ring-1"
              />
            </div>
            <SearchableSelect
              compact
              value={fromWarehouseId}
              onChange={(v) => setFromWarehouseId(v)}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              placeholder="Source warehouse..."
              emptyLabel="Semua"
              className="w-52"
            />
            <SearchableSelect
              compact
              value={toWarehouseId}
              onChange={(v) => setToWarehouseId(v)}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              placeholder="Target warehouse..."
              emptyLabel="Semua"
              className="w-52"
            />
            <Select
              value={typeId}
              onChange={(e) => setTypeId(e.target.value)}
              className="h-8 w-56 text-xs"
            >
              <option value="all">All types</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </>
        }
        footerLeft={
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Rows per load</span>
            <SelectPrimitive.Root
              value={String(limit)}
              onValueChange={(v) => setLimit(Number(v) as typeof limit)}
            >
              <SelectTrigger aria-label="Rows per load" className="h-7 w-[84px] px-2 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIMIT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectPrimitive.Root>
            <span className="text-xs tabular-nums text-muted-foreground">
              {rows.length} loaded{hasNext ? "+" : ""}
            </span>
          </div>
        }
        footer={
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => void infinite.fetchNextPage()}
            disabled={!hasNext || isFetchingNext || isLoading}
          >
            {isFetchingNext ? (
              <>
                <Loader2 size={12} className="animate-spin" /> Loading...
              </>
            ) : hasNext ? (
              "Load More"
            ) : (
              "No more"
            )}
          </Button>
        }
        minWidth={880}
        emptyIcon={<BadgeCheck size={26} strokeWidth={2} />}
        emptyTitle="No transactions yet"
        emptyDescription="Create a transaction to move stock between warehouses, receive, or issue items."
        onResetFilters={() => {
          setQuery("");
          setTypeId("all");
          setFromWarehouseId("");
          setToWarehouseId("");
          setSortId(null);
          setSortDir("desc");
        }}
      />
      {/* overlay fetching next page */}
      {isFetchingNext && (
        <div className="flex justify-center py-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin mr-1.5" /> Memuat {limit} lagi...
        </div>
      )}
    </MenuGate>
  );
}
