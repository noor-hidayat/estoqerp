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
    <div className="relative rounded-2xl border border-zinc-200/70 bg-white p-5 shadow-[0_20px_40px_-15px_rgb(24_24_27/0.05)]">
      {icon && (
        <div
          className={cx(
            "mb-4 inline-flex h-9 w-9 items-center justify-center rounded-xl",
            accent
              ? "bg-emerald-600/10 text-emerald-700"
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
