import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  icon,
  accent,
  compact,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: ReactNode;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md",
      accent && "border-l-4 border-l-primary"
    )}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className={cn(
          "mt-0.5  font-bold leading-tight tracking-tight text-foreground",
          compact ? "text-lg" : "text-[21px]"
        )}>
          {value}
        </p>
        {sub && <p className="truncate text-[11.5px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}