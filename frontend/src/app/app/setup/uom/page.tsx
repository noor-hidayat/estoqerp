import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Ruler, Trash2 } from "lucide-react";
import { useUoms, useRemove } from "@/lib/api/query";
import type { Uom } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import { timeAgo } from "@/lib/utils";

export default function UomPage() {
  const navigate = useNavigate();
  const { data: uomsRaw = [], isLoading } = useUoms();
  const removeUom = useRemove("uom");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const uoms = useMemo(
    () => [...uomsRaw].sort((a, b) => a.code.localeCompare(b.code)),
    [uomsRaw]
  );

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
      id: "created",
      header: "Created",
      sortValue: (u) => u.createdAt ?? "",
      cell: (u) => <span className="text-xs text-muted-foreground">{timeAgo(u.createdAt)}</span>,
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.uom"]}>
      <PageHeader
        title="UOM"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/uom/new")}
          >
            <Plus size={14} strokeWidth={2} />
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