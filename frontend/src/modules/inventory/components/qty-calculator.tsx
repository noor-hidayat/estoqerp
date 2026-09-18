import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface QtyCalculatorProps {
  value: string;
  onChange: (value: string) => void;
  onTab?: () => void;
  disabled?: boolean;
  registerRef?: (el: HTMLInputElement | null) => void;
}

function evaluate(expr: string): number | null {
  let cleaned = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (cleaned.includes(",") && cleaned.includes(".")) {
    cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(/,/g, ".");
  }
  if (!/^[0-9+\-*/.() ]+$/.test(cleaned)) return null;
  try {
    const result = Function(`"use strict"; return (${cleaned});`)() as number;
    return Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function formatResult(n: number): string {
  const rounded = Math.round(n * 1000000) / 1000000;
  return String(rounded);
}

/** Format angka id-ID: 1000.5 → "1.000,5". */
function formatQty(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 }).format(n);
}

export function QtyCalculator({ value, onChange, onTab, disabled, registerRef }: QtyCalculatorProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const apply = () => {
    if (draft === null) return;
    const n = evaluate(draft);
    if (n !== null) onChange(formatResult(n));
    else onChange(draft.trim());
    setDraft(null);
    inputRef.current?.blur();
  };

  const num = Number(value);

  return (
    <input
      ref={(el) => {
        inputRef.current = el;
        registerRef?.(el);
      }}
      type="text"
      inputMode="decimal"
      value={draft ?? (value === "" || !Number.isFinite(num) ? value : formatQty(num))}
      disabled={disabled}
      onFocus={() => setDraft(value)}
      onBlur={apply}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          apply();
        } else if (e.key === "Tab") {
          e.preventDefault();
          apply();
          onTab?.();
        } else if (e.key === "Escape") {
          setDraft(null);
        }
      }}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={draft ?? ""}
      className={cn(
        "h-8 w-24 border-none bg-transparent px-1 text-right  text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 disabled:opacity-100"
      )}
    />
  );
}