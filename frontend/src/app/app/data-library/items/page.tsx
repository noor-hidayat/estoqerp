"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Plus, Trash2 } from "lucide-react";
import {
  useItems,
  useItemGroups,
  useRemove,
  useUoms,
} from "@/lib/api/query";
import { formatNumber, timeAgo } from "@/lib/utils";
import type { Item } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

export default function ItemsPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [itemGroupFilter, setItemGroupFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const {
    data: result,
    isLoading: itemsLoading,
  } = useItems({
    query: query || undefined,
    itemGroupId: itemGroupFilter === "all" ? undefined : itemGroupFilter,
    page,
    pageSize,
  });
  const { data: itemGroups, isLoading: itemGroupsLoading } = useItemGroups();
  const { data: uoms = [] } = useUoms();
  const removeItem = useRemove("items");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = result?.rows ?? [];
  const total = result?.total ?? 0;

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
      id: "itemGroup",
      header: "Item Group",
      cell: (item) => (
        <Badge tone="neutral">
          {(itemGroups ?? []).find((c) => c.id === item.itemGroupId)?.name ?? "—"}
        </Badge>
      ),
    },
    {
      id: "unit",
      header: "UOM",
      cell: (item) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {item.uomId ? (uoms.find((u) => u.id === item.uomId)?.name ?? "—") : "—"}
        </span>
      ),
    },
    {
      id: "alternativeCode",
      header: "Alternative Code",
      cell: (item) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {item.alternativeCode || "—"}
        </span>
      ),
    },
    {
      id: "uomQty",
      header: "UOM Qty",
      align: "right",
      cell: (item) => (
        <span className="whitespace-nowrap font-mono text-xs">
          {item.uomQty != null ? formatNumber(item.uomQty) : "—"}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      cell: (item) => <span className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>,
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
      <PageHeader
        title="Items"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/data-library/items/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Item
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={items}
        getRowId={(item) => item.id}
        loading={itemsLoading || itemGroupsLoading}
        searchPlaceholder="Search any field..."
        searchValue={query}
        onSearchChange={(q) => {
          setQuery(q);
          setPage(1);
        }}
        filters={
          <Select
            value={itemGroupFilter}
            onChange={(e) => {
              setItemGroupFilter(e.target.value);
              setPage(1);
            }}
            className="h-8 w-52 text-xs"
          >
            <option value="all">All item groups</option>
            {(itemGroups ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
          setItemGroupFilter("all");
          setPage(1);
        }}
      />
    </RoleGuard>
  );
}