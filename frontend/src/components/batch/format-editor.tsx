import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { useInsert, useUpdate } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import type {
  BatchDateFormat,
  BatchFormat,
  BatchSegment,
  BatchSegmentField,
  BatchSegmentMode,
} from "@/types";
import {
  BATCH_DATE_FORMATS,
  parseBatchNumber,
  parseWithBatchFormat,
  sortSegments,
} from "@/lib/batch/parser";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { cx } from "@/lib/utils";
import { nextSegId } from "@/lib/segment-id";
import { useErrorToast } from "@/hooks/use-error-toast";

const FIELD_OPTIONS: BatchSegmentField[] = [
  "DATE",
  "SHIFT",
  "SEQUENCE",
  "ALTERNATIVE_CODE",
  "CUSTOM",
];
const MODE_OPTIONS: BatchSegmentMode[] = ["POSITION", "DELIMITER"];

const FIELD_LABELS: Record<BatchSegmentField, string> = {
  DATE: "Tanggal Produksi",
  SHIFT: "Shift",
  SEQUENCE: "No. Urut",
  ALTERNATIVE_CODE: "Kode Alternatif",
  CUSTOM: "Kustom",
};

const MODE_LABELS: Record<BatchSegmentMode, string> = {
  POSITION: "Posisi tetap",
  DELIMITER: "Pemisah (delimiter)",
};

const FIELD_CHIP: Record<BatchSegmentField, string> = {
  DATE: "bg-sky-500/10 text-sky-600",
  SHIFT: "bg-amber-500/10 text-amber-600",
  SEQUENCE: "bg-violet-500/10 text-violet-600",
  ALTERNATIVE_CODE: "bg-emerald-500/10 text-emerald-600",
  CUSTOM: "bg-neutral-500/10 text-muted-foreground",
};

interface SegIssue {
  msg: string;
}

function segmentIssues(seg: BatchSegment, segments: BatchSegment[]): SegIssue[] {
  const issues: SegIssue[] = [];
  if (seg.mode === "POSITION") {
    const start = seg.start ?? 0;
    const end = seg.end ?? 0;
    if (start < 1 || end < start) {
      issues.push({ msg: "Posisi tidak valid (start ≥ 1 dan end ≥ start)." });
      return issues;
    }
    const overlaps = segments.filter(
      (o) =>
        o.id !== seg.id &&
        o.mode === "POSITION" &&
        !((o.end ?? 0) < start || (o.start ?? 0) > end)
    );
    if (overlaps.length > 0) {
      issues.push({ msg: `Posisi ${start}–${end} dipakai segmen lain.` });
    }
  } else {
    if (!seg.delimiter) {
      issues.push({ msg: "Delimiter wajib diisi." });
    }
    if ((seg.index ?? 0) < 0) {
      issues.push({ msg: "Index segmen minimal 0." });
    }
  }
  if (seg.field === "DATE" && !seg.dateFormat) {
    issues.push({ msg: "Pilih format tanggal." });
  }
  if (seg.field === "CUSTOM" && !seg.label) {
    issues.push({ msg: "Label custom wajib diisi." });
  }
  return issues;
}

