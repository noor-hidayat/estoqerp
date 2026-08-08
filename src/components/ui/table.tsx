import type { ReactNode } from "react";
import { cx } from "@/lib/utils";

export function Table({
  columns,
  children,
  className,
}: {
  columns: ReactNode[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50/60">
            {columns.map((col, i) => (
              <th
                key={i}
                className="px-4 py-3.5 text-[11px] font-bold uppercase tracking-wider text-zinc-500 first:pl-6 last:pr-6"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
  mono,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <td
      className={cx(
        "px-4 py-4 align-middle text-[14px] leading-relaxed text-zinc-700 first:pl-6 last:pr-6",
        mono && "font-mono text-[12.5px] tracking-tight text-zinc-500",
        className
      )}
    >
      {children}
    </td>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 first:pl-0">
      {children}
    </th>
  );
}
