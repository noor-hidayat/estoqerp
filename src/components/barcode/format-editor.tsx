"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Trash,
  CaretUpDown,
  CheckCircle,
  XCircle,
} from "@phosphor-icons/react";
import { useData } from "@/hooks/use-db";
import type { BarcodeFormat, BarcodeSegment, SegmentField } from "@/types";
import {
  parseWithFormat,
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
import { newUid } from "@/lib/mock/store";

const FIELD_OPTIONS: SegmentField[] = [
  "ITEM_CODE",
  "CATEGORY",
  "DATE",
  "SEQUENCE",
  "CUSTOM",
];

function SegmentRow({
  segment,
  onChange,
  onRemove,
}: {
  segment: BarcodeSegment;
  onChange: (next: BarcodeSegment) => void;
  onRemove: () => void;
}) {
  const c = FIELD_COLORS[segment.field];
  return (
    <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2">
      <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold", c.bg, c.text)}>
        {FIELD_LABEL_SHORT[segment.field]}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <Select
          value={segment.field}
          onChange={(e) => onChange({ ...segment, field: e.target.value as SegmentField })}
          className="h-9 w-[170px] text-[13px]"
        >
          {FIELD_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {SEGMENT_FIELD_LABELS[f]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={1}
            value={segment.start}
            onChange={(e) =>
              onChange({ ...segment, start: Number(e.target.value) || 1 })
            }
            className="h-9 w-20 text-center font-mono text-[13px]"
            aria-label="posisi mulai"
          />
          <span className="text-[11px] text-zinc-400">s/d</span>
          <Input
            type="number"
            min={1}
            value={segment.end}
            onChange={(e) =>
              onChange({ ...segment, end: Number(e.target.value) || 1 })
            }
            className="h-9 w-20 text-center font-mono text-[13px]"
            aria-label="posisi akhir"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Trash size={15} weight="bold" />
      </button>
    </div>
  );
}

export function FormatEditor({ format }: { format: BarcodeFormat }) {
  const router = useRouter();
  const { db, insert, update } = useData();
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
  const [segments, setSegments] = useState<BarcodeSegment[]>(
    sortSegments(format.segments)
  );
  const [sample, setSample] = useState("");

  const validation = useMemo(
    () => validateSegments(length, segments),
    [length, segments]
  );

  const parsed = useMemo(() => {
    if (sample.length !== length || !validation.valid) return null;
    const candidate: BarcodeFormat = {
      ...format,
      name,
      qtyPerFormat,
      isActive,
      segments,
    };
    return parseWithFormat(sample, candidate, {
      items: db.items,
      categories: db.categories,
    });
  }, [sample, length, validation.valid, segments, format, name, qtyPerFormat, isActive, db]);

  const addSegment = () => {
    const last = segments[segments.length - 1];
    const start = last ? Math.max(last.end + 1, 1) : 1;
    const end = Math.min(start, length);
    setSegments([
      ...segments,
      { id: newUid("seg"), field: "CUSTOM", start, end },
    ]);
  };

  const updateSegment = (id: string, next: BarcodeSegment) => {
    setSegments(segments.map((s) => (s.id === id ? next : s)));
  };

  const removeSegment = (id: string) => {
    setSegments(segments.filter((s) => s.id !== id));
  };

  const save = async () => {
    if (!name.trim() || !validation.valid) return;
    const id = format.id || newUid("fmt");
    const next: BarcodeFormat = {
      ...format,
      id,
      name: name.trim(),
      description: description.trim() || undefined,
      isActive,
      qtyPerFormat,
      segments: sortSegments(segments),
      updatedAt: new Date().toISOString(),
    };
    const err = format.id
      ? await update("barcodeFormats", id, next)
      : await insert("barcodeFormats", next);
    if (err) return;
    router.push("/app/setup/barcode-formats");
  };

  const fieldBadgeClass = (seg: BarcodeSegment) => {
    const c = FIELD_COLORS[seg.field];
    return cx(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium",
      c.bg,
      c.text
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-6">
          <h3 className="mb-4 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            Informasi format
          </h3>
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
              value={length}
              onChange={(e) => setLength(Number(e.target.value) || 1)}
              hint="Total digit barcode aktif"
            />
          </div>
          <div className="mt-4">
            <Input
              label="Deskripsi (opsional)"
              placeholder="Penjelasan singkat segmen barcode"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="mt-5 space-y-4 border-t border-zinc-100 pt-5">
            <Toggle
              checked={qtyPerFormat}
              onChange={setQtyPerFormat}
              label="Qty dari master item"
              hint="Aktif: qty otomatis per barcode. Nonaktif: qty diinput manual tiap scan."
            />
            <Toggle
              checked={isActive}
              onChange={setIsActive}
              label="Format aktif"
              hint="Format aktif digunakan saat parsing scan."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200/70 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
              Definisi segmen
            </h3>
            <Button variant="outline" size="sm" onClick={addSegment}>
              <Plus size={14} weight="bold" />
              Tambah segmen
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            {segments.length === 0 && (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-6 text-center text-sm text-zinc-400">
                Belum ada segmen. Tambahkan segmen untuk mendefinisikan posisi
                data dalam barcode.
              </p>
            )}
            {segments.map((seg) => (
              <SegmentRow
                key={seg.id}
                segment={seg}
                onChange={(next) => updateSegment(seg.id, next)}
                onRemove={() => removeSegment(seg.id)}
              />
            ))}
          </div>

          {segments.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[12px] font-medium text-zinc-500">
                Visualisasi posisi segmen
              </p>
              <SegmentBar segments={segments} length={length} />
            </div>
          )}

          {!validation.valid && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 p-4">
              <XCircle size={18} weight="bold" className="mt-0.5 shrink-0 text-red-500" />
              <div>
                <p className="text-[13px] font-semibold text-red-700">
                  Konfigurasi belum valid
                </p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[12.5px] text-red-600">
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-zinc-200/70 bg-white p-6">
          <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
            Preview & uji parsing
          </h3>
          <p className="mb-4 text-[12px] text-zinc-400">
            Masukkan contoh barcode dengan panjang {length} digit untuk melihat
            hasil parsing.
          </p>
          <Input
            placeholder={`${"0".repeat(Math.min(length, 13))}${length > 13 ? "…" : ""}`}
            value={sample}
            onChange={(e) => setSample(e.target.value.replace(/\D/g, ""))}
            icon={<CaretUpDown size={15} weight="bold" />}
            maxLength={length}
          />
          <div className="mt-4">
            <SegmentBar segments={segments} length={length} sample={sample || undefined} />
          </div>

          {sample.length === length && validation.valid && (
            <div className="mt-5">
              {parsed ? (
                <div className="rounded-xl bg-zinc-950 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle size={16} weight="bold" className="text-emerald-400" />
                    <span className="text-[13px] font-semibold text-zinc-100">
                      Cocok dengan format “{name || "Format baru"}”
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {segments.map((seg) => {
                      const c = FIELD_COLORS[seg.field];
                      return (
                        <span
                          key={seg.id}
                          className={fieldBadgeClass(seg)}
                          title={SEGMENT_FIELD_LABELS[seg.field]}
                        >
                          <span
                            className={cx("h-1.5 w-1.5 rounded-full", c.dot)}
                          />
                          {SEGMENT_FIELD_LABELS[seg.field]} ({seg.start}–{seg.end})
                          <span className="font-mono">
                            {parsed.values[seg.field] || "—"}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                  {parsed.item ? (
                    <div className="mt-3 flex items-center gap-3 rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-400/20">
                      <span className="text-[13px] text-emerald-300">Item terdeteksi:</span>
                      <span className="text-[13px] font-semibold text-emerald-100">
                        {parsed.item.name}
                      </span>
                    </div>
                  ) : (
                    <p className="mt-3 text-[12px] text-amber-300/90">
                      {parsed.categoryCode
                        ? "Kategori dikenali, item tidak dapat di-resolve unik."
                        : "Item tidak ditemukan dari segmen kode item/kategori."}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-zinc-400">Parsing tidak valid.</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <Button
            variant="ghost"
            onClick={() => router.push("/app/setup/barcode-formats")}
          >
            Batal
          </Button>
          <Button
            variant="secondary"
            disabled={!name.trim() || !validation.valid}
            onClick={save}
          >
            {isNew ? "Simpan Format" : "Simpan Perubahan"}
          </Button>
        </div>
      </div>
    </div>
  );
}
