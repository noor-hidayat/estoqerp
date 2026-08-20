"use client";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  BadgeCheck,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import {
  useStockMovements,
  useMovementTypes,
  useAllWarehouses,
  usePostMovement,
  useDeleteMovement,
} from "@/lib/api/query";
import type { StockMovementListRow } from "@/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const { data: types = [] } = useMovementTypes();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: result, isLoading } = useStockMovements({
    query: debouncedQuery || undefined,
    typeId: typeId === "all" ? undefined : typeId,
    fromWarehouseId: fromWarehouseId || undefined,
    toWarehouseId: toWarehouseId || undefined,
    page,
    pageSize,
  });
  const postMovement = usePostMovement();
  const deleteMovement = useDeleteMovement();

  const rows = result?.rows ?? [];
  const total = result?.total ?? 0;

  const handlePost = async (m: StockMovementListRow) => {
    if (!confirm(`Post transaction "${m.movementNumber}"? Stock will be applied.`)) return;
    try {
      await postMovement.mutateAsync(m.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to post");
    }
  };

  const handleDelete = async (m: StockMovementListRow) => {
    if (!confirm(`Delete transaction "${m.movementNumber}"?`)) return;
    try {
      await deleteMovement.mutateAsync(m.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const columns: DataTableColumn<StockMovementListRow>[] = [
    {
      id: "number",
      header: "Movement No",
      sortValue: (m) => m.movementNumber,
      cell: (m) => (
        <button
          className="font-mono text-xs font-medium text-primary hover:underline"
          onClick={() => navigate(`/app/transaction/${m.id}`)}
        >
          {m.movementNumber}
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
      header: "Date",
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
      id: "reference",
      header: "Reference",
      sortValue: (m) => m.referenceId ?? "",
      cell: (m) => (
        <span className="font-mono text-xs text-muted-foreground">{m.referenceId ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "details",
      header: "Items",
      align: "right",
      sortValue: (m) => m.detailCount,
      cell: (m) => (
        <span className="text-xs text-muted-foreground">
          {m.detailCount} row{m.detailCount === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      id: "qty",
      header: "Total Qty",
      align: "right",
      sortValue: (m) => m.totalQty,
      cell: (m) => (
        <span className="font-mono text-xs font-medium tabular-nums">
          {formatNumber(m.totalQty)}
        </span>
      ),
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
      id: "actions",
      header: "",
      align: "right",
      cell: (m) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${m.movementNumber}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => navigate(`/app/transaction/${m.id}`)}>
              <ArrowLeftRight className="mr-2 h-3.5 w-3.5" />
              View
            </DropdownMenuItem>
            {m.status === "DRAFT" && (
              <>
                <DropdownMenuItem onClick={() => navigate(`/app/transaction/${m.id}/edit`)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handlePost(m)}>
                  <Send className="mr-2 h-3.5 w-3.5" />
                  Post
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDelete(m)}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <MenuGate menu="inventory.transactions">
      <PageHeader
        title="Transaction"
        actions={
          <Button onClick={() => navigate("/app/transaction/new")}>
            <Plus size={15} strokeWidth={2} />
            New Transaction
          </Button>
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
