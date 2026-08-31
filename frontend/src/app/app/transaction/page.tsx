import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Plus, RefreshCw, Search } from "lucide-react";
import {
  useStockMovements,
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

const STATUS_TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "emerald",
};

export default function TransactionsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [typeId, setTypeId] = useState("all");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortId, setSortId] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: types = [] } = useMovementTypes();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: result, isLoading, refetch } = useStockMovements({
    query: debouncedQuery || undefined,
    typeId: typeId === "all" ? undefined : typeId,
    fromWarehouseId: fromWarehouseId || undefined,
    toWarehouseId: toWarehouseId || undefined,
    sort: sortId,
    dir: sortDir,
    page,
    pageSize,
  });

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;

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
              onClick={() => void refetch()}
              aria-label="Reload transactions"
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
                placeholder="Search by no..."
                className="h-8 w-[240px] pl-8 text-xs shadow-none focus-visible:ring-1"
              />
            </div>
            <SearchableSelect
              compact
              value={fromWarehouseId}
              onChange={(v) => {
                setFromWarehouseId(v);
                setPage(1);
              }}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              placeholder="Source warehouse..."
              emptyLabel="Semua"
              className="w-52"
            />
            <SearchableSelect
              compact
              value={toWarehouseId}
              onChange={(v) => {
                setToWarehouseId(v);
                setPage(1);
              }}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
              placeholder="Target warehouse..."
              emptyLabel="Semua"
              className="w-52"
            />
            <Select
              value={typeId}
              onChange={(e) => {
                setTypeId(e.target.value);
                setPage(1);
              }}
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
        pagination="server"
        initialSort={{ id: "createdAt", dir: "desc" }}
        sortColumnId="createdAt"
        onSortChange={(s) => {
          setSortId(s?.id ?? "");
          setSortDir(s?.dir ?? "asc");
          setPage(1);
        }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(ps) => {
          setPageSize(ps);
          setPage(1);
        }}
        minWidth={880}
        emptyIcon={<BadgeCheck size={26} strokeWidth={2} />}
        emptyTitle="No transactions yet"
        emptyDescription="Create a transaction to move stock between warehouses, receive, or issue items."
        onResetFilters={() => {
          setQuery("");
          setTypeId("all");
          setFromWarehouseId("");
          setToWarehouseId("");
          setPage(1);
        }}
      />
    </MenuGate>
  );
}