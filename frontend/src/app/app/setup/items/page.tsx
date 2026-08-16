"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  useItems,
  useCategories,
  useRemove,
} from "@/lib/api/query";
import { formatNumber } from "@/lib/utils";
import type { Item } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ItemsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const {
    data: result,
    isLoading: itemsLoading,
  } = useItems({
    query: query || undefined,
    categoryId: categoryFilter === "all" ? undefined : categoryFilter,
    page,
    pageSize,
  });
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const removeItem = useRemove("items");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = result?.rows ?? [];
  const total = result?.total ?? 0;

  const handleRemove = async (item: Item) => {
    if (
      !confirm(
        `Delete item "${item.name}"? Related stock balance will also be deleted; scan history remains preserved.`
      )
    )
      return;
    try {
      await removeItem.mutateAsync(item.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete item.");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (
      !confirm(
        `Delete ${n} selected item${n > 1 ? "s" : ""}? Related stock balance will also be deleted; scan history remains preserved.`
      )
    )
      return;
    try {
      await Promise.all([...selected].map((id) => removeItem.mutateAsync(id)));
      setSelected(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete items.");
    }
  };

  const columns: DataTableColumn<Item>[] = [
    {
      id: "code",
      header: "Item Code",
      cell: (item) => <span className="font-mono text-xs text-muted-foreground">{item.code}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "name",
      header: "Item Name",
      cell: (item) => <span className="font-medium text-foreground">{item.name}</span>,
      className: "min-w-[220px]",
    },
    {
      id: "category",
      header: "Category",
      cell: (item) => (
        <Badge tone="neutral">
          {(categories ?? []).find((c) => c.id === item.categoryId)?.name ?? "—"}
        </Badge>
      ),
    },
    {
      id: "unit",
      header: "UOM",
      cell: (item) => <span className="whitespace-nowrap text-muted-foreground">{item.unit}</span>,
    },
    {
      id: "barcode",
      header: "Barcode",
      cell: (item) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {item.barcodeId || item.code}
        </span>
      ),
    },
    {
      id: "qty",
      header: "Qty/Box",
      align: "right",
      cell: (item) => (
        <span className="whitespace-nowrap font-mono text-xs">
          {item.qty != null ? formatNumber(item.qty) : "—"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${item.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/setup/items/${item.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleRemove(item)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
      <PageHeader
        title="Items"

        actions={
          <Button onClick={() => navigate("/app/setup/items/new")}>
            <Plus size={15} strokeWidth={2} />
            Add Item
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={items}
        getRowId={(item) => item.id}
        loading={itemsLoading || categoriesLoading}
        searchPlaceholder="Search any field..."
        searchValue={query}
        onSearchChange={(q) => {
          setQuery(q);
          setPage(1);
        }}
        filters={
          <Select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 w-52 text-xs"
          >
            <option value="all">All categories</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        }
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        toolbarRight={
          selected.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleBulkRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ({selected.size})
            </Button>
          ) : null
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
        minWidth={1000}
        emptyIcon={<Package size={26} strokeWidth={2} />}
        emptyTitle="No items"
        emptyDescription="Add a new item or adjust your search filters."
        onResetFilters={() => {
          setQuery("");
          setCategoryFilter("all");
          setPage(1);
        }}
      />
    </RoleGuard>
  );
}