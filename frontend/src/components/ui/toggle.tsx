"use client";

import { cx } from "@/lib/utils";

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      {(label || hint) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-zinc-800">{label}</span>
          )}
          {hint && <span className="text-xs text-zinc-400">{hint}</span>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300",
          checked ? "bg-emerald-600" : "bg-zinc-300"
        )}
      >
        <span
          className={cx(
            "block h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-300",
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          )}
        />
      </button>
    </div>
  );
}
