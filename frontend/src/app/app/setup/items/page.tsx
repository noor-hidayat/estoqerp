import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {Package, Plus, Trash2, MoreVertical, Pencil, Trash, Power} from "lucide-react";
import {
  useItems,
  useItemGroups,
  useRemove,
  useUpdate,
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const updateItem = useUpdate("items");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus item ini?")) return;
    try {
      await removeItem.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete item.");
    }
  };

  const handleToggleActive = async (item: Item) => {
    const next = (item as any).isActive === false;
    if (!confirm(next ? `Activate item "${item.name}"?` : `Deactivate item "${item.name}"?`)) return;
    try {
      await updateItem.mutateAsync({ id: item.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

  const items = result?.rows ?? [];
  const total = result?.total ?? 0;

  // Robust maps: handle both publicId (UUID) and legacy internal numeric string.
  // Backend now returns publicId, but fallback to _internalId ensures old cache still renders.
  const itemGroupMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of (itemGroups ?? []) as any[]) {
      m.set(String(c.id), c);
      const internal = (c as any)._internalId;
      if (internal != null) m.set(String(internal), c);
      if ((c as any).code) m.set(String((c as any).code).toLowerCase(), c);
    }
    return m;
  }, [itemGroups]);
  const uomMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const u of (uoms ?? []) as any[]) {
      m.set(String(u.id), u);
      const internal = (u as any)._internalId;
      if (internal != null) m.set(String(internal), u);
      if ((u as any).code) m.set(String((u as any).code).toLowerCase(), u);
    }
    return m;
  }, [uoms]);

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
      cell: (item) => <span className="text-xs text-muted-foreground whitespace-nowrap">{item.code}</span>,
      className: "w-[130px] pr-8 whitespace-nowrap",
    },
    {
      id: "name",
      header: "Item Name",
      cell: (item) => (
        <span className="truncate font-medium whitespace-nowrap" title={item.name}>
          {item.name}
        </span>
      ),
      className: "min-w-[280px] pr-8 whitespace-nowrap",
    },
    {
      id: "itemGroup",
      header: "Item Group",
      cell: (item) => {
        const key = item.itemGroupId != null ? String(item.itemGroupId) : "";
        const found = key ? (itemGroupMap.get(key) ?? itemGroupMap.get(key.toLowerCase())) : null;
        return (
          <Badge tone="neutral" className="rounded-md">
            {found?.name ?? "—"}
          </Badge>
        );
      },
      className: "w-[180px] pr-8",
    },
    {
      id: "unit",
      header: "UOM",
      cell: (item) => {
        const key = (item as any).uomId != null ? String((item as any).uomId) : "";
        const found = key ? (uomMap.get(key) ?? uomMap.get(key.toLowerCase())) : null;
        return (
          <Badge tone="neutral" className="rounded-md whitespace-nowrap">
            {found?.name ?? (found?.code ?? "—")}
          </Badge>
        );
      },
      className: "w-[110px] pr-8",
    },
    {
      id: "uomQty",
      header: "UOM Qty",
      align: "right",
      cell: (item) => (
        <span className="whitespace-nowrap text-xs pr-2">
          {item.uomQty != null ? formatNumber(item.uomQty) : "—"}
        </span>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "isFinishGood",
      header: "Finish Good",
      align: "center",
      cell: (item) => (
        <span className="flex items-center justify-center">
          <Checkbox
            checked={!!(item as any).isFinishGood}
            disabled
            aria-label="Finish Good"
            className="h-3.5 w-3.5 rounded-[4px] [&_svg]:h-3 [&_svg]:w-3"
            tabIndex={-1}
          />
        </span>
      ),
      className: "w-[110px] pr-8 text-center",
    },
    {
      id: "status",
      header: "Status",
      cell: (item) => (
        <Badge tone={(item as any).isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {(item as any).isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      cell: (item) => <span className="whitespace-nowrap text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>,
      className: "w-[150px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (item) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/items/${item.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(item); }} className="gap-2">
              <Power size={14} /> {(item as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(item.id); }} className="gap-2 text-destructive focus:text-destructive">
              <Trash size={14} /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: "w-[70px] text-center",
      align: "center",
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
            onClick={() => navigate("/app/setup/items/new")}
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
        onRowClick={(item) => navigate(`/app/setup/items/${item.id}`)}
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
        minWidth={1310}
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