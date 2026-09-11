import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, GitBranch, Trash2 } from "lucide-react";
import { useWorkflows, useRemoveWorkflow } from "@/lib/api/query";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { timeAgo } from "@/lib/utils";
import type { Workflow } from "@/types";

export default function WorkflowsPage() {
  const navigate = useNavigate();
  const { data: workflows, isLoading } = useWorkflows();
  const remove = useRemoveWorkflow();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => (workflows ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [workflows]);

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (!confirm(`Delete ${ids.length} workflow(s)?`)) return;
    for (const id of ids) await remove.mutateAsync(id);
    setSelected(new Set());
  };

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;

  const columns: DataTableColumn<Workflow>[] = [
    {
      id: "name",
      header: "Name",
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    {
      id: "documentType",
      header: "Document",
      cell: (r) => <Badge tone="neutral">{r.documentType}</Badge>,
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => <DocStatusBadge status={(r as any).status ?? "DRAFT"} />,
    },
    {
      id: "isDefault",
      header: "Default",
      cell: (r) => (r.isDefault ? <Badge tone="emerald">Default</Badge> : <span className="text-xs text-muted-foreground">—</span>),
    },
    {
      id: "isActive",
      header: "Active",
      cell: (r) => <Badge tone={r.isActive ? "emerald" : "neutral"}>{r.isActive ? "Active" : "Inactive"}</Badge>,
    },
    {
      id: "created",
      header: "Created",
      sortValue: (r) => r.createdAt ?? "",
      cell: (r) => <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>,
    },
  ];

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.workflows"]}>
      <PageHeader
        title="Approval"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/settings/workflows/new")}>
            <Plus size={14} strokeWidth={2} /> Add Approval
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={sorted}
        getRowId={(r) => r.id}
        searchPlaceholder="Search name..."
        getSearchText={(r) => `${r.name} ${r.documentType}`}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        onRowClick={(r) => navigate(`/app/settings/workflows/${r.id}`)}
        toolbarRight={
          selected.size > 0 ? (
            <Button variant="destructive" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleBulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete ({selected.size})
            </Button>
          ) : null
        }
        emptyIcon={<GitBranch size={26} strokeWidth={2} />}
        emptyTitle="No approvals"
        emptyDescription="Create an approval workflow for PO, SO, etc."
      />
    </RoleGuard>
  );
}
