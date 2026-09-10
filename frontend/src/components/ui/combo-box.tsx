import { useMemo, useState, useRef, useEffect } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface ComboOption {
  value: string;
  label: string;
}

export function ComboBox({
  label,
  options,
  value,
  onChange,
  placeholder = "Select...",
  emptyText = "No results",
  emptyLabel,
  disabled = false,
  className,
}: {
  label?: string;
  options: ComboOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    const withEmpty = emptyLabel ? [{ value: "", label: emptyLabel }, ...base] : base;
    return withEmpty;
  }, [options, query, emptyLabel]);

  useEffect(() => {
    if (open) {
      // focus search input when popover opens
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
    }
  }, [open]);

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && <label className="text-sm font-medium leading-none">{label}</label>}
      <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            data-size="default"
            data-placeholder={!selected ? "true" : undefined}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm whitespace-nowrap shadow-sm transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 dark:bg-input/30 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              !selected && "text-muted-foreground"
            )}
          >
            <span className="truncate text-left">{selected ? selected.label : placeholder}</span>
            <ChevronDown className={cn("ml-2 size-4 shrink-0 opacity-50 transition-transform text-muted-foreground", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 rounded-lg bg-popover shadow-md ring-1 ring-foreground/10" align="start" alignOffset={-4} sideOffset={4}>
          <div className="flex items-center border-b border-border px-3">
            <Search size={14} className="mr-2 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className="flex h-9 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value || `empty-${o.label}`}
                  type="button"
                  onClick={() => handleSelect(o.value)}
                  className={cn(
                    "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50",
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
        </PopoverContent>
      </Popover>
    </div>
  );
}