function SegmentRow({
  segment,
  segments,
  onChange,
  onRemove,
}: {
  segment: BatchSegment;
  segments: BatchSegment[];
  onChange: (next: BatchSegment) => void;
  onRemove: () => void;
}) {
  const issues = segmentIssues(segment, segments);
  const chip = FIELD_CHIP[segment.field];

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
            "flex h-9 w-24 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
            chip
          )}
        >
          {FIELD_LABELS[segment.field]}
        </span>

        <Select
          value={segment.field}
          onChange={(e) =>
            onChange({ ...segment, field: e.target.value as BatchSegmentField })
          }
          className="h-9 w-full text-[13px] sm:w-auto sm:flex-1"
          aria-label="field"
        >
          {FIELD_OPTIONS.map((f) => (
            <option key={f} value={f}>
              {FIELD_LABELS[f]}
            </option>
          ))}
        </Select>

        <Select
          value={segment.mode}
          onChange={(e) =>
            onChange({ ...segment, mode: e.target.value as BatchSegmentMode })
          }
          className="h-9 w-full text-[13px] sm:w-40"
          aria-label="mode"
        >
          {MODE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {MODE_LABELS[m]}
            </option>
          ))}
        </Select>

        {segment.mode === "POSITION" ? (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="shrink-0">Posisi</span>
            <Input
              type="number"
              min={1}
              value={segment.start || ""}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                onChange({ ...segment, start: v === "" ? 0 : Math.max(1, parseInt(v, 10)) });
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
                onChange({ ...segment, end: v === "" ? 0 : Math.max(1, parseInt(v, 10)) });
              }}
              className="h-9 w-14 shrink-0 text-center font-mono text-[13px]"
              aria-label="posisi akhir"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Input
              value={segment.delimiter ?? ""}
              onChange={(e) => onChange({ ...segment, delimiter: e.target.value })}
              className="h-9 w-16 shrink-0 text-center font-mono text-[13px]"
              placeholder="-"
              aria-label="delimiter"
            />
            <span className="shrink-0">#</span>
            <Input
              type="number"
              min={0}
              value={segment.index ?? 0}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "");
                onChange({ ...segment, index: v === "" ? 0 : parseInt(v, 10) });
              }}
              className="h-9 w-12 shrink-0 text-center font-mono text-[13px]"
              aria-label="index segmen"
            />
          </div>
        )}

        {segment.field === "DATE" && (
          <Select
            value={segment.dateFormat ?? ""}
            onChange={(e) =>
              onChange({ ...segment, dateFormat: e.target.value as BatchDateFormat })
            }
            className="h-9 w-32 text-[13px]"
            aria-label="format tanggal"
          >
            <option value="">Format tanggal…</option>
            {BATCH_DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        )}

        {segment.field === "CUSTOM" && (
          <Input
            value={segment.label ?? ""}
            onChange={(e) => onChange({ ...segment, label: e.target.value })}
            className="h-9 w-full text-[13px] sm:w-40"
            placeholder="Label (mis. Mesin)"
            aria-label="label custom"
          />
        )}

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
        <p className="mt-1.5 pl-2 text-[11.5px] font-medium text-destructive">
          {issues[0].msg}
        </p>
      )}
    </div>
  );
}

