"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cx } from "@/lib/utils";

export interface SearchableOption {
  value: string;
  label: string;
}

export function SearchableSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Type to search...",
  emptyText = "No results",
  maxSuggestions = 6,
  disabled = false,
  excludeSelected = true,
  compact = false,
  inputId,
  inputRef,
  onBlur,
  className,
}: {
  label?: string;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  maxSuggestions?: number;
  disabled?: boolean;
  excludeSelected?: boolean;
  compact?: boolean;
  inputId?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onBlur?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(inputRef, () => innerRef.current as HTMLInputElement, []);

  const selected = options.find((o) => o.value === value);

  const available = useMemo(
    () =>
      excludeSelected
        ? options.filter((o) => o.value !== value)
        : options,
    [options, value, excludeSelected]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? available.filter((o) => o.label.toLowerCase().includes(q))
      : available;
    return base.slice(0, maxSuggestions);
  }, [available, query, maxSuggestions]);

  const totalMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? available.filter((o) => o.label.toLowerCase().includes(q)).length
      : available.length;
  }, [available, query]);

  useEffect(() => setHighlight(0), [visible]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, disabled]);

  const pick = (o: SearchableOption) => {
    onChange(o.value);
    setQuery(o.label);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
        setHighlight(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(visible.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = visible[highlight];
      if (opt) pick(opt);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-sm font-medium leading-none">{label}</label>
      )}
      <div ref={wrapRef} className="relative">
        <div className="relative">
          <input
            id={inputId}
            ref={innerRef}
            value={query || selected?.label || ""}
            onFocus={() => {
              if (disabled) return;
              setOpen(true);
              setHighlight(0);
              if (selected && query === selected.label) setQuery("");
            }}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => onBlur?.()}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={disabled}
            className={cx(
              "flex w-full items-center rounded-md border border-input bg-background text-sm text-foreground transition-colors focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring disabled:cursor-not-allowed disabled:opacity-50",
              compact ? "h-8 px-2.5 pr-7 text-xs" : "h-10 px-3.5 pr-9"
            )}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {selected && !disabled && (
              <button
                type="button"
                aria-label="Clear selection"
                onClick={() => {
                  onChange("");
                  setQuery("");
                }}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={14} strokeWidth={2} />
              </button>
            )}
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={cx(
                "shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180"
              )}
            />
          </div>
        </div>

        {open && (
          <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
            <div className="max-h-56 overflow-y-auto p-1">
              {visible.length === 0 ? (
                <p className="px-3 py-3 text-[12.5px] text-muted-foreground">
                  {emptyText}
                </p>
              ) : (
                visible.map((o, i) => (
                  <button
                    key={o.value}
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => pick(o)}
                    className={cx(
                      "flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-[13.5px] text-foreground transition-colors",
                      i === highlight && "bg-accent"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.value === value && (
                      <Check size={14} strokeWidth={2.5} className="shrink-0 text-primary" />
                    )}
                  </button>
                ))
              )}
              {totalMatches > maxSuggestions && (
                <p className="px-3 pb-1.5 pt-2 text-[11px] text-muted-foreground">
                  Showing {visible.length} of {totalMatches} — keep typing to narrow
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}