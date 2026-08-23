"use client";

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PackagePlus, Plus } from "lucide-react";
import { useBatchFormats, useUpdate } from "@/lib/api/query";
import { formatDate, timeAgo } from "@/lib/utils";
import { sortSegments } from "@/lib/batch/parser";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ShellLoader } from "@/components/ui/loader";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { cx } from "@/lib/utils";
import type { BatchFormat, BatchSegment } from "@/types";

const FIELD_CHIP: Record<string, { bg: string; text: string; label: string }> = {
  DATE: { bg: "bg-sky-500/10", text: "text-sky-600", label: "Tanggal" },
  SHIFT: { bg: "bg-amber-500/10", text: "text-amber-600", label: "Shift" },
  SEQUENCE: { bg: "bg-violet-500/10", text: "text-violet-600", label: "No. Urut" },
  ALTERNATIVE_CODE: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600",
    label: "Kode Alternatif",
  },
  CUSTOM: { bg: "bg-neutral-500/10", text: "text-muted-foreground", label: "Kustom" },
};

function chipOf(field: string) {
  return FIELD_CHIP[field] ?? FIELD_CHIP.CUSTOM;
}

function SegmentChips({ segments }: { segments: BatchSegment[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sortSegments(segments).map((seg) => {
        const c = chipOf(seg.field);
        const pos =
          seg.mode === "POSITION"
            ? `${seg.start}–${seg.end}`
            : `${seg.delimiter}#${seg.index}`;
        return (
          <span
            key={seg.id}
            className={cx(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              c.bg,
              c.text
            )}
            title={seg.field === "CUSTOM" ? seg.label : c.label}
          >
            {pos}
            <span className="opacity-60">·</span>
            {seg.field === "CUSTOM" && seg.label ? seg.label : c.label}
          </span>
        );
      })}
    </div>
  );
}

export default function BatchFormatsPage() {
  const navigate = useNavigate();
  const { data: formats = [], isLoading } = useBatchFormats();
  const update = useUpdate("batchFormats");

  const sorted = useMemo(
    () => [...formats].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [formats]
  );

  const toggleActive = (id: string, next: boolean) => {
    update.mutate({ id, patch: { isActive: next } });
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
      header: "Format",
      sortValue: (f) => f.name,
      cell: (f) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <PackagePlus size={15} strokeWidth={2} />
          </span>
          <button
            onClick={() => navigate(`/app/data-library/batch-formats/${f.id}`)}
            className="truncate text-left font-medium text-foreground transition-colors hover:text-primary"
            title="Buka format"
          >
            {f.name}
          </button>
        </div>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "segments",
      header: "Segment Definition",
      cell: (f) => <SegmentChips segments={f.segments} />,
      className: "min-w-[280px]",
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
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.batchFormats"]}>
      <PageHeader
        title="Format Batch"
        actions={
          <Button onClick={() => navigate("/app/data-library/batch-formats/new")}>
            <Plus size={15} strokeWidth={2} />
            Create Format
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={sorted}
        getRowId={(f) => f.id}
        searchPlaceholder="Search formats..."
        getSearchText={(f) => f.name}
        minWidth={820}
        emptyIcon={<PackagePlus size={26} strokeWidth={2} />}
        emptyTitle="No batch formats yet"
        emptyDescription="Create your first format to define how batch numbers are parsed into date, shift, and custom fields."
      />
    </RoleGuard>
  );
}