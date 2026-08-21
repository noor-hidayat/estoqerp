import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Form page layout for New/Create/Edit — header full width, content full width */
export function FormPage({
  breadcrumb,
  eyebrow,
  title,
  description,
  actions,
  titleBadge,
  children,
}: {
  breadcrumb?: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  titleBadge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full">
      {breadcrumb}
      <div className="mb-9 mt-3 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              {eyebrow}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-[-0.02em] text-foreground sm:text-[26px]">
              {title}
            </h1>
            {titleBadge}
          </div>
          {description && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="w-full">{children}</div>
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
    <div className={cn("grid gap-x-8 gap-y-5 sm:grid-cols-2", className)}>
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