"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, Trash2 } from "lucide-react";
import { useBranches, useAllWarehouses, useRemove } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";
import type { Branch } from "@/types";

export default function BranchesPage() {
  const navigate = useNavigate();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const { data: warehouses = [] } = useAllWarehouses();
  const removeBranch = useRemove("branches");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected branch${n > 1 ? "es" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeBranch.mutateAsync(id)));
      setSelected(new Set());
    } catch {
      alert("Cannot delete some branches because they are still used by warehouses or projects.");
    }
  };

  if (branchesLoading) return <ShellLoader />;

  const columns: DataTableColumn<Branch>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (b) => b.code,
      cell: (b) => <span className="font-mono text-xs text-muted-foreground">{b.code}</span>,
    },
    {
      id: "name",
      header: "Branch Name",
      sortValue: (b) => b.name,
      cell: (b) => <span className="font-medium text-foreground">{b.name}</span>,
      className: "min-w-[200px]",
    },
    {
      id: "city",
      header: "City",
      sortValue: (b) => b.city,
      cell: (b) => <span className="text-muted-foreground">{b.city}</span>,
    },
    {
      id: "warehouses",
      header: "Warehouse Count",
      align: "right",
      cell: (b) => (
        <Badge tone="neutral">
          {warehouses.filter((w) => w.branchId === b.id).length} warehouses
        </Badge>
      ),
    },
    {
      id: "created",
      header: "Created",
      sortValue: (b) => b.createdAt ?? "",
      cell: (b) => <span className="text-xs text-muted-foreground">{timeAgo(b.createdAt)}</span>,
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.branches"]}>
      <PageHeader
        title="Branches"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/data-library/branches/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Add Branch
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={branches}
        getRowId={(b) => b.id}
        searchPlaceholder="Search branches..."
        getSearchText={(b) => `${b.code} ${b.name} ${b.city}`}
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
        emptyIcon={<Building2 size={26} strokeWidth={2} />}
        emptyTitle="No branches yet"
        emptyDescription="Add your first branch for the organization structure."
      />
    </RoleGuard>
  );
}