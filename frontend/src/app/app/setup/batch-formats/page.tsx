import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {Plus, Trash2, MoreVertical, Pencil, Trash, Power} from "lucide-react";
import { useBatchFormats, useRemove, useUpdate } from "@/lib/api/query";
import { timeAgo } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { ShellLoader } from "@/components/ui/loader";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BatchFormat } from "@/types";



export default function BatchFormatsPage() {
  const navigate = useNavigate();
  const { data: formats = [], isLoading } = useBatchFormats();
  const update = useUpdate("batchFormats");
  const removeFormat = useRemove("batchFormats");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected format${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeFormat.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete. This format may still be used by a barcode format.");
    }
  };

  const sorted = useMemo(
    () => [...formats].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [formats]
  );

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus format ini?")) return;
    try {
      await removeFormat.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete format.");
    }
  };

  const handleToggleActive = async (f: BatchFormat) => {
    const next = !f.isActive;
    if (!confirm(next ? `Activate "${f.name}"?` : `Deactivate "${f.name}"?`)) return;
    update.mutate({ id: f.id, patch: { isActive: next } });
  };

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.batchFormats"]}>
        <PageHeader title="Batch Formats" />
        <ShellLoader />
      </RoleGuard>
    );
  }

  const columns: DataTableColumn<BatchFormat>[] = [
    {
      id: "name",
      header: "Name",
      sortValue: (f) => f.name,
      cell: (f) => (
        <span className="inline-flex items-center font-medium whitespace-nowrap truncate" title={f.name}>
          {f.name}
        </span>
      ),
      className: "min-w-[360px] pr-8 whitespace-nowrap",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (f) => (f.isActive ? 1 : 0),
      cell: (f) => (
        <Badge tone={f.isActive ? "success" : "neutral"} className="rounded-md text-[11px]">
          {f.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      className: "w-[130px] pr-8",
    },
    {
      id: "created",
      header: "Created",
      sortValue: (f) => f.createdAt ?? "",
      cell: (f) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {timeAgo(f.createdAt)}
        </span>
      ),
      className: "w-[170px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (f) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/batch-formats/${f.id}`); }} className="gap-2">
              <Pencil size={14} /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(f); }} className="gap-2">
              <Power size={14} /> {f.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(f.id); }} className="gap-2 text-destructive focus:text-destructive">
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
    <RoleGuard roles={MANAGER_ROLES} menus={["master.batchFormats"]}>
      <PageHeader
        title="Format Batch"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/batch-formats/new")}
          >
            <Plus size={14} strokeWidth={2} />
            Create Format
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={sorted}
        getRowId={(f) => f.id}
        onRowClick={(f) => navigate(`/app/setup/batch-formats/${f.id}`)}
        searchPlaceholder="Search formats..."
        getSearchText={(f) => `${f.name} ${f.description ?? ""}`}
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
        minWidth={760}
        emptyIcon={null}
        emptyTitle="No batch formats yet"
        emptyDescription="Create your first format to define how batch numbers are parsed into date, shift, and custom fields."
      />
    </RoleGuard>
  );
}