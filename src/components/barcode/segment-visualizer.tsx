import type { BarcodeSegment, SegmentField } from "@/types";
import { sortSegments } from "@/lib/barcode/parser";
import { cx } from "@/lib/utils";

export const FIELD_COLORS: Record<SegmentField, { bg: string; text: string; dot: string }> = {
  ITEM_CODE: { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  CATEGORY: { bg: "bg-violet-100", text: "text-violet-700", dot: "bg-violet-500" },
  DATE: { bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" },
  SEQUENCE: { bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  CUSTOM: { bg: "bg-zinc-100", text: "text-zinc-600", dot: "bg-zinc-400" },
};

export const FIELD_LABEL_SHORT: Record<SegmentField, string> = {
  ITEM_CODE: "Item",
  CATEGORY: "Kat.",
  DATE: "Tgl",
  SEQUENCE: "Seq",
  CUSTOM: "Kus.",
};

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
    const seg = sorted.find((s) => i >= s.start && i <= s.end);
    if (!seg) return "bg-zinc-50 text-zinc-300";
    const color = FIELD_COLORS[seg.field];
    return cx(color.bg, color.text);
  };

  const segForDigit = (i: number) =>
    sorted.find((s) => i >= s.start && i <= s.end);

  return (
    <div className="space-y-2">
      <div
        className={cx(
          "grid gap-[3px] overflow-hidden rounded-xl border border-zinc-200 bg-white p-3",
          className
        )}
        style={{ gridTemplateColumns: `repeat(${Math.max(length, 1)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length }).map((_, idx) => {
          const i = idx + 1;
          const seg = segForDigit(i);
          return (
            <div
              key={idx}
              className={cx(
                "flex h-12 flex-col items-center justify-center rounded-md font-mono text-[13px] font-semibold transition-colors",
                digitClass(i)
              )}
            >
              <span>{sample ? sample[idx] ?? "" : i}</span>
              {sample && seg && (
                <span
                  className={cx(
                    "mt-0.5 text-[8px] font-semibold uppercase tracking-wide",
                    FIELD_COLORS[seg.field].text
                  )}
                >
                  {seg.start === i ? FIELD_LABEL_SHORT[seg.field] : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {!sample && (
        <div className="flex flex-wrap gap-2">
          {sorted.map((seg) => {
            const c = FIELD_COLORS[seg.field];
            return (
              <span
                key={seg.id}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium",
                  c.bg,
                  c.text
                )}
              >
                <span className={cx("h-1.5 w-1.5 rounded-full", c.dot)} />
                {seg.start}–{seg.end} · {FIELD_LABEL_SHORT[seg.field]}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
