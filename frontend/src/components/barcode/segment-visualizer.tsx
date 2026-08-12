import type { BarcodeSegment, SegmentField } from "@/types";
import { sortSegments } from "@/lib/barcode/parser";
import { cx } from "@/lib/utils";

export const FIELD_COLORS: Record<SegmentField, { bg: string; text: string; dot: string; border: string }> = {
  ITEM_CODE: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", border: "border-emerald-200" },
  CATEGORY: { bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-500", border: "border-violet-200" },
  DATE: { bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500", border: "border-sky-200" },
  SEQUENCE: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500", border: "border-amber-200" },
  BARCODE_ID: { bg: "bg-rose-100", text: "text-rose-700", dot: "bg-rose-500", border: "border-rose-200" },
  CUSTOM: { bg: "bg-zinc-100", text: "text-zinc-600", dot: "bg-zinc-400", border: "border-zinc-200" },
};

export const FIELD_LABEL_SHORT: Record<SegmentField, string> = {
  ITEM_CODE: "Item",
  CATEGORY: "Kat.",
  DATE: "Tgl",
  SEQUENCE: "Seq",
  BARCODE_ID: "Barcode",
  CUSTOM: "Kus.",
};

function coveringSegments(
  sorted: BarcodeSegment[],
  i: number
): BarcodeSegment[] {
  return sorted.filter((s) => i >= s.start && i <= s.end);
}

export function SegmentBar({
  segments,
  length,
  sample,
  className,
}: {
  segments: BarcodeSegment[];
  length: number;
  sample?: string;
  className?: string;
}) {
  const sorted = sortSegments(segments);

  const digitClass = (i: number) => {
    const covering = coveringSegments(sorted, i);
    if (covering.length > 1) {
      return "bg-red-50 text-red-500 ring-1 ring-inset ring-red-300";
    }
    const seg = covering[0];
    if (!seg) return "bg-zinc-50 text-zinc-300";
    const color = FIELD_COLORS[seg.field];
    return cx(color.bg, color.text);
  };

  const digitTitle = (i: number) => {
    const covering = coveringSegments(sorted, i);
    if (covering.length === 0) return "Tidak ada segmen";
    if (covering.length > 1) {
      return `Overlap: ${covering
        .map((s) => `${s.start}–${s.end} ${FIELD_LABEL_SHORT[s.field]}`)
        .join(", ")}`;
    }
    const seg = covering[0];
    return `${FIELD_LABEL_SHORT[seg.field]} ${seg.start}–${seg.end}`;
  };

  return (
    <div className="space-y-2">
      <div
        className={cx(
          "overflow-x-auto rounded-lg border border-zinc-200 bg-white p-2",
          className
        )}
      >
        <div
          className="grid min-w-max gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${Math.max(length, 1)}, 30px)` }}
        >
          {Array.from({ length }).map((_, idx) => {
            const i = idx + 1;
            const covering = coveringSegments(sorted, i);
            const seg = covering[0];
            return (
              <div
                key={idx}
                title={digitTitle(i)}
                className={cx(
                  "flex h-11 cursor-default flex-col items-center justify-center rounded-md font-mono text-[13px] font-semibold transition-colors",
                  digitClass(i)
                )}
              >
                <span>{sample ? sample[idx] ?? "" : i}</span>
                {sample && seg && (
                  <span
                    className={cx(
                      "mt-0.5 text-[8px] font-semibold uppercase tracking-wide",
                      covering.length > 1
                        ? "text-red-500"
                        : FIELD_COLORS[seg.field].text
                    )}
                  >
                    {seg.start === i ? FIELD_LABEL_SHORT[seg.field] : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {!sample && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {sorted.map((seg) => {
            const c = FIELD_COLORS[seg.field];
            const overlapping = sorted.some(
              (o) =>
                o.id !== seg.id && !(o.end < seg.start || o.start > seg.end)
            );
            return (
              <span
                key={seg.id}
                className={cx(
                  "inline-flex items-center gap-1.5 text-[11px] font-medium",
                  overlapping ? "text-red-600" : c.text
                )}
              >
                <span className={cx("h-1.5 w-1.5 rounded-full", overlapping ? "bg-red-500" : c.dot)} />
                {seg.start}–{seg.end} · {FIELD_LABEL_SHORT[seg.field]}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
