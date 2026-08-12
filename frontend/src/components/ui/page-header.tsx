import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

export function PageHeader({
  actions,
  className,
}: {
  title?: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}) {
  if (!actions) return null;

  return (
    <div className={cx("mb-6 flex items-center justify-end gap-3", className)}>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </div>
  );
}
