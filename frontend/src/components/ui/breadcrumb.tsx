"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-[12px] text-zinc-400">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} strokeWidth={2} className="shrink-0" />}
            {c.href && !last ? (
              <Link
                href={c.href}
                className="transition-colors hover:text-emerald-600"
              >
                {c.label}
              </Link>
            ) : (
              <span className={last ? "font-medium text-zinc-700" : ""}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
