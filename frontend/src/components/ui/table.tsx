"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "@/lib/utils";
import { useColumnWidths } from "@/lib/use-column-widths";

const MIN_W = 0.25;
const PX_PER_UNIT = 90;

export function Table({
  columns,
  children,
  className,
  fixed,
  widths,
  storageKey,
  minWidth,
}: {
  columns: ReactNode[];
  children: ReactNode;
  className?: string;
  /** layout kolom tetap (table-fixed) — lebar tidak berubah saat isi berubah */
  fixed?: boolean;
  /** lebar per kolom (kelas Tailwind, contoh "w-24" / "w-[30%]") — dipakai saat fixed */
  widths?: (string | undefined)[];
  /** kunci unik per tabel agar pengaturan lebar kolom tersimpan di sistem */
  storageKey?: string;
  /** lebar minimum tabel (px) agar kolom tetap terbaca; container yang scroll */
  minWidth?: number;
}) {
  const count = columns.length + 1;
  const hook = useColumnWidths(storageKey ?? "", count);
  const tableRef = useRef<HTMLTableElement>(null);
  const [liveWidths, setLiveWidths] = useState<number[] | null>(null);
  const adjustable = storageKey ? liveWidths ?? hook.widths : null;
  const totalPx = adjustable ? adjustable.reduce((a, b) => a + b, 0) * PX_PER_UNIT : undefined;

  const beginResize = (i: number) => (e: React.PointerEvent) => {
    if (!hook.canEdit) return;
    e.preventDefault();
    const table = tableRef.current;
    if (!table) return;
    const base = hook.widths;
    const startX = e.clientX;
    const tableW = table.getBoundingClientRect().width || 1;
    let next: number[] | null = null;

    const onMove = (ev: PointerEvent) => {
      const delta = ((ev.clientX - startX) / tableW) * 10;
      const cur = base;
      next = [...cur];
      if (delta >= 0) {
        const add = Math.round((Math.min(delta, 10 - cur[i], cur[i + 1] - MIN_W)) * 4) / 4;
        next[i] = cur[i] + add;
        next[i + 1] = cur[i + 1] - add;
      } else {
        const sub = Math.round((Math.min(-delta, cur[i] - MIN_W, 10 - cur[i + 1])) * 4) / 4;
        next[i] = cur[i] - sub;
        next[i + 1] = cur[i + 1] + sub;
      }
      setLiveWidths(next);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setLiveWidths(null);
      if (next) hook.save(next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      className={cx(
        "relative max-w-full overflow-x-auto overscroll-x-contain",
        className
      )}
    >
      <table
        ref={tableRef}
        style={
          totalPx || minWidth
            ? { width: "100%", minWidth: minWidth ?? totalPx }
            : undefined
        }
        className={cx(
          "border-collapse text-left text-sm",
          fixed || storageKey ? "table-fixed" : "w-full min-w-[560px]"
        )}
      >
        {storageKey && (
          <colgroup>
            {adjustable?.map((w, i) => (
              <col key={i} style={{ width: w * PX_PER_UNIT }} />
            ))}
          </colgroup>
        )}
        <thead>
          <tr className="bg-zinc-50/60">
            <th className="group relative w-14 border-b border-r border-zinc-200 px-4 py-2.5 text-[11px] font-bold tracking-wider text-zinc-500 first:pl-6">
              No.
              {storageKey && hook.canEdit && (
                <span
                  onPointerDown={beginResize(0)}
                  className="absolute inset-y-0 -right-1 z-10 w-1.5 cursor-col-resize touch-none select-none group-hover:bg-zinc-400/50"
                />
              )}
            </th>
            {columns.map((col, i) => (
              <th
                key={i}
                className={cx(
                  "group relative border-b border-r border-zinc-200 px-4 py-2.5 text-[11px] font-bold tracking-wider text-zinc-500 last:border-r-0 last:pr-6",
                  widths?.[i],
                  storageKey && i === columns.length - 1 && "pr-10"
                )}
              >
                {col}
                {storageKey && hook.canEdit && i < columns.length - 1 && (
                  <span
                    onPointerDown={beginResize(i + 1)}
                    className="absolute inset-y-0 -right-1 z-10 w-1.5 cursor-col-resize touch-none select-none group-hover:bg-zinc-400/50"
                  />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Children.map(children, (child, idx) => {
            if (!isValidElement<{ children?: ReactNode }>(child)) return child;
            return cloneElement(child, {
              children: [
                <td
                  key="__no__"
                  className="h-8 border-b border-r border-zinc-200 px-4 py-[2.4px] align-middle font-mono text-[12.5px] tracking-tight text-zinc-400 first:pl-6"
                >
                  {String(idx + 1).padStart(2, "0")}
                </td>,
                child.props.children,
              ],
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Td({
  children,
  className,
  mono,
  truncate,
  nowrap,
}: {
  children: ReactNode;
  className?: string;
  mono?: boolean;
  truncate?: boolean;
  nowrap?: boolean;
}) {
  return (
    <td
      className={cx(
        "h-8 break-words border-b border-r border-zinc-200 px-4 py-[2.4px] align-middle text-[14px] leading-snug text-zinc-700 first:pl-6 last:border-r-0 last:pr-6",
        mono && "font-mono text-[12.5px] tracking-tight text-zinc-500",
        nowrap && "whitespace-nowrap",
        className
      )}
    >
      {truncate ? <div className="truncate">{children}</div> : children}
    </td>
  );
}

export function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-[11px] font-semibold tracking-wider text-zinc-400 first:pl-0">
      {children}
    </th>
  );
}
