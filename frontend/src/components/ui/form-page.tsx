import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Form page layout for New/Create/Edit — content centered, max 680px */
export function FormPage({
  breadcrumb,
  eyebrow,
  title,
  description,
  children,
}: {
  breadcrumb?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[680px]">
      {breadcrumb}
      <div className="mb-9 mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          )}
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/** Form section with small title + divider line on the right. */
export function FormSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("pb-9", className)}>
      {title && (
        <div className="mb-5 flex items-center gap-4">
          <h2 className="whitespace-nowrap text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </h2>
          <div className="h-px flex-1 bg-border" />
          {actions && <div className="shrink-0">{actions}</div>}
        </div>
      )}
      {description && (
        <p className="mb-4 -mt-2 text-[12px] text-muted-foreground">{description}</p>
      )}
      {children}
    </section>
  );
}

/** Form field grid — 2 columns on sm+ screens, consistent gap. */
export function FormGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-x-4 gap-y-5 sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}

/** Form actions in footer — separated by divider. */
export function FormActions({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-border pt-5",
        className
      )}
    >
      {children}
    </div>
  );
}
