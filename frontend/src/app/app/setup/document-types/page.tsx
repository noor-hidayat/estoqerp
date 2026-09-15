import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, MoreVertical, Pencil, Trash, Power } from "lucide-react";
import { useDocumentSeries, useRemove, useUpdate } from "@/lib/api/query";
import type { DocumentSeries } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


export default function DocumentTypesPage() {
  const navigate = useNavigate();
  const { isSystem, permissions } = useSession();
  const canCreate = can(isSystem, permissions, "master.documentTypes", "create");
  const canUpdate = can(isSystem, permissions, "master.documentTypes", "update");
  const canDelete = can(isSystem, permissions, "master.documentTypes", "delete");
  const { data: seriesRaw = [], isLoading } = useDocumentSeries();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const removeSeries = useRemove("documentSeries");
  const updateSeries = useUpdate("documentSeries");

  const handleDeleteOne = async (id: string) => {
    if (!confirm("Hapus series ini?")) return;
    try {
      await removeSeries.mutateAsync(id);
    } catch (e: any) {
      alert(e.message ?? "Cannot delete series.");
    }
  };

  const handleToggleActive = async (s: DocumentSeries) => {
    const next = !s.isActive;
    if (!confirm(next ? `Activate "${s.name}"?` : `Deactivate "${s.name}"?`)) return;
    try {
      await updateSeries.mutateAsync({ id: s.id, patch: { isActive: next } });
    } catch (e: any) {
      alert(e.message ?? "Failed to update status.");
    }
  };

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected series?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeSeries.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: any) {
      alert(e.message ?? "Failed to delete.");
    }
  };

  if (isLoading) return <ShellLoader />;

  const seriesColumns: DataTableColumn<DocumentSeries>[] = [
    {
      id: "name",
      header: "Name",
      sortValue: (s) => s.name,
      cell: (s) => <span className="truncate font-medium whitespace-nowrap" title={s.name}>{s.name}</span>,
      className: "min-w-[260px] pr-8 whitespace-nowrap",
    },
    {
      id: "type",
      header: "Document Type",
      sortValue: (s) => s.typeName ?? "",
      cell: (s) => <Badge tone="neutral" className="rounded-md">{s.typeName ?? ""}</Badge>,
      className: "w-[180px] pr-8",
    },
    {
      id: "preview",
      header: "Preview",
      sortValue: (s) => s.preview ?? s.format,
      cell: (s) => {
        const preview = (s as any).preview ?? s.format.replace("{PREFIX}", s.prefix);
        return <span className="font-mono text-xs whitespace-nowrap truncate" title={preview}>{preview}</span>;
      },
      className: "min-w-[260px] pr-8 whitespace-nowrap",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (s) => String(s.isActive),
      cell: (s) => <Badge tone={s.isActive ? "success" : "neutral"} className="rounded-md text-[11px]">{s.isActive ? "Active" : "Inactive"}</Badge>,
      className: "w-[110px] pr-8",
    },
    {
      id: "actions",
      header: "Action",
      cell: (s) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
              <MoreVertical size={14} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {canUpdate && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/app/setup/document-types/${s.id}`); }} className="gap-2">
                <Pencil size={14} /> Edit
              </DropdownMenuItem>
            )}
            {canUpdate && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleActive(s); }} className="gap-2">
                <Power size={14} /> {s.isActive ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDeleteOne(s.id); }} className="gap-2 text-destructive focus:text-destructive">
                <Trash size={14} /> Delete
              </DropdownMenuItem>
            )}
            {!canUpdate && !canDelete && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No actions</div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      className: "w-[70px] text-center",
      align: "center",
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.documentTypes"]}>
      <PageHeader
        title="Document Numbering"
        actions={
          canCreate ? (
            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/document-types/new")}>
              <Plus size={14} /> Add Series
            </Button>
          ) : null
        }
      />

      <DataTable
        columns={seriesColumns}
        data={seriesRaw}
        getRowId={(s) => s.id}
        onRowClick={(s) => navigate(`/app/setup/document-types/${s.id}`)}
        searchPlaceholder="Search series..."
        getSearchText={(s) => `${s.name} ${s.prefix} ${s.format} ${s.typeName ?? ""} ${s.preview ?? ""}`}
        selectable={canDelete}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        toolbarRight={
          canDelete && selected.size > 0 ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleBulkRemove}
            >
              <Trash size={14} /> Delete ({selected.size})
            </Button>
          ) : null
        }
        minWidth={900}
        emptyIcon={<FileText size={26} />}
        emptyTitle="No series yet"
        emptyDescription="Create series per document type."
      />
    </RoleGuard>
  );
}
