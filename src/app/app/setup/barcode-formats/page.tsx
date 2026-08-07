"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Barcode,
  PencilSimple,
  Plus,
} from "@phosphor-icons/react";
import { useData } from "@/hooks/use-db";
import { formatDate } from "@/lib/utils";
import { SEGMENT_FIELD_LABELS, sortSegments } from "@/lib/barcode/parser";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { EmptyState } from "@/components/ui/empty-state";
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
  const { db, update } = useData();

  const formats = useMemo(
    () => [...db.barcodeFormats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [db]
  );

  const toggleActive = (id: string, next: boolean) => {
    void update("barcodeFormats", id, { isActive: next });
  };

  return (
    <RoleGuard roles={["ADMIN"]}>
      <PageHeader
        eyebrow="Setup"
        title="Format Barcode"
        description="Konfigurasi format barcode berbasis segmen. Perubahan langsung berlaku tanpa perlu perubahan kode program."
        actions={
          <Link href="/app/setup/barcode-formats/new">
            <Button variant="secondary">
              <Plus size={15} weight="bold" />
              Buat Format
            </Button>
          </Link>
        }
      />

      {formats.length === 0 ? (
        <EmptyState
          icon={<Barcode size={26} weight="bold" />}
          title="Belum ada format barcode"
          description="Buat format pertama Anda untuk mendefinisikan bagaimana barcode di-parse menjadi segmen data."
          action={
            <Link href="/app/setup/barcode-formats/new">
              <Button variant="secondary">Buat Format Baru</Button>
            </Link>
          }
        />
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white">
          <Table
            columns={["Format", "Definisi Segmen", "Qty", "Status", "Diperbarui", ""]}
          >
            {formats.map((f) => {
              const len = f.segments.length
                ? Math.max(...f.segments.map((s) => s.end))
                : 0;
              return (
                <tr key={f.id} className="transition-colors hover:bg-zinc-50/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-emerald-400">
                        <Barcode size={17} weight="bold" />
                      </span>
                      <div>
                        <p className="text-[13.5px] font-semibold text-zinc-900">
                          {f.name}
                        </p>
                        {f.description && (
                          <p className="max-w-[340px] truncate text-[11.5px] text-zinc-400">
                            {f.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <SegmentChips segments={f.segments} />
                    <p className="mt-1 font-mono text-[10.5px] text-zinc-400">
                      {len} digit
                    </p>
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
                      <PencilSimple size={15} weight="bold" />
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
