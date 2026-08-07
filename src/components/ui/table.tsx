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
          <tr className="border-b border-zinc-200/80">
            {columns.map((col, i) => (
              <th
                key={i}
                className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 first:pl-0"
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
        "px-4 py-3.5 align-middle text-zinc-700 first:pl-0",
        mono && "font-mono text-[13px] text-zinc-800",
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
