import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Tag, Trash2, MoreVertical, Pencil, Trash, Power } from "lucide-react";
import { usePriceLists, useRemove, useUpdate } from "@/lib/api/query";
import type { PriceList } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function PriceListsPage() {
  const navigate = useNavigate();
  const { data: listsRaw = [], isLoading } = usePriceLists();
  const remove = useRemove("priceLists");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const lists = useMemo(() => [...listsRaw].sort((a, b) => a.name.localeCompare(b.name)), [listsRaw]);

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected price list${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => remove.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const update = useUpdate("priceLists");

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus price list ini?")) return;
    try {
      await remove.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete.");
    }
  };

  const handleToggleActive = async (p: PriceList) => {
    const next = !(p as any).isActive;
    if (!confirm(next ? `Activate "${p.name}"?` : `Deactivate "${p.name}"?`)) return;
    try {
      await update.mutateAsync({ id: p.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update.");
    }
  };

  if (isLoading) return <ShellLoader />;

  const columns: DataTableColumn<PriceList>[] = [
    {
      id: "name",
      header: "Pricelist Name",
      sortValue: (p) => p.name,
      cell: (p) => (
        <span className="truncate font-medium whitespace-nowrap" title={p.name}>
          {p.name}
        </span>
      ),
      className: "min-w-[280px] pr-8 whitespace-nowrap",
    },
    {
      id: "type",
      header: "Type",
      cell: (p) => (
        <Badge variant={p.type === "PURCHASE" ? "secondary" : "outline"} className="rounded-md text-xs">
          {p.type === "PURCHASE" ? "Purchase" : "Sales"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "currency",
      header: "Currency",
      cell: (p) => <Badge variant="secondary" className="rounded-md text-xs font-mono">{p.currency}</Badge>,
      className: "w-[110px] pr-8",
    },
    {
      id: "active",
      header: "Status",
      cell: (p) => (
        <Badge tone={p.isActive ? "success" : "neutral"} className="rounded-md text-[11px]">
          {p.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (p) => p.createdAt ?? "",
      cell: (p) => <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(p.createdAt)}</span>,
      className: "w-[160px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (p) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/price-lists/${p.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(p); }} className="gap-2">
              <Power size={14} /> {p.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(p.id); }} className="gap-2 text-destructive focus:text-destructive">
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
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <PageHeader
        title="Price Lists"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/price-lists/new")}>
            <Plus size={14} strokeWidth={2} /> Add Price List
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={lists}
        getRowId={(p) => p.id}
        onRowClick={(p) => navigate(`/app/setup/price-lists/${p.id}`)}
        searchPlaceholder="Search price lists..."
        getSearchText={(p) => `${p.name} ${p.currency} ${p.type}`}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        toolbarRight={
          selected.size > 0 ? (
            <Button variant="destructive" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleBulkRemove}>
              <Trash2 className="h-3.5 w-3.5" /> Delete ({selected.size})
            </Button>
          ) : null
        }
        minWidth={900}
        emptyIcon={<Tag size={26} strokeWidth={2} />}
        emptyTitle="No price lists yet"
        emptyDescription="Add a price list to manage item prices."
      />
    </RoleGuard>
  );
}
