import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title?: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const hasTitle = title || description || eyebrow;

  return (
    <div className={cn("mb-6 flex items-start justify-between gap-4", className)}>
      {hasTitle && (
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          )}
          {title && (
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-[28px]">
              {title}
            </h1>
          )}
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}