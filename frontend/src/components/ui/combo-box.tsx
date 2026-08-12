"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cx } from "@/lib/utils";

export interface ComboOption {
  value: string;
  label: string;
}

export function ComboBox({
  label,
  options,
  value,
  onChange,
  placeholder = "Cari...",
  emptyText = "Tidak ada hasil",
  className,
}: {
  label?: string;
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[13px] font-medium text-zinc-700">{label}</label>
      )}
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3.5 text-sm text-zinc-900 transition-colors focus:outline-none focus:ring-1 focus:ring-zinc-900/20 focus:border-zinc-400"
        >
          <span className={cx("truncate", !selected && "text-zinc-400")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2}
            className={cx(
              "shrink-0 text-zinc-400 transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg">
            <div className="relative border-b border-zinc-100">
              <Search
                size={14}
                strokeWidth={2}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari kode / nama lokasi..."
                className="h-10 w-full bg-transparent pl-9 pr-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
              />
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3.5 py-3 text-[12.5px] text-zinc-400">
                  {emptyText}
                </p>
              ) : (
                filtered.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => {
                      onChange(o.value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13.5px] text-zinc-700 transition-colors hover:bg-zinc-50"
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.value === value && (
                      <Check size={14} strokeWidth={2.5} className="shrink-0 text-emerald-600" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
