"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Barcode,
  Pencil,
  Plus,
} from "lucide-react";
import { useBarcodeFormats, useUpdate } from "@/lib/api/query";
import { formatDate } from "@/lib/utils";
import { SEGMENT_FIELD_LABELS, sortSegments } from "@/lib/barcode/parser";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { EmptyState } from "@/components/ui/empty-state";
import { ShellLoader } from "@/components/ui/loader";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { FIELD_COLORS, FIELD_LABEL_SHORT } from "@/components/barcode/segment-visualizer";
import { cx } from "@/lib/utils";
import type { BarcodeSegment } from "@/types";

function SegmentChips({ segments }: { segments: BarcodeSegment[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {sortSegments(segments).map((seg) => {
        const c = FIELD_COLORS[seg.field];
        return (
          <span
            key={seg.id}
            className={cx(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              c.bg,
              c.text
            )}
            title={SEGMENT_FIELD_LABELS[seg.field]}
          >
            {seg.start}–{seg.end}
            <span className="opacity-60">·</span>
            {FIELD_LABEL_SHORT[seg.field]}
          </span>
        );
      })}
    </div>
  );
}

export default function BarcodeFormatsPage() {
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
          eyebrow="Master"
          title="Format Barcode"
          description="Konfigurasi format barcode berbasis segmen. Perubahan langsung berlaku tanpa perlu perubahan kode program."
        />
        <ShellLoader />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.barcodeFormats"]}>
      <PageHeader
        eyebrow="Master"
        title="Format Barcode"
        description="Konfigurasi format barcode berbasis segmen. Perubahan langsung berlaku tanpa perlu perubahan kode program."
        actions={
          <Link href="/app/setup/barcode-formats/new">
            <Button variant="secondary">
              <Plus size={15} strokeWidth={2} />
              Buat Format
            </Button>
          </Link>
        }
      />

      {sorted.length === 0 ? (
        <EmptyState
          icon={<Barcode size={26} strokeWidth={2} />}
          title="Belum ada format barcode"
          description="Buat format pertama Anda untuk mendefinisikan bagaimana barcode di-parse menjadi segmen data."
          action={
            <Link href="/app/setup/barcode-formats/new">
              <Button variant="secondary">Buat Format Baru</Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table
            storageKey="barcode-formats"
            columns={["Format", "Definisi Segmen", "Qty", "Status", "Diperbarui", ""]}
          >
            {sorted.map((f) => {
              return (
                <tr key={f.id} className="transition-colors hover:bg-zinc-50/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                        <Barcode size={17} strokeWidth={2} />
                      </span>
                      <div>
                        <p className="truncate text-[13.5px] font-semibold text-zinc-900">
                          {f.name}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <SegmentChips segments={f.segments} />
                  </Td>
                  <Td>
                    <Badge tone={f.qtyPerFormat ? "violet" : "amber"}>
                      {f.qtyPerFormat ? "Otomatis dari item" : "Manual per scan"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Toggle
                        checked={f.isActive}
                        onChange={(next) => toggleActive(f.id, next)}
                      />
                      <Badge tone={f.isActive ? "emerald" : "neutral"} dot>
                        {f.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px] text-zinc-500">
                    {formatDate(f.updatedAt)}
                  </Td>
                  <Td>
                    <Link
                      href={`/app/setup/barcode-formats/${f.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <Pencil size={15} strokeWidth={2} />
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </RoleGuard>
  );
}
