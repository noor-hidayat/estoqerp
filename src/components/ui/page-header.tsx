import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div>
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-emerald-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-[60ch] text-sm leading-relaxed text-zinc-500">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}
