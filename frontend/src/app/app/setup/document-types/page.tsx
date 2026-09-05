import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, Eye } from "lucide-react";
import { useDocumentSeries, useDocumentTypes } from "@/lib/api/query";
import type { DocumentSeries, DocumentType } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { ShellLoader } from "@/components/ui/loader";


export default function DocumentTypesPage() {
  const navigate = useNavigate();
  const { data: typesRaw = [], isLoading: loadingTypes } = useDocumentTypes();
  const { data: seriesRaw = [], isLoading: loadingSeries } = useDocumentSeries();
  const [filterType, setFilterType] = useState<string>("");

  const isLoading = loadingTypes || loadingSeries;

  const filteredSeries = useMemo(() => {
    if (!filterType) return seriesRaw;
    return seriesRaw.filter((s) => s.documentTypeId === filterType);
  }, [seriesRaw, filterType]);

  if (isLoading) return <ShellLoader />;

  // Document types are built-in (bawaan), only name is needed — code hidden, not creatable
  // Keep for filter only, not displayed as table

  const seriesColumns: DataTableColumn<DocumentSeries>[] = [
    {
      id: "name",
      header: "Name",
      sortValue: (s) => s.name,
      cell: (s) => <span className="text-xs font-medium">{s.name}</span>,
      className: "min-w-[180px]",
    },
    {
      id: "series",
      header: "Series",
      sortValue: (s) => s.format,
      cell: (s) => {
        const display = s.format.replace("{PREFIX}", s.prefix);
        return <span className="font-mono text-xs font-medium">{display}</span>;
      },
      className: "min-w-[260px]",
    },
    {
      id: "type",
      header: "Document Type",
      sortValue: (s) => s.typeName ?? "",
      cell: (s) => <span className="text-xs font-medium">{s.typeName ?? "—"}</span>,
    },
    {
      id: "status",
      header: "Status",
      sortValue: (s) => String(s.isActive),
      cell: (s) => <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Active" : "Inactive"}</Badge>,
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <PageHeader
        title="Document Numbering"
        actions={
          <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => navigate("/app/setup/document-types/new")}>
            <Plus size={14} /> Add Series
          </Button>
        }
      />

      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium">Filter by type:</label>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="h-7 rounded border px-2 text-xs"
          >
            <option value="">All types</option>
            {typesRaw.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {filterType && (
            <button onClick={() => setFilterType("")} className="text-xs underline ml-2">
              Clear
            </button>
          )}
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Eye size={16} /> Series (Prefix/Format) — {filteredSeries.length} {filterType ? "filtered" : "total"}
          </h3>
          <DataTable
            columns={seriesColumns}
            data={filteredSeries}
            getRowId={(s) => s.id}
            onRowClick={(s) => navigate(`/app/setup/document-types/${s.id}`)}
            searchPlaceholder="Search series..."
            getSearchText={(s) => `${s.name} ${s.prefix} ${s.format} ${s.typeName ?? ""}`}
            minWidth={600}
            emptyIcon={<FileText size={26} />}
            emptyTitle="No series yet"
            emptyDescription="Create series per document type."
          />
        </div>
      </div>
    </RoleGuard>
  );
}
