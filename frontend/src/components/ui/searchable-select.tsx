import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn, cx } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface SearchableOption {
  value: string;
  label: string;
}

const bgMapSelect: Record<string, string> = {
  Qty: "bg-amber-50 dark:bg-amber-950/20",
  "Qty Reject": "bg-amber-50 dark:bg-amber-950/20",
  "Qty Received": "bg-amber-50 dark:bg-amber-950/20",
  Parameter: "bg-violet-50 dark:bg-violet-950/20",
  default: "bg-amber-50 dark:bg-amber-950/20",
};
function bgForSelectColumn(title: string) {
  if (!title) return bgMapSelect["default"];
  const t = title.toLowerCase();
  if (t.includes("qty")) return bgMapSelect["Qty"];
  if (t.includes("parameter")) return bgMapSelect["Parameter"];
  if (t.includes("rate") || t.includes("amount")) return "bg-sky-50 dark:bg-sky-950/20";
  return bgMapSelect[title] ?? bgMapSelect["default"];
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
  table = false,
  columnTitle = "",
  inputId,
  inputRef,
  onBlur,
  emptyLabel,
  className,
  anchorSelected = true,
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
  table?: boolean;
  columnTitle?: string;
  inputId?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onBlur?: () => void;
  emptyLabel?: string;
  className?: string;
  anchorSelected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useImperativeHandle(inputRef, () => (table ? innerRef.current : triggerRef.current) as unknown as HTMLInputElement, []);

  const selected = options.find((o) => o.value === value);

  // anchor mode: when value exists, query empty, and selected is in list
  // we want dropdown to open with selected aligned to trigger (items above trigger, below trigger)
  const anchorEnabled = anchorSelected !== false;

  const available = useMemo(
    () =>
      excludeSelected
        ? options.filter((o) => o.value !== value)
        : options,
    [options, value, excludeSelected]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    // When anchor is active and query empty we must include selected even if excludeSelected=true
    const sourceForAnchor = anchorEnabled && q === "" && value ? options : available;
    const base = q
      ? sourceForAnchor.filter((o) => o.label.toLowerCase().includes(q))
      : sourceForAnchor;
    const list = emptyLabel
      ? [{ value: "", label: emptyLabel }, ...base]
      : base;
    const hasSelected = value !== "" && list.some((o) => o.value === value);
    // Anchor: show full list (no slice) so 1-4 can be above and 6-10 below trigger.
    // For large lists still cap via max-height + scroll, but don't slice so surrounding items stay visible.
    if (anchorEnabled && q === "" && hasSelected) {
      return list;
    }
    return list.slice(0, maxSuggestions);
  }, [available, options, query, maxSuggestions, emptyLabel, value, anchorEnabled]);

  const totalMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // total should reflect same source as visible (include selected when anchor)
    const src = anchorEnabled && q === "" && value ? options : available;
    return q
      ? src.filter((o) => o.label.toLowerCase().includes(q)).length + (emptyLabel ? 1 : 0)
      : src.length + (emptyLabel ? 1 : 0);
  }, [available, options, query, emptyLabel, value, anchorEnabled]);

  // highlight: if anchor and selected visible, highlight selected; else 0
  useEffect(() => {
    if (anchorEnabled && value && query.trim() === "") {
      const idx = visible.findIndex((o) => o.value === value);
      if (idx !== -1) {
        setHighlight(idx);
        return;
      }
    }
    setHighlight(0);
  }, [visible, value, query, anchorEnabled]);

  const shouldAnchorNow = anchorEnabled && !!value && query.trim() === "" && visible.some((o) => o.value === value) && !!selected;

  // Scroll selected into view for non-anchor filtered case or after anchor clamping
  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    if (shouldAnchorNow) return; // anchor positioning handles scroll
    // when filtered and highlight points to something, ensure visible
    const el = listRef.current.querySelector(`[data-index="${highlight}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [open, highlight, shouldAnchorNow]);

  // Keep list scrolled to highlight on keyboard nav (non-anchor)
  useEffect(() => {
    if (!open || !listRef.current || shouldAnchorNow) return;
    const el = listRef.current.querySelector(`[data-index="${highlight}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open, shouldAnchorNow]);

  // Table: positioning with anchor support
  useLayoutEffect(() => {
    if (!open || !table) return;
    const triggerEl = innerRef.current;
    if (!triggerEl) return;

    const getTriggerRect = () => triggerEl.getBoundingClientRect();

    if (shouldAnchorNow) {
      // provisional below, then measure and anchor
      const triggerRect0 = getTriggerRect();
      setCoords({ top: triggerRect0.bottom + 4, left: triggerRect0.left, width: triggerRect0.width });

      let raf1 = 0;
      let raf2 = 0;
      const compute = () => {
        const dropdownEl = dropdownRef.current;
        const listEl = listRef.current;
        const trigRect = getTriggerRect();
        if (!dropdownEl || !listEl) return;
        // find selected element
        const selIdx = visible.findIndex((o) => o.value === value);
        if (selIdx === -1) {
          setCoords({ top: trigRect.bottom + 4, left: trigRect.left, width: trigRect.width });
          return;
        }
        const selEl = listEl.querySelector(`[data-value="${CSS.escape(value)}"]`) as HTMLElement | null
          ?? (listEl.querySelector(`[data-index="${selIdx}"]`) as HTMLElement | null);
        if (!selEl) {
          setCoords({ top: trigRect.bottom + 4, left: trigRect.left, width: trigRect.width });
          return;
        }
        const dropdownRect = dropdownEl.getBoundingClientRect();
        const selRect = selEl.getBoundingClientRect();
        const offset = selRect.top - dropdownRect.top; // distance from dropdown top to selected top
        const desiredTop = trigRect.top - offset;
        // dropdownHeight = list scrollHeight + wrapper padding/border (approx 8)
        const listHeight = listEl.scrollHeight;
        // for anchor we allow larger height up to viewport
        const maxAllowed = Math.min(window.innerHeight - 16, Math.max(224, listHeight + 12));
        // actually dropdown height limited by maxHeight we will set; estimate
        const dropdownHeight = Math.min(listHeight + 12, maxAllowed);
        const vpPad = 8;
        const minTop = vpPad;
        const maxTop = window.innerHeight - dropdownHeight - vpPad;
        let clampedTop = Math.max(minTop, Math.min(desiredTop, maxTop));
        // if clamped, we need to scroll list to keep selected aligned
        let scrollTop = 0;
        if (clampedTop !== desiredTop) {
          // selected screen pos = clampedTop + offset - scrollTop
          // want = trigRect.top  => scrollTop = clampedTop + offset - trigRect.top
          scrollTop = clampedTop + offset - trigRect.top;
          scrollTop = Math.max(0, Math.min(scrollTop, listEl.scrollHeight - listEl.clientHeight));
        }
        setCoords({ top: clampedTop, left: trigRect.left, width: trigRect.width });
        // apply maxHeight and scroll after coords update
        requestAnimationFrame(() => {
          if (listEl) {
            // remove previous max-h-56 limit for anchor: set inline maxHeight
            listEl.style.maxHeight = `${dropdownHeight - 4}px`;
            // ensure scroll
            if (scrollTop !== 0) listEl.scrollTop = scrollTop;
            else listEl.scrollTop = 0;
          }
        });
      };

      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(compute);
      });

      const onResize = () => compute();
      window.addEventListener("resize", onResize);
      window.addEventListener("scroll", onResize, true);
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        window.removeEventListener("resize", onResize);
        window.removeEventListener("scroll", onResize, true);
      };
    } else {
      const update = () => {
        const el = innerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
        if (listRef.current) {
          listRef.current.style.maxHeight = "";
          listRef.current.scrollTop = 0;
        }
      };
      update();
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      return () => {
        window.removeEventListener("scroll", update, true);
        window.removeEventListener("resize", update);
      };
    }
  }, [open, table, visible, value, query, shouldAnchorNow]);

  // Outside click for table portal (and also for non-table anchor portal if we use it)
  useEffect(() => {
    if (!open || !table) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current && wrapRef.current.contains(t)) return;
      if (dropdownRef.current && dropdownRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, disabled, table]);

  useEffect(() => {
    if (open && !table) {
      // for non-table popover case, focus search; for anchor portal case we also focus?
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else if (!open) {
      setQuery("");
    }
  }, [open, table]);

  // Non-table anchor portal positioning (when shouldAnchorNow true, we render portal instead of Popover)
  // we reuse same coords state for non-table anchor
  useLayoutEffect(() => {
    if (!open || table) return;
    if (!shouldAnchorNow) {
      setCoords(null);
      return;
    }
    const triggerEl = triggerRef.current;
    if (!triggerEl) return;
    const triggerRect0 = triggerEl.getBoundingClientRect();
    setCoords({ top: triggerRect0.bottom + 4, left: triggerRect0.left, width: triggerRect0.width });
    let raf1 = 0;
    let raf2 = 0;
    const compute = () => {
      const dropdownEl = dropdownRef.current;
      const listEl = listRef.current;
      const trigRect = triggerEl.getBoundingClientRect();
      if (!dropdownEl || !listEl) return;
      const selIdx = visible.findIndex((o) => o.value === value);
      if (selIdx === -1) {
        setCoords({ top: trigRect.bottom + 4, left: trigRect.left, width: trigRect.width });
        return;
      }
      const selEl = listEl.querySelector(`[data-value="${CSS.escape(value)}"]`) as HTMLElement | null
        ?? (listEl.querySelector(`[data-index="${selIdx}"]`) as HTMLElement | null);
      if (!selEl) {
        setCoords({ top: trigRect.bottom + 4, left: trigRect.left, width: trigRect.width });
        return;
      }
      const dropdownRect = dropdownEl.getBoundingClientRect();
      const selRect = selEl.getBoundingClientRect();
      const offset = selRect.top - dropdownRect.top;
      const desiredTop = trigRect.top - offset;
      const listHeight = listEl.scrollHeight;
      // add search bar height if present (listEl is only list, dropdown includes search slot separately for non-table portal)
      // For non-table portal we include search bar inside dropdownEl, so offset already includes it.
      const dropdownHeight = Math.min(listEl.scrollHeight + 50, Math.min(window.innerHeight - 16, Math.max(240, listHeight + 44)));
      const vpPad = 8;
      const minTop = vpPad;
      const maxTop = window.innerHeight - dropdownHeight - vpPad;
      let clampedTop = Math.max(minTop, Math.min(desiredTop, maxTop));
      let scrollTop = 0;
      if (clampedTop !== desiredTop) {
        scrollTop = clampedTop + offset - trigRect.top;
        scrollTop = Math.max(0, Math.min(scrollTop, listEl.scrollHeight - listEl.clientHeight));
      }
      setCoords({ top: clampedTop, left: trigRect.left, width: trigRect.width });
      requestAnimationFrame(() => {
        if (listEl) {
          listEl.style.maxHeight = `${dropdownHeight - 44}px`;
          if (scrollTop !== 0) listEl.scrollTop = scrollTop;
          else listEl.scrollTop = 0;
        }
      });
    };
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(compute);
    });
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [open, table, visible, value, shouldAnchorNow]);

  // outside click for non-table anchor portal
  useEffect(() => {
    if (!open || table || !shouldAnchorNow) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current && wrapRef.current.contains(t)) return;
      if (dropdownRef.current && dropdownRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, table, shouldAnchorNow]);

  const pick = (o: SearchableOption) => {
    onChange(o.value);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setOpen(true);
        // highlight will be set via effect to selected
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
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  if (table) {
    return (
      <div className={cx("", className)}>
        <div ref={wrapRef} className="relative">
          <div className="relative">
            <input
              id={inputId}
              ref={innerRef}
              value={open ? query : selected?.label ?? (value === "" && emptyLabel ? emptyLabel : "")}
              onFocus={() => {
                if (disabled) return;
                setFocused(true);
                // anchor mode: allow click-to-open to see anchored list without typing
                if (shouldAnchorNow || (anchorEnabled && !!value && query.trim() === "")) {
                  // if already selected, opening shows anchored list
                  // we don't auto-open on focus to respect "only after typing" spec,
                  // but if user clicks again we handle via onClick
                }
                // highlight will be set via effect
              }}
              onClick={() => {
                if (disabled) return;
                // For table: if has value and query empty, click toggles anchored dropdown
                // This enables "klik lagi select nya" to see 1-4 above, 6-10 below
                if (anchorEnabled && !!value && query.trim() === "" && !open) {
                  setOpen(true);
                }
              }}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                setOpen(true);
                if (v !== selected?.label) onChange("");
              }}
              onKeyDown={onKeyDown}
              onBlur={() => {
                setFocused(false);
                onBlur?.();
              }}
              placeholder={placeholder}
              disabled={disabled}
              readOnly={disabled}
              className={cx(
                `flex h-9 w-full items-center border-0 px-3 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 ${focused ? bgForSelectColumn(columnTitle) : "bg-transparent"}`,
                compact ? "h-8 px-2.5 pr-7 text-xs" : "h-9 px-3 pr-9"
              )}
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
              <ChevronDown
                size={14}
                strokeWidth={2}
                className={cx("shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
              />
            </div>
          </div>

          {open &&
            coords &&
            createPortal(
              <div
                ref={dropdownRef}
                style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
                className="overflow-hidden rounded-md border border-border bg-popover shadow-lg"
              >
                <div ref={listRef} className="overflow-y-auto p-1" style={shouldAnchorNow ? undefined : { maxHeight: "14rem" }}>
                  {visible.length === 0 ? (
                    <p className="px-3 py-3 text-[12.5px] text-muted-foreground">{emptyText}</p>
                  ) : (
                    visible.map((o, i) => (
                      <button
                        key={o.value || `empty-${o.label}-${i}`}
                        type="button"
                        data-index={i}
                        data-value={o.value}
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => pick(o)}
                        className={cx(
                          "flex w-full items-center gap-2 rounded px-3 py-2.5 text-left text-[13.5px] text-foreground transition-colors",
                          i === highlight && "bg-accent"
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{o.label}</span>
                        {o.value === value && <Check size={14} strokeWidth={2.5} className="shrink-0 text-primary" />}
                      </button>
                    ))
                  )}
                  {!shouldAnchorNow && totalMatches > visible.length && (
                    <p className="px-3 pb-1.5 pt-2 text-[11px] text-muted-foreground">
                      Showing {visible.length} of {totalMatches} — keep typing to narrow
                    </p>
                  )}
                </div>
              </div>,
              document.body
            )}
        </div>
      </div>
    );
  }

  // Non-table: if anchor mode and open, render custom portal anchored (so 1-4 above, 5 at trigger, 6-10 below)
  if (shouldAnchorNow && open) {
    return (
      <div className={cn("flex flex-col gap-2", className)} ref={wrapRef}>
        {label && <label className="text-sm font-medium leading-none">{label}</label>}
        <button
          id={inputId}
          ref={triggerRef as React.Ref<HTMLButtonElement>}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          data-size="default"
          data-placeholder={!selected && (value === "" || !value) ? "true" : undefined}
          onClick={() => !disabled && setOpen((v) => !v)}
          onBlur={() => onBlur?.()}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm whitespace-nowrap shadow-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            !selected && value === "" && "text-muted-foreground"
          )}
        >
          <span className="truncate text-left">{selected ? selected.label : value === "" && emptyLabel ? emptyLabel : placeholder}</span>
          <ChevronDown className={cn("ml-2 size-4 shrink-0 opacity-50 transition-transform text-muted-foreground", open && "rotate-180")} />
        </button>
        {coords &&
          createPortal(
            <div
              ref={dropdownRef}
              style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
              className="overflow-hidden rounded-lg border border-border bg-popover shadow-md ring-1 ring-foreground/10"
            >
              <div className="flex items-center border-b border-border px-3">
                <Search size={14} className="mr-2 shrink-0 opacity-50" />
                <input
                  ref={searchInputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
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
                  }}
                  placeholder="Search..."
                  className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div ref={listRef} className="overflow-y-auto p-1">
                {visible.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
                ) : (
                  visible.map((o, i) => (
                    <button
                      key={o.value || `empty-${o.label}-${i}`}
                      type="button"
                      data-index={i}
                      data-value={o.value}
                      onClick={() => pick(o)}
                      onMouseEnter={() => setHighlight(i)}
                      className={cn(
                        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
                        i === highlight && "bg-accent text-accent-foreground",
                        o.value === value && "bg-accent text-accent-foreground"
                      )}
                    >
                      <span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap truncate">{o.label}</span>
                      {o.value === value && (
                        <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                          <Check className="size-4" />
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body
          )}
      </div>
    );
  }

  // Non-table default: Base Nova Select style (button + Popover with search)
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <label className="text-sm font-medium leading-none">{label}</label>}
      <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            id={inputId}
            ref={triggerRef as React.Ref<HTMLButtonElement>}
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            data-size="default"
            data-placeholder={!selected && (value === "" || !value) ? "true" : undefined}
            onBlur={() => onBlur?.()}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm whitespace-nowrap shadow-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              !selected && value === "" && "text-muted-foreground"
            )}
          >
            <span className="truncate text-left">{selected ? selected.label : value === "" && emptyLabel ? emptyLabel : placeholder}</span>
            <ChevronDown className={cn("ml-2 size-4 shrink-0 opacity-50 transition-transform text-muted-foreground", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-lg bg-popover shadow-md ring-1 ring-foreground/10" align="start" alignOffset={-4} sideOffset={4}>
          <div className="flex items-center border-b border-border px-3">
            <Search size={14} className="mr-2 shrink-0 opacity-50" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
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
              }}
              placeholder="Search..."
              className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div ref={listRef} className="max-h-60 overflow-y-auto p-1">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              visible.map((o, i) => (
                <button
                  key={o.value || `empty-${o.label}-${i}`}
                  type="button"
                  data-index={i}
                  data-value={o.value}
                  onClick={() => pick(o)}
                  onMouseEnter={() => setHighlight(i)}
                  className={cn(
                    "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
                    i === highlight && "bg-accent text-accent-foreground",
                    o.value === value && "bg-accent text-accent-foreground"
                  )}
                >
                  <span className="flex flex-1 shrink-0 gap-2 whitespace-nowrap truncate">{o.label}</span>
                  {o.value === value && (
                    <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
                      <Check className="size-4" />
                    </span>
                  )}
                </button>
              ))
            )}
            {totalMatches > visible.length && (
              <p className="px-3 pb-1.5 pt-2 text-[11px] text-muted-foreground">
                Showing {visible.length} of {totalMatches} — keep typing to narrow
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
