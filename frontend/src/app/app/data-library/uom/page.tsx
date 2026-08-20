"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreHorizontal, Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import { useUoms, useRemove } from "@/lib/api/query";
import type { Uom } from "@/types";
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

export default function UomPage() {
  const navigate = useNavigate();
  const { data: uomsRaw = [], isLoading } = useUoms();
  const removeUom = useRemove("uom");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const uoms = useMemo(
    () => [...uomsRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [uomsRaw]
  );

  const handleRemove = async (u: Uom) => {
    if (!confirm(`Delete UOM "${u.code}"?`)) return;
    try {
      await removeUom.mutateAsync(u.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected UOM${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeUom.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (isLoading) return <ShellLoader />;

  const columns: DataTableColumn<Uom>[] = [
    {
      id: "code",
      header: "Code",
      sortValue: (u) => u.code,
      cell: (u) => <span className="font-mono text-xs text-muted-foreground">{u.code}</span>,
    },
    {
      id: "name",
      header: "UOM Name",
      sortValue: (u) => u.name,
      cell: (u) => <span className="font-medium text-foreground">{u.name}</span>,
      className: "min-w-[220px]",
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${u.code}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/data-library/uom/${u.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleRemove(u)}
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
    <RoleGuard roles={MANAGER_ROLES} menus={["master.uom"]}>
      <PageHeader
        title="UOM"
        description="Unit of measure used for items and transactions."
        actions={
          <Button onClick={() => navigate("/app/data-library/uom/new")}>
            <Plus size={15} strokeWidth={2} />
            Add UOM
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={uoms}
        getRowId={(u) => u.id}
        searchPlaceholder="Search UOM..."
        getSearchText={(u) => `${u.code} ${u.name}`}
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
        emptyIcon={<Ruler size={26} strokeWidth={2} />}
        emptyTitle="No UOM yet"
        emptyDescription="Add a unit of measure to use on items and transactions."
      />
    </RoleGuard>
  );
}