import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {Plus, Ruler, Trash2, MoreVertical, Pencil, Trash, Power} from "lucide-react";
import { useUoms, useRemove, useUpdate } from "@/lib/api/query";
import type { Uom } from "@/types";
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

export default function UomPage() {
  const navigate = useNavigate();
  const { data: uomsRaw = [], isLoading } = useUoms();
  const removeUom = useRemove("uom");
  const updateUom = useUpdate("uom");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleToggleActive = async (u: Uom) => {
    const next = (u as any).isActive === false;
    if (!confirm(next ? `Activate UOM "${u.name}"?` : `Deactivate UOM "${u.name}"?`)) return;
    try {
      await updateUom.mutateAsync({ id: u.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

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

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus UOM ini?")) return;
    try {
      await removeUom.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete UOM.");
    }
  };

  const columns: DataTableColumn<Uom>[] = [
    {
      id: "name",
      header: "UOM Name",
      sortValue: (u) => u.name,
      cell: (u) => (
        <span className="inline-flex items-center font-medium whitespace-nowrap truncate" title={u.name}>
          {u.name}
        </span>
      ),
      className: "min-w-[360px] pr-8 whitespace-nowrap",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (u) => (u.isActive === false ? 0 : 1),
      cell: (u) => (
        <Badge tone={u.isActive === false ? "neutral" : "success"} className="rounded-md text-[11px]">
          {u.isActive === false ? "Inactive" : "Active"}
        </Badge>
      ),
      className: "w-[110px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (u) => u.createdAt ?? "",
      cell: (u) => <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(u.createdAt)}</span>,
      className: "w-[170px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/uom/${u.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(u); }} className="gap-2">
              <Power size={14} /> {(u as any).isActive === false ? "Activate" : "Deactivate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(u.id); }} className="gap-2 text-destructive focus:text-destructive">
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
        onRowClick={(u) => navigate(`/app/setup/uom/${u.id}`)}
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
        minWidth={790}
        emptyIcon={<Ruler size={26} strokeWidth={2} />}
        emptyTitle="No UOM yet"
        emptyDescription="Add a unit of measure to use on items and transactions."
      />
    </RoleGuard>
  );
}