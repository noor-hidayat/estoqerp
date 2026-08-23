"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  useInsert,
  useUpdate,
  useBatchFormats,
} from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import type { BarcodeFormat, BarcodeSegment, BatchFormat, SegmentField } from "@/types";
import {
  SEGMENT_FIELD_LABELS,
  sortSegments,
  validateSegments,
} from "@/lib/barcode/parser";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";
import { SegmentBar, fieldColor, fieldLabelShort } from "./segment-visualizer";
import { cx } from "@/lib/utils";
import { nextSegId } from "@/lib/segment-id";
import { useErrorToast } from "@/hooks/use-error-toast";

const FIELD_OPTIONS: SegmentField[] = [
  "ITEM_CODE",
  "ITEM_GROUP",
  "DATE",
  "SEQUENCE",
  "BARCODE_ID",
  "BATCH",
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
    issues.push("Start position cannot be greater than end position.");
    return issues;
  }
  if (seg.end > barcodeLength) {
    issues.push("End position exceeds barcode length.");
  }
  if (seg.field === "BATCH" && !seg.batchFormatId) {
    issues.push("Batch segment must select a batch format.");
  }
  const overlaps = segments.filter(
    (o) =>
      o.id !== seg.id && !(o.end < seg.start || o.start > seg.end)
  );
  if (overlaps.length > 0) {
      issues.push(
        `Position ${seg.start}–${seg.end} is already used by another segment.`
      );
  }
  return issues;
}

function SegmentRow({
  segment,
  segments,
  barcodeLength,
  batchFormats,
  batchFormatsLoading,
  batchFormatsError,
  onCreateBatchFormat,
  onChange,
  onRemove,
}: {
  segment: BarcodeSegment;
  segments: BarcodeSegment[];
  barcodeLength: number;
  batchFormats: BatchFormat[];
  batchFormatsLoading: boolean;
  batchFormatsError: boolean;
  onCreateBatchFormat: () => void;
  onChange: (next: BarcodeSegment) => void;
  onRemove: () => void;
}) {
  const c = fieldColor(segment.field);
  const issues = segmentIssues(segment, segments, barcodeLength);

  return (
    <div
      data-seg-id={segment.id}
        className={cx(
          "rounded-lg border bg-card p-2",
          issues.length > 0 ? "border-destructive" : "border-border"
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
          {fieldLabelShort(segment.field)}
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

        {segment.field === "BATCH" && (
          <div className="flex w-full flex-col gap-1 sm:w-auto sm:flex-1">
            <Select
              value={segment.batchFormatId ?? ""}
              onChange={(e) =>
                onChange({ ...segment, batchFormatId: e.target.value || undefined })
              }
              className="h-9 w-full text-[13px]"
              aria-label="batch format"
            >
              <option value="">
                {batchFormatsLoading
                  ? "Memuat batch format…"
                  : "Select batch format…"}
              </option>
              {batchFormats.map((bf) => (
                <option key={bf.id} value={bf.id}>
                  {bf.name}
                  {!bf.isActive ? " (inactive)" : ""}
                </option>
              ))}
            </Select>
            {batchFormatsError && (
              <p className="text-[10.5px] font-medium text-destructive">
                Gagal memuat batch format — cek koneksi/backend.
              </p>
            )}
            {!batchFormatsLoading && !batchFormatsError && batchFormats.length === 0 && (
              <p className="text-[10.5px] text-muted-foreground">
                Belum ada batch format. Buat dulu di{" "}
                <button
                  type="button"
                  onClick={onCreateBatchFormat}
                  className="font-medium text-primary hover:underline"
                >
                  Batch Formats
                </button>
                .
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground sm:ml-auto">
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
          title="Delete segment"
          aria-label="Delete segment"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={15} strokeWidth={2} />
        </button>
      </div>

      {issues.length > 0 && (
        <p className="mt-1.5 pl-12 text-[11.5px] font-medium text-destructive">
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
  const {
    data: batchFormats = [],
    isLoading: batchFormatsLoading,
    isError: batchFormatsError,
  } = useBatchFormats();
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
  useErrorToast(saveError);
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
      router.push("/app/data-library/barcode-formats");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  };

  useSaveShortcut(save, !saving);

  const canSave = dirty && !!name.trim() && validation.valid && !saving;

  return (
    <div>
      {/* INFORMASI FORMAT */}
      <FormSection title="Format information">
        <FormGrid>
          <Input
            label="Format name"
            placeholder="e.g.: Retail Product"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Barcode length (digits)"
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
        </FormGrid>
        <div className="mt-5">
          <Input
            label="Description"
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="mt-5 divide-y divide-border border-t border-border">
          <ToggleRow
            label="Qty from master item"
            checked={qtyPerFormat}
            onChange={setQtyPerFormat}
          />
          <ToggleRow
            label="Barcode must be unique"
            checked={uniqueBarcode}
            onChange={setUniqueBarcode}
          />
          <ToggleRow
            label="Format active"
            checked={isActive}
            onChange={setIsActive}
          />
        </div>
      </FormSection>

      {/* DEFINISI SEGMEN */}
      <FormSection
        title="Segment definition"
        actions={
          <Button variant="outline" size="sm" onClick={addSegment}>
            <Plus size={14} strokeWidth={2} />
            Add segment
          </Button>
        }
      >
        <div className="flex flex-col gap-2">
          {segments.length === 0 && (
            <p className="rounded-lg border border-dashed border-border bg-muted/50 px-4 py-5 text-center text-sm text-muted-foreground">
              No segments yet.
            </p>
          )}
          {segments.map((seg) => (
            <SegmentRow
              key={seg.id}
              segment={seg}
              segments={segments}
              barcodeLength={length}
              batchFormats={batchFormats}
              batchFormatsLoading={batchFormatsLoading}
              batchFormatsError={batchFormatsError}
              onCreateBatchFormat={() =>
                router.push("/app/data-library/batch-formats")
              }
              onChange={(next) => updateSegment(seg.id, next)}
              onRemove={() => removeSegment(seg.id)}
            />
          ))}
        </div>

        {segments.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Preview struktur barcode
            </p>
            <SegmentBar segments={segments} length={length} />
          </div>
        )}

        {!validation.valid && validation.errors.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5">
            <ul className="space-y-0.5 text-[12.5px] text-destructive">
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </FormSection>

      {/* ACTION FOOTER */}
      <FormActions>
        <Button
          variant="ghost"
          onClick={() => router.push("/app/data-library/barcode-formats")}
          disabled={saving}
        >
          Batal
        </Button>
        <Button
          variant="primary"
          disabled={!canSave}
          onClick={save}
        >
          {saving ? "Menyimpan..." : isNew ? "Simpan Format" : "Simpan Changes"}
        </Button>
      </FormActions>
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
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      <div className="shrink-0">
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}