export function BatchFormatEditor({ format }: { format: BatchFormat }) {
  const navigate = useNavigate();
  const router = { push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1) } as any;
  const insert = useInsert("batchFormats");
  const update = useUpdate("batchFormats");
  const isNew = !format.name;

  const [name, setName] = useState(format.name);
  const [description, setDescription] = useState(format.description ?? "");
  const [isActive, setIsActive] = useState(format.isActive);
  const [segments, setSegments] = useState<BatchSegment[]>(format.segments);
  const [testNumber, setTestNumber] = useState("");
  const [saveError, setSaveError] = useState("");
  useErrorToast(saveError);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const issues = useMemo(
    () => segments.flatMap((s) => segmentIssues(s, segments).map((i) => i.msg)),
    [segments]
  );
  const valid = segments.length > 0 && issues.length === 0;

  const testFormat: BatchFormat = {
    id: format.id || "preview",
    name,
    isActive,
    segments,
  };
  const testResult = useMemo(
    () => parseWithBatchFormat(testNumber.trim(), testFormat),
    [testNumber, testFormat]
  );
  const autoParse = useMemo(
    () => parseBatchNumber(testNumber.trim(), [testFormat]),
    [testNumber, testFormat]
  );

  const dirty = useMemo(() => {
    return (
      name !== format.name ||
      description !== (format.description ?? "") ||
      isActive !== format.isActive ||
      JSON.stringify(sortSegments(segments)) !==
        JSON.stringify(sortSegments(format.segments))
    );
  }, [name, description, isActive, segments, format]);

  const addSegment = () => {
    const positionSegs = sortSegments(segments).filter((s) => s.mode === "POSITION");
    let start = 1;
    for (const s of positionSegs) {
      if ((s.start ?? 0) > start) break;
      start = Math.max(start, (s.end ?? 0) + 1);
    }
    const next: BatchSegment = {
      id: nextSegId(segments),
      field: "CUSTOM",
      mode: "POSITION",
      start,
      end: start + 1,
    };
    setSegments([...segments, next]);
  };

  const updateSegment = (id: string, next: BatchSegment) => {
    setSegments(segments.map((s) => (s.id === id ? next : s)));
  };

  const removeSegment = (id: string) => {
    setSegments(segments.filter((s) => s.id !== id));
  };

  const save = async (): Promise<boolean> => {
    if (!name.trim() || !valid || saving) return false;
    setSaving(true);
    setSaveError("");
    const next: Omit<BatchFormat, "id"> = {
      name: name.trim(),
      description: description.trim() || undefined,
      isActive,
      segments: sortSegments(segments),
      updatedAt: new Date().toISOString(),
    };
    try {
      if (isNew) {
        await insert.mutateAsync(next);
      } else {
        await update.mutateAsync({ id: format.id, patch: next });
      }
      setSaved(true);
      setSaving(false);
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setSaving(false);
      return false;
    }
  };

  const handleSubmit = async () => {
    const ok = await save();
    if (ok) router.push("/app/setup/batch-formats");
  };

  useSaveShortcut(save, !saving);

  const canSave = dirty && !!name.trim() && valid && !saving;

  return (
    <div>
      <div className="flex justify-end gap-2 mb-4">
        <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={save} disabled={!canSave}>
          Save
        </Button>
        <Button variant="primary" size="sm" className="h-7 px-2.5 text-xs" onClick={handleSubmit} disabled={!name.trim() || !valid}>
          Submit
        </Button>
      </div>
      {/* INFORMASI FORMAT */}
      <FormSection title="Format information">
        <FormGrid>
          <Input
            label="Format name"
            placeholder="e.g.: Batch Supplier"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
          <div className="flex items-center justify-between gap-4 py-3">
            <span className="text-[13px] font-medium text-foreground">
              Format active
            </span>
            <div className="shrink-0">
              <Toggle checked={isActive} onChange={setIsActive} />
            </div>
          </div>
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
              onChange={(next) => updateSegment(seg.id, next)}
              onRemove={() => removeSegment(seg.id)}
            />
          ))}
        </div>

        {!valid && issues.length > 0 && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3.5">
            <ul className="space-y-0.5 text-[12.5px] text-destructive">
              {issues.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {segments.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Uji parse nomor batch
            </p>
            <Input
              placeholder="Contoh: 250726-A1"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              className="font-mono"
            />
            {testNumber.trim() && (
              <div className="mt-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 text-[12.5px]">
                {autoParse ? (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-foreground">
                    {autoParse.productionDate && (
                      <span>
                        <span className="text-muted-foreground">Tanggal: </span>
                        <span className="font-mono font-medium">
                          {autoParse.productionDate}
                        </span>
                      </span>
                    )}
                    {autoParse.shift && (
                      <span>
                        <span className="text-muted-foreground">Shift: </span>
                        <span className="font-mono font-medium">{autoParse.shift}</span>
                      </span>
                    )}
                    {Object.entries(autoParse.meta).map(([k, v]) => (
                      <span key={k}>
                        <span className="text-muted-foreground">{k}: </span>
                        <span className="font-mono font-medium">{v}</span>
                      </span>
                    ))}
                    {Object.entries(autoParse.values)
                      .filter(([k]) => !["DATE", "SHIFT"].includes(k) && k !== "CUSTOM")
                      .map(([k, v]) => (
                        <span key={k}>
                          <span className="text-muted-foreground">{k}: </span>
                          <span className="font-mono font-medium">{v}</span>
                        </span>
                      ))}
                  </div>
                ) : testResult ? (
                  <span className="text-muted-foreground">
                    Cocok dengan format ini.
                  </span>
                ) : (
                  <span className="text-destructive">
                    Tidak cocok dengan segmen format saat ini.
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </FormSection>


    </div>
  );
}