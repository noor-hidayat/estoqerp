"use client"

import { cn } from "@/lib/utils";

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
            <span className="text-sm font-medium text-foreground">{label}</span>
          )}
          {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-300",
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "block h-4.5 w-4.5 rounded-full bg-background shadow-sm transition-transform duration-300",
            checked ? "translate-x-[22px]" : "translate-x-[3px]"
          )}
        />
      </button>
    </div>
  );
}
