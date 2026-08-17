"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useCategories, useItemsList, useRemove } from "@/lib/api/query";
import type { Category } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShellLoader } from "@/components/ui/loader";

export default function CategoriesPage() {
  const navigate = useNavigate();
  const { data: categoriesRaw = [], isLoading: categoriesLoading } = useCategories();
  const { data: items = [] } = useItemsList();
  const removeCategory = useRemove("categories");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const categories = useMemo(
    () => [...categoriesRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [categoriesRaw]
  );

  const handleRemove = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.code}"?`)) return;
    try {
      await removeCategory.mutateAsync(cat.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected categor${n > 1 ? "ies" : "y"}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeCategory.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const itemCount = (catId: string) =>
    items.filter((i) => i.categoryId === catId).length;

  if (categoriesLoading) return <ShellLoader />;

  const columns: DataTableColumn<Category>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (c) => c.code,
      cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.code}</span>,
    },
    {
      id: "name",
      header: "Category Name",
      sortValue: (c) => c.name,
      cell: (c) => <span className="font-medium text-foreground">{c.name}</span>,
      className: "min-w-[220px]",
    },
    {
      id: "items",
      header: "Item Count",
      align: "right",
      cell: (c) => <span className="text-muted-foreground">{itemCount(c.id)} items</span>,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${c.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/data-library/categories/${c.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleRemove(c)}
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
    <RoleGuard roles={MANAGER_ROLES} menus={["master.categories"]}>
      <PageHeader
        title="Categories"

        actions={
          <Button onClick={() => navigate("/app/data-library/categories/new")}>
            <Plus size={15} strokeWidth={2} />
            Add Category
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={categories}
        getRowId={(c) => c.id}
        searchPlaceholder="Search categories..."
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
        emptyTitle="No categories yet"
        emptyDescription="Add a category to group items."
      />
    </RoleGuard>
  );
}