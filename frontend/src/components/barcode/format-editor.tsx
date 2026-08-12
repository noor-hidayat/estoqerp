"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  useInsert,
  useUpdate,
} from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import type { BarcodeFormat, BarcodeSegment, SegmentField } from "@/types";
import {
  SEGMENT_FIELD_LABELS,
  sortSegments,
  validateSegments,
} from "@/lib/barcode/parser";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { SegmentBar, FIELD_COLORS, FIELD_LABEL_SHORT } from "./segment-visualizer";
import { cx } from "@/lib/utils";
import { nextSegId } from "@/lib/mock/store";

const FIELD_OPTIONS: SegmentField[] = [
  "ITEM_CODE",
  "CATEGORY",
  "DATE",
  "SEQUENCE",
  "BARCODE_ID",
  "CUSTOM",
];

/** Validasi spesifik per segmen — pesan error ditampilkan di bawah baris. */
function segmentIssues(
  seg: BarcodeSegment,
  segments: BarcodeSegment[],
  barcodeLength: number
): string[] {
  const issues: string[] = [];
  if (seg.start > seg.end) {
    issues.push("Posisi mulai tidak boleh lebih besar dari posisi akhir.");
    return issues;
  }
  if (seg.end > barcodeLength) {
    issues.push("Posisi akhir melebihi panjang barcode.");
  }
  const overlaps = segments.filter(
    (o) =>
      o.id !== seg.id && !(o.end < seg.start || o.start > seg.end)
  );
  if (overlaps.length > 0) {
    issues.push(
      `Posisi ${seg.start}–${seg.end} sudah digunakan oleh segmen lain.`
    );
  }
  return issues;
}

function SegmentRow({
  segment,
  segments,
  barcodeLength,
  onChange,
  onRemove,
}: {
  segment: BarcodeSegment;
  segments: BarcodeSegment[];
  barcodeLength: number;
  onChange: (next: BarcodeSegment) => void;
  onRemove: () => void;
}) {
  const c = FIELD_COLORS[segment.field];
  const issues = segmentIssues(segment, segments, barcodeLength);

  return (
    <div
      data-seg-id={segment.id}
      className={cx(
        "rounded-lg border bg-white p-2",
        issues.length > 0 ? "border-red-300" : "border-zinc-200"
      )}
    >
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        <span
          className={cx(
            "flex h-9 w-10 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
            c.bg,
            c.text
          )}
        >
          {FIELD_LABEL_SHORT[segment.field]}
        </span>
        <Select
          value={segment.field}
          onChange={(e) => onChange({ ...segment, field: e.target.value as SegmentField })}
          className="h-9 w-full text-[13px] sm:w-auto sm:flex-1"
        >
          {FIELD_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {SEGMENT_FIELD_LABELS[f]}
            </option>
          ))}
        </Select>

        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 sm:ml-auto">
          <span className="shrink-0">Posisi</span>
          <Input
            type="number"
            min={1}
            value={segment.start || ""}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (v === "") {
                onChange({ ...segment, start: 0 });
              } else {
                const n = parseInt(v, 10);
                if (!isNaN(n)) onChange({ ...segment, start: Math.max(1, n) });
              }
            }}
            className="h-9 w-14 shrink-0 text-center font-mono text-[13px]"
            aria-label="posisi mulai"
          />
          <span className="shrink-0">s/d</span>
          <Input
            type="number"
            min={1}
            value={segment.end || ""}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (v === "") {
                onChange({ ...segment, end: 0 });
              } else {
                const n = parseInt(v, 10);
                if (!isNaN(n)) onChange({ ...segment, end: Math.max(1, n) });
              }
            }}
            className="h-9 w-14 shrink-0 text-center font-mono text-[13px]"
            aria-label="posisi akhir"
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          title="Hapus segmen"
          aria-label="Hapus segmen"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      </div>

      {issues.length > 0 && (
        <p className="mt-1.5 pl-12 text-[11.5px] font-medium text-red-600">
          {issues[0]}
        </p>
      )}
    </div>
  );
}

