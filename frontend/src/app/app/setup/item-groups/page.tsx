import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {Plus, Tag, Trash2, Pencil} from "lucide-react";
import { useItemGroups, useItemGroupCounts, useRemove } from "@/lib/api/query";
import type { ItemGroup } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";

export default function ItemGroupsPage() {
  const navigate = useNavigate();
  const { data: itemGroupsRaw = [], isLoading: itemGroupsLoading } = useItemGroups();
  const { data: countsData } = useItemGroupCounts();
  const removeItemGroup = useRemove("itemGroups");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const itemGroups = useMemo(
    () => [...itemGroupsRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [itemGroupsRaw]
  );

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected item group${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeItemGroup.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const itemCount = (igId: string) => countsData?.counts[igId] ?? 0;

  if (itemGroupsLoading) return <ShellLoader />;

  const columns: DataTableColumn<ItemGroup>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (c) => c.code,
      cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.code}</span>,
    },
    {
      id: "name",
      header: "Item Group Name",
      sortValue: (c) => c.name,
      cell: (c) => (
        <button
          onClick={() => navigate(`/app/setup/item-groups/${c.id}`)}
          className="truncate text-left font-medium text-foreground transition-colors hover:text-primary"
          title="Edit item group"
        >
          {c.name}
        </button>
      ),
      className: "min-w-[220px]",
    },
    {
      id: "items",
      header: "Item Count",
      align: "right",
      cell: (c) => <span className="text-muted-foreground">{itemCount(c.id)} items</span>,
    },
    {
      id: "created",
      header: "Created",
      sortValue: (c) => c.createdAt ?? "",
      cell: (c) => <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (c) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/app/setup/item-groups/${c.id}`);
          }}
        >
          <Pencil size={12} strokeWidth={2} />
          Edit
        </Button>
      ),
      className: "w-[90px] text-right",
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.itemGroups"]}>
      <PageHeader
        title="Item Groups"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/item-groups/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Item Group
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={itemGroups}
        getRowId={(c) => c.id}
        onRowClick={(c) => navigate(`/app/setup/item-groups/${c.id}`)}
        searchPlaceholder="Search item groups..."
        getSearchText={(c) => `${c.code} ${c.name}`}
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
        minWidth={560}
        emptyIcon={<Tag size={26} strokeWidth={2} />}
        emptyTitle="No item groups yet"
        emptyDescription="Add an item group to group items."
      />
    </RoleGuard>
  );
}