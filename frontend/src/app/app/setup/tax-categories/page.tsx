import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Percent, Trash2, Pencil } from "lucide-react";
import { useTaxCategories, useRemove } from "@/lib/api/query";
import type { TaxCategory } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";

export default function TaxCategoriesPage() {
  const navigate = useNavigate();
  const { data: taxCatsRaw = [], isLoading } = useTaxCategories();
  const removeTax = useRemove("taxCategories");
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const columns: DataTableColumn<TaxCategory>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (t) => t.code,
      cell: (t) => <span className="text-xs font-medium text-muted-foreground">{t.code}</span>,
    },
    {
      id: "name",
      header: "Tax Category Name",
      sortValue: (t) => t.name,
      cell: (t) => (
        <button
          onClick={() => navigate(`/app/setup/tax-categories/${t.id}`)}
          className="truncate text-left font-medium text-foreground transition-colors hover:text-primary"
          title="Edit tax category"
        >
          {t.name}
        </button>
      ),
      className: "min-w-[220px]",
    },
    {
      id: "percentage",
      header: "Percentage",
      sortValue: (t) => Number(t.percentage),
      cell: (t) => (
        <Badge variant="secondary" className="text-xs font-mono">
          {Number(t.percentage).toFixed(2)}%
        </Badge>
      ),
      className: "w-[120px]",
    },
    {
      id: "active",
      header: "Status",
      cell: (t) => (
        <Badge tone={t.isActive ? "success" : "neutral"} className="text-[11px]">
          {t.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      className: "w-[100px]",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (t) => t.createdAt ?? "",
      cell: (t) => <span className="text-xs text-muted-foreground">{timeAgo(t.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (t) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/app/setup/tax-categories/${t.id}`);
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
        minWidth={640}
        emptyIcon={<Percent size={26} strokeWidth={2} />}
        emptyTitle="No tax categories yet"
        emptyDescription="Add a tax category to use on purchase orders."
      />
    </RoleGuard>
  );
}