export function FormatEditor({ format }: { format: BarcodeFormat }) {
  const router = useRouter();
  const insert = useInsert("barcodeFormats");
  const update = useUpdate("barcodeFormats");
  const isNew = !format.name;

  const [name, setName] = useState(format.name);
  const [description, setDescription] = useState(format.description ?? "");
  const [length, setLength] = useState(
    format.segments.length
      ? Math.max(...format.segments.map((s) => s.end))
      : 13
  );
  const [qtyPerFormat, setQtyPerFormat] = useState(format.qtyPerFormat);
  const [isActive, setIsActive] = useState(format.isActive);
  const [uniqueBarcode, setUniqueBarcode] = useState(format.uniqueBarcode ?? false);
  const [segments, setSegments] = useState<BarcodeSegment[]>(
    sortSegments(format.segments)
  );
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [focusSegmentId, setFocusSegmentId] = useState<string | null>(null);

  const initialLength = useRef(
    format.segments.length
      ? Math.max(...format.segments.map((s) => s.end))
      : 13
  );

  const validation = useMemo(
    () => validateSegments(length, segments),
    [length, segments]
  );

  const dirty = useMemo(() => {
    return (
      name !== format.name ||
      description !== (format.description ?? "") ||
      length !== initialLength.current ||
      qtyPerFormat !== format.qtyPerFormat ||
      isActive !== format.isActive ||
      uniqueBarcode !== (format.uniqueBarcode ?? false) ||
      JSON.stringify(sortSegments(segments)) !==
        JSON.stringify(sortSegments(format.segments))
    );
  }, [name, description, length, qtyPerFormat, isActive, uniqueBarcode, segments, format]);

  // Fokus + scroll ke baris segmen yang baru ditambahkan.
  useEffect(() => {
    if (!focusSegmentId) return;
    const row = document.querySelector<HTMLElement>(
      `[data-seg-id="${focusSegmentId}"]`
    );
    const input = row?.querySelector<HTMLInputElement>("input");
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    input?.focus();
    setFocusSegmentId(null);
  }, [focusSegmentId]);

  const addSegment = () => {
    const sorted = sortSegments(segments);
    let start = 1;
    for (const s of sorted) {
      if (s.start > start) break;
      start = Math.max(start, s.end + 1);
    }
    if (start > length) start = Math.min(length, 1);
    const end = Math.min(Math.max(start, 1), length);
    const next = [
      ...segments,
      { id: nextSegId(segments), field: "CUSTOM" as SegmentField, start, end },
    ];
    setSegments(next);
    setFocusSegmentId(next[next.length - 1].id);
  };

  const updateSegment = (id: string, next: BarcodeSegment) => {
    setSegments(segments.map((s) => (s.id === id ? next : s)));
  };

  const removeSegment = (id: string) => {
    setSegments(segments.filter((s) => s.id !== id));
  };

  const save = async () => {
    if (!name.trim() || !validation.valid || saving) return;
    setSaving(true);
    setSaveError("");
    const next: Omit<BarcodeFormat, "id"> = {
      name: name.trim(),
      description: description.trim() || undefined,
      isActive,
      qtyPerFormat,
      uniqueBarcode,
      segments: sortSegments(segments),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (isNew) {
        await insert.mutateAsync(next);
      } else {
        await update.mutateAsync({ id: format.id, patch: next });
      }
      router.push("/app/setup/barcode-formats");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  useSaveShortcut(save, !saving);

  const canSave = dirty && !!name.trim() && validation.valid && !saving;

  return (
    <div className="space-y-6">
      {/* INFORMASI FORMAT */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="mb-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            Informasi format
          </h2>
          <p className="mt-0.5 text-[12px] text-zinc-400">
            Informasi dasar mengenai format barcode.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Nama format"
            placeholder="Contoh: Retail Produk"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Panjang barcode (digit)"
            type="number"
            min={1}
            max={40}
            value={length || ""}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "");
              if (v === "") {
                setLength(1);
              } else {
                const n = parseInt(v, 10);
                if (!isNaN(n)) setLength(Math.min(40, Math.max(1, n)));
              }
            }}
          />
        </div>
        <div className="mt-4">
          <Input
            label="Deskripsi"
            placeholder="Opsional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="mt-5 divide-y divide-zinc-100 border-t border-zinc-100">
          <ToggleRow
            label="Qty dari master item"
            checked={qtyPerFormat}
            onChange={setQtyPerFormat}
          />
          <ToggleRow
            label="Barcode harus unik"
            checked={uniqueBarcode}
            onChange={setUniqueBarcode}
          />
          <ToggleRow
            label="Format aktif"
            checked={isActive}
            onChange={setIsActive}
          />
        </div>
      </section>

      {/* DEFINISI SEGMEN */}
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Definisi segmen
            </h2>
            <p className="mt-0.5 text-[12px] text-zinc-400">
              Tentukan bagian barcode yang digunakan untuk setiap atribut.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addSegment}>
            <Plus size={14} strokeWidth={2} />
            Tambah segmen
          </Button>
        </div>

        <div className="flex flex-col gap-2">
          {segments.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-5 text-center text-sm text-zinc-400">
              Belum ada segmen.
            </p>
          )}
          {segments.map((seg) => (
            <SegmentRow
              key={seg.id}
              segment={seg}
              segments={segments}
              barcodeLength={length}
              onChange={(next) => updateSegment(seg.id, next)}
              onRemove={() => removeSegment(seg.id)}
            />
          ))}
        </div>

        {segments.length > 0 && (
          <div className="mt-5 border-t border-zinc-100 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Preview struktur barcode
            </p>
            <SegmentBar segments={segments} length={length} />
          </div>
        )}

        {!validation.valid && validation.errors.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50/70 p-3.5">
            <ul className="space-y-0.5 text-[12.5px] text-red-600">
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {saveError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-600">
          Gagal menyimpan: {saveError}
        </p>
      )}

      {/* ACTION FOOTER */}
      <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-5">
        <Button
          variant="ghost"
          onClick={() => router.push("/app/setup/barcode-formats")}
          disabled={saving}
        >
          Batal
        </Button>
        <Button
          variant="primary"
          disabled={!canSave}
          onClick={save}
        >
          {saving ? "Menyimpan..." : isNew ? "Simpan Format" : "Simpan Perubahan"}
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-[13px] font-medium text-zinc-700">{label}</span>
      <div className="shrink-0">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}
