import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Tag, Trash2 } from "lucide-react";
import { usePriceLists, useRemove } from "@/lib/api/query";
import type { PriceList } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";

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

  if (isLoading) return <ShellLoader />;

  const columns: DataTableColumn<PriceList>[] = [
    {
      id: "name",
      header: "Price List Name",
      sortValue: (p) => p.name,
      cell: (p) => (
        <button
          onClick={() => navigate(`/app/setup/price-lists/${p.id}`)}
          className="truncate text-left font-medium text-foreground hover:text-primary"
          title="Edit price list"
        >
          {p.name}
        </button>
      ),
      className: "min-w-[220px]",
    },
    {
      id: "type",
      header: "Type",
      cell: (p) => (
        <Badge variant={p.type === "PURCHASE" ? "secondary" : "outline"} className="text-xs">
          {p.type === "PURCHASE" ? "Purchase" : "Sales"}
        </Badge>
      ),
      className: "w-[90px]",
    },
    {
      id: "currency",
      header: "Currency",
      cell: (p) => <Badge variant="secondary" className="text-xs font-mono">{p.currency}</Badge>,
      className: "w-[100px]",
    },
    {
      id: "active",
      header: "Status",
      cell: (p) => (
        <Badge tone={p.isActive ? "success" : "neutral"} className="text-[11px]">
          {p.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      className: "w-[100px]",
    },
    {
      id: "valid",
      header: "Valid Period",
      cell: (p) => (
        <span className="text-xs text-muted-foreground">
          {p.validFrom ? p.validFrom.slice(0, 10) : "—"} → {p.validTo ? p.validTo.slice(0, 10) : "—"}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      sortValue: (p) => p.createdAt ?? "",
      cell: (p) => <span className="text-xs text-muted-foreground">{timeAgo(p.createdAt)}</span>,
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
        minWidth={700}
        emptyIcon={<Tag size={26} strokeWidth={2} />}
        emptyTitle="No price lists yet"
        emptyDescription="Add a price list to manage item prices."
      />
    </RoleGuard>
  );
}
