import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  icon,
  accent = false,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-zinc-200/80 bg-white shadow-[0_10px_30px_-12px_rgb(17_17_17/0.08)] transition-shadow duration-300 hover:shadow-[0_14px_36px_-12px_rgb(17_17_17/0.12)]",
        compact ? "p-3.5" : "p-5"
      )}
    >
      {icon && (
        <div
          className={cx(
            "inline-flex items-center justify-center rounded-md",
            compact ? "mb-2.5 h-7 w-7" : "mb-4 h-8 w-8",
            accent
              ? "bg-emerald-50 text-emerald-700"
              : "bg-zinc-100 text-zinc-500"
          )}
        >
          {icon}
        </div>
      )}
      <p
        className={cx(
          "font-medium text-zinc-400",
          compact ? "text-[11px]" : "text-[12px]"
        )}
      >
        {label}
      </p>
      <p
        className={cx(
          "font-mono tracking-tight text-zinc-900",
          compact ? "mt-0.5 text-[20px] font-bold" : "mt-1 text-2xl font-semibold"
        )}
      >
        {value}
      </p>
      {sub && (
        <div
          className={cx("text-xs text-zinc-500", compact ? "mt-1" : "mt-1.5")}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
