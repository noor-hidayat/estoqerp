// Parser nomor batch — memecah string batch number menjadi komponen
// (tanggal produksi, shift, custom) sesuai definisi format batch.
// Logika disalin dari backend/src/lib/batch-parse.ts (sinkron manual).
import type {
  BatchDateFormat,
  BatchFormat,
  BatchParseResult,
  BatchSegment,
} from "@/types";

export const BATCH_DATE_FORMATS = ["YYMMDD", "DDMMYY", "YYYYMMDD", "YYYY-MM-DD"] as const;

export function sortSegments(segments: BatchSegment[]): BatchSegment[] {
  return [...segments].sort((a, b) => {
    const pa = a.mode === "POSITION" ? (a.start ?? 0) : 1e9;
    const pb = b.mode === "POSITION" ? (b.start ?? 0) : 1e9;
    return pa - pb;
  });
}

function extractSegment(raw: string, seg: BatchSegment): string | null {
  if (seg.mode === "POSITION") {
    const start = seg.start ?? 0;
    const end = seg.end ?? 0;
    if (start < 1 || end < start || end > raw.length) return null;
    return raw.slice(start - 1, end).trim();
  }
  const delimiter = seg.delimiter ?? "";
  const index = seg.index ?? 0;
  if (!delimiter) return null;
  const parts = raw.split(delimiter).filter((p) => p.length > 0);
  if (index < 0 || index >= parts.length) return null;
  return parts[index].trim();
}

function convertDate(raw: string, format?: BatchDateFormat): string | null {
  const fmt = format ?? "YYMMDD";
  const valid = (y: number, m: number, d: number) =>
    y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  if (fmt === "YYMMDD") {
    const m = /^(\d{2})(\d{2})(\d{2})$/.exec(raw);
    if (!m) return null;
    const y = 2000 + Number(m[1]);
    return valid(y, Number(m[2]), Number(m[3]))
      ? `${y}-${m[2]}-${m[3]}`
      : null;
  }
  if (fmt === "DDMMYY") {
    const m = /^(\d{2})(\d{2})(\d{2})$/.exec(raw);
    if (!m) return null;
    const y = 2000 + Number(m[3]);
    return valid(y, Number(m[2]), Number(m[1]))
      ? `${y}-${m[2]}-${m[1]}`
      : null;
  }
  if (fmt === "YYYYMMDD") {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (!m) return null;
    return valid(Number(m[1]), Number(m[2]), Number(m[3]))
      ? `${m[1]}-${m[2]}-${m[3]}`
      : null;
  }
  if (fmt === "YYYY-MM-DD") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    return valid(Number(m[1]), Number(m[2]), Number(m[3])) ? raw : null;
  }
  return null;
}

export function parseWithBatchFormat(
  raw: string,
  format: BatchFormat
): BatchParseResult | null {
  const segments = format.segments ?? [];
  if (segments.length === 0) return null;

  const values: Record<string, string> = {};
  const meta: Record<string, string> = {};
  for (const seg of segments) {
    const val = extractSegment(raw, seg);
    if (val === null) return null;
    if (seg.field === "CUSTOM") {
      if (seg.label) meta[seg.label] = val;
      else values.CUSTOM = val;
    } else {
      values[seg.field] = val;
    }
  }

  let productionDate: string | null = null;
  if (values.DATE) {
    const dateSeg = segments.find((s) => s.field === "DATE");
    productionDate = convertDate(values.DATE, dateSeg?.dateFormat);
    if (!productionDate) return null;
  }

  return {
    formatId: format.id,
    formatName: format.name,
    values,
    productionDate,
    shift: values.SHIFT ?? null,
    alternativeCode: values.ALTERNATIVE_CODE ?? null,
    meta,
    matched: true,
  };
}

export function parseBatchNumber(
  raw: string | null | undefined,
  formats: BatchFormat[]
): BatchParseResult | null {
  const number = (raw ?? "").trim();
  if (!number) return null;
  const active = (formats ?? []).filter(
    (f) => f.isActive && (f.segments ?? []).length > 0
  );
  const ordered = [...active].sort(
    (a, b) => (b.segments?.length ?? 0) - (a.segments?.length ?? 0)
  );
  for (const format of ordered) {
    const parsed = parseWithBatchFormat(number, format);
    if (parsed) return parsed;
  }
  return null;
}