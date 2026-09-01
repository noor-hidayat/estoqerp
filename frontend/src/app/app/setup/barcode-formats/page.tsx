import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {Plus, Trash2, Pencil} from "lucide-react";
import { useBarcodeFormats, useRemove, useUpdate } from "@/lib/api/query";
import { formatDate, timeAgo } from "@/lib/utils";
import { sortSegments } from "@/lib/barcode/parser";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ShellLoader } from "@/components/ui/loader";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { fieldColor, fieldLabelShort } from "@/components/barcode/segment-visualizer";
import { cx } from "@/lib/utils";
import type { BarcodeFormat, BarcodeSegment } from "@/types";

function SegmentChips({ segments }: { segments: BarcodeSegment[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sortSegments(segments).map((seg) => {
        const c = fieldColor(seg.field);
        return (
          <span
            key={seg.id}
            className={cx(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              c.bg,
              c.text
            )}
            title={fieldLabelShort(seg.field)}
          >
            {seg.start}–{seg.end}
            <span className="opacity-60">·</span>
            {fieldLabelShort(seg.field)}
          </span>
        );
      })}
    </div>
  );
}

export default function BarcodeFormatsPage() {
  const navigate = useNavigate();
  const { data: formats = [], isLoading } = useBarcodeFormats();
  const update = useUpdate("barcodeFormats");
  const removeFormat = useRemove("barcodeFormats");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleBulkRemove = async () => {
    const n = selected.size;
    if (n === 0) return;
    if (!confirm(`Delete ${n} selected format${n > 1 ? "s" : ""}?`)) return;
    try {
      await Promise.all([...selected].map((id) => removeFormat.mutateAsync(id)));
      setSelected(new Set());
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const sorted = useMemo(
    () => [...formats].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [formats]
  );

  const toggleActive = (id: string, next: boolean) => {
    update.mutate({ id, patch: { isActive: next } });
  };

  if (isLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
        <PageHeader
          title="Barcode Formats"

        />
        <ShellLoader />
      </RoleGuard>
    );
  }

  const columns: DataTableColumn<BarcodeFormat>[] = [
    {
      id: "name",
      header: "Format",
      sortValue: (f) => f.name,
      cell: (f) => (
        <button
          onClick={() => navigate(`/app/setup/barcode-formats/${f.id}`)}
          className="truncate text-left font-medium text-foreground transition-colors hover:text-primary"
          title="Buka format"
        >
          {f.name}
        </button>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "segments",
      header: "Segment Definition",
      cell: (f) => <SegmentChips segments={f.segments} />,
      className: "min-w-[260px]",
    },
    {
      id: "qty",
      header: "Qty",
      cell: (f) => (
        <Badge tone={f.qtyPerFormat ? "violet" : "amber"}>
          {f.qtyPerFormat ? "Auto from item" : "Manual per scan"}
        </Badge>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (f) => (
        <div className="flex items-center gap-3">
          <Toggle checked={f.isActive} onChange={(next) => toggleActive(f.id, next)} />
          <Badge tone={f.isActive ? "emerald" : "neutral"} dot>
            {f.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
      ),
    },
    {
      id: "updated",
      header: "Updated",
      sortValue: (f) => f.updatedAt ?? "",
      cell: (f) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(f.updatedAt)}
        </span>
      ),
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
    },
    {
      id: "actions",
      header: "",
      cell: (f) => (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/app/setup/barcode-formats/${f.id}`);
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
    <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
      <PageHeader
        title="Format Barcode"
        actions={
          <Button
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => navigate("/app/setup/barcode-formats/new")}
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
        onRowClick={(f) => navigate(`/app/setup/barcode-formats/${f.id}`)}
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
        minWidth={900}
        emptyIcon={null}
        emptyTitle="No barcode formats yet"
        emptyDescription="Create your first format to define how barcodes are parsed into data segments."
      />
    </RoleGuard>
  );
}