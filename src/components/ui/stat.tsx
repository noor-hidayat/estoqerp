import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  icon,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-[0_10px_30px_-12px_rgb(17_17_17/0.08)] transition-shadow duration-300 hover:shadow-[0_14px_36px_-12px_rgb(17_17_17/0.12)]">
      {icon && (
        <div
          className={cx(
            "mb-4 inline-flex h-8 w-8 items-center justify-center rounded-md",
            accent
              ? "bg-emerald-50 text-emerald-700"
              : "bg-zinc-100 text-zinc-500"
          )}
        >
          {icon}
        </div>
      )}
      <p className="text-[12px] font-medium text-zinc-400">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-zinc-900">
        {value}
      </p>
      {sub && <div className="mt-1.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}
