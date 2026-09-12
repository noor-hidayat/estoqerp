import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Percent, Trash2, MoreVertical, Pencil, Trash, Power } from "lucide-react";
import { useTaxCategories, useRemove, useUpdate } from "@/lib/api/query";
import type { TaxCategory } from "@/types";
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

export default function TaxCategoriesPage() {
  const navigate = useNavigate();
  const { data: taxCatsRaw = [], isLoading } = useTaxCategories();
  const removeTax = useRemove("taxCategories");
  const updateTax = useUpdate("taxCategories");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleToggleActive = async (t: TaxCategory) => {
    const next = (t as any).isActive === false;
    if (!confirm(next ? `Activate tax category "${t.name}"?` : `Deactivate tax category "${t.name}"?`)) return;
    try {
      await updateTax.mutateAsync({ id: t.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

  const taxCategories = useMemo(
    () => [...taxCatsRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [taxCatsRaw]
  );

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected tax categor${n > 1 ? "ies" : "y"}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeTax.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (isLoading) return <ShellLoader />;

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus tax category ini?")) return;
    try {
      await removeTax.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete tax category.");
    }
  };

  const columns: DataTableColumn<TaxCategory>[] = [
    {
      id: "name",
      header: "Tax Category Name",
      sortValue: (t) => t.name,
      cell: (t) => (
        <span className="inline-flex items-center font-medium whitespace-nowrap truncate" title={t.name}>
          {t.name}
        </span>
      ),
      className: "min-w-[300px] pr-8 whitespace-nowrap",
    },
    {
      id: "percentage",
      header: "Percentage",
      sortValue: (t) => Number(t.percentage),
      cell: (t) => (
        <Badge variant="secondary" className="rounded-md text-xs font-mono">
          {Number(t.percentage).toFixed(2)}%
        </Badge>
      ),
      className: "w-[130px] pr-8",
    },
    {
      id: "active",
      header: "Status",
      cell: (t) => (
        <Badge tone={t.isActive ? "success" : "neutral"} className="rounded-md text-[11px]">
          {t.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      className: "w-[120px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (t) => t.createdAt ?? "",
      cell: (t) => <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(t.createdAt)}</span>,
      className: "w-[170px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (t) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/tax-categories/${t.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(t); }} className="gap-2">
              <Power size={14} /> {(t as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(t.id); }} className="gap-2 text-destructive focus:text-destructive">
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
        title="Tax Categories"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/tax-categories/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Tax Category
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={taxCategories}
        getRowId={(t) => t.id}
        onRowClick={(t) => navigate(`/app/setup/tax-categories/${t.id}`)}
        searchPlaceholder="Search tax categories..."
        getSearchText={(t) => `${t.code} ${t.name} ${t.percentage}`}
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
        minWidth={780}
        emptyIcon={<Percent size={26} strokeWidth={2} />}
        emptyTitle="No tax categories yet"
        emptyDescription="Add a tax category to use on purchase orders."
      />
    </RoleGuard>
  );
}
