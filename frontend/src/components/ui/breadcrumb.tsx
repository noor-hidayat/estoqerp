import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({
  crumbs,
  className,
}: {
  crumbs: Crumb[];
  className?: string;
}) {
  return (
    <nav
      className={cn(
        "mb-4 flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground",
        className
      )}
    >
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} strokeWidth={2} className="shrink-0" />}
            {c.href && !last ? (
              <Link
                to={c.href}
                className="whitespace-nowrap transition-colors hover:text-primary"
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "whitespace-nowrap",
                  last && "font-semibold text-foreground"
                )}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}