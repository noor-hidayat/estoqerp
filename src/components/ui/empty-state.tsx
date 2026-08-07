import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300/80 bg-zinc-50/50 px-6 py-16 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-zinc-400 shadow-sm ring-1 ring-zinc-200/60">
        {icon}
      </div>
      <h3 className="text-[15px] font-semibold text-zinc-800">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zinc-500">
        {description}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "animate-pulse rounded-lg bg-zinc-200/70",
        className
      )}
    />
  );
}
