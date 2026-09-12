import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {Plus, Tag, Trash2, MoreVertical, Pencil, Trash, Power} from "lucide-react";
import { useItemGroups, useRemove, useUpdate } from "@/lib/api/query";
import type { ItemGroup } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function ItemGroupsPage() {
  const navigate = useNavigate();
  const { data: itemGroupsRaw = [], isLoading: itemGroupsLoading } = useItemGroups();
  const removeItemGroup = useRemove("itemGroups");
  const updateItemGroup = useUpdate("itemGroups");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const itemGroups = useMemo(
    () => [...itemGroupsRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [itemGroupsRaw]
  );

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus item group ini?")) return;
    try {
      await removeItemGroup.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete item group.");
    }
  };

  const handleToggleActive = async (c: ItemGroup) => {
    const next = (c as any).isActive === false;
    if (!confirm(next ? `Activate item group "${c.name}"?` : `Deactivate item group "${c.name}"?`)) return;
    try {
      await updateItemGroup.mutateAsync({ id: c.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

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

  if (itemGroupsLoading) return <ShellLoader />;

  const columns: DataTableColumn<ItemGroup>[] = [
    {
      id: "name",
      header: "Item Group Name",
      sortValue: (c) => c.name,
      cell: (c) => (
        <span className="inline-flex items-center font-medium whitespace-nowrap truncate" title={c.name}>
          {c.name}
        </span>
      ),
      className: "min-w-[360px] pr-8 whitespace-nowrap",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (c) => (c.isActive === false ? 0 : 1),
      cell: (c) => (
        <Badge tone={c.isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {c.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (c) => c.createdAt ?? "",
      cell: (c) => <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(c.createdAt)}</span>,
      className: "w-[170px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/item-groups/${c.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(c); }} className="gap-2">
              <Power size={14} /> {(c as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(c.id); }} className="gap-2 text-destructive focus:text-destructive">
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
        minWidth={790}
        emptyIcon={<Tag size={26} strokeWidth={2} />}
        emptyTitle="No item groups yet"
        emptyDescription="Add an item group to group items."
      />
    </RoleGuard>
  );
}