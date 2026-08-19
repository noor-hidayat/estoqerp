"use client";

import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Barcode,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import { useBarcodeFormats, useUpdate } from "@/lib/api/query";
import { formatDate } from "@/lib/utils";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const sorted = useMemo(
    () => [...formats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
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
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Barcode size={15} strokeWidth={2} />
          </span>
          <span className="truncate font-medium text-foreground">{f.name}</span>
        </div>
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
      sortValue: (f) => f.updatedAt,
      cell: (f) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDate(f.updatedAt)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (f) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${f.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => navigate(`/app/data-library/barcode-formats/${f.id}`)}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              Edit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
      <PageHeader
        title="Format Barcode"

        actions={
          <Button onClick={() => navigate("/app/data-library/barcode-formats/new")}>
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
        minWidth={900}
        emptyIcon={<Barcode size={26} strokeWidth={2} />}
        emptyTitle="No barcode formats yet"
        emptyDescription="Create your first format to define how barcodes are parsed into data segments."
      />
    </RoleGuard>
  );
}