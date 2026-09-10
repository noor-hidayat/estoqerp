import * as React from "react";
import { cn } from "@/lib/utils";

const bgMap: Record<string, string> = {
  "Qty": "bg-amber-50 dark:bg-amber-950/20",
  "Qty Reject": "bg-amber-50 dark:bg-amber-950/20",
  "Qty Received": "bg-amber-50 dark:bg-amber-950/20",
  "Qty Accepted": "bg-emerald-50 dark:bg-emerald-950/20",
  "Qty PO": "bg-sky-50 dark:bg-sky-950/20",
  "Rate": "bg-sky-50 dark:bg-sky-950/20",
  "Amount": "bg-sky-50 dark:bg-sky-950/20",
  "Parameter": "bg-violet-50 dark:bg-violet-950/20",
  "Qty.": "bg-amber-50 dark:bg-amber-950/20",
  "default": "bg-white dark:bg-zinc-900",
};

function bgForColumn(title: string) {
  if (!title) return bgMap["default"];
  const t = title.toLowerCase();
  if (t.includes("qty")) return bgMap["Qty"];
  if (t.includes("rate") || t.includes("amount")) return bgMap["Rate"];
  if (t.includes("parameter")) return bgMap["Parameter"];
  if (t.includes("warehouse") || t.includes("wh") || t.includes("gudang")) return "bg-sky-50 dark:bg-sky-950/20";
  if (t.includes("item")) return "bg-slate-50 dark:bg-slate-900/50";
  return bgMap[title] ?? bgMap["default"];
}

export interface TableInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  columnTitle?: string;
  isNumeric?: boolean;
  placeholderQty?: string;
  currency?: string;
}

function formatDisplayId(value: string): string {
  if (value === "" || value == null) return "";
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(num);
}

function parseIdInput(input: string): string {
  let s = input.trim();
  if (s === "") return "";
  // jika ada koma => titik = ribuan, koma = desimal
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    // hanya titik tanpa koma: tentukan titik ribuan vs desimal
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      s = s.replace(/\./g, "");
    } else {
      const parts = s.split(".");
      const after = parts[1] ?? "";
      // jika setelah titik tepat 3 digit dan panjang total >4, anggap ribuan (1.000)
      if (after.length === 3 && s.replace("-", "").length > 4) {
        s = s.replace(/\./g, "");
      }
      // else anggap desimal -> biarkan titik
    }
  }
  // hanya angka, titik, minus
  s = s.replace(/[^0-9.\-]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  s = s.replace(/(?!^)-/g, "");
  if (s === "-" || s === "." || s === "-.") return "";
  return s;
}

function toEditDisplay(value: string): string {
  if (value === "" || value == null) return "";
  // tampil saat edit: ganti titik desimal jadi koma, tanpa format ribuan
  return value.replace(".", ",");
}

export function TableInput({
  value,
  onChange,
  columnTitle = "",
  isNumeric = false,
  placeholder,
  className,
  type,
  currency,
  ...props
}: TableInputProps) {
  const [focused, setFocused] = React.useState(false);
  const isZero = value === "0" || value === "0.000" || value === "0.00" || value === "";
  const formatted = isNumeric ? (isZero ? "0" : formatDisplayId(value)) : value;
  const editDisplay = isNumeric && value !== "" ? toEditDisplay(value) : value;
  const displayValue = isNumeric
    ? focused
      ? isZero
        ? ""
        : editDisplay
      : formatted
    : focused && isZero
      ? ""
      : value;
  const isEmpty = displayValue === "";
  const placeholderText = placeholder ?? (isNumeric ? "Qty" : columnTitle || "");
  const bg = focused ? bgForColumn(columnTitle) : "bg-transparent";
  const showCurrency = !!currency && isNumeric && !focused;
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    (props as any).onFocus?.(e);
  };
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(false);
    (props as any).onBlur?.(e);
  };

  if (currency && isNumeric) {
    return (
      <div className="relative flex w-full items-center">
        {showCurrency && (
          <span className="pointer-events-none absolute left-3 text-[13px] font-medium tracking-wide text-muted-foreground">
            {currency}
          </span>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          placeholder={isEmpty && focused ? placeholderText : undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onWheel={(e) => (e.target as HTMLInputElement).blur()}
          onChange={(e) => {
            const raw = e.target.value;
            const parsed = parseIdInput(raw);
            onChange(parsed);
          }}
          className={cn(
            "h-9 w-full border-0 bg-transparent px-3 text-[13px] tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0",
            showCurrency ? "pl-14 text-right" : "text-right",
            focused && bg,
            focused && "placeholder:text-muted-foreground",
            className
          )}
          {...props}
        />
      </div>
    );
  }

  return (
    <input
      type={isNumeric ? "text" : type ?? "text"}
      inputMode={isNumeric ? "decimal" : undefined}
      value={displayValue}
      placeholder={isEmpty && focused ? placeholderText : undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      onChange={(e) => {
        const raw = e.target.value;
        if (!isNumeric) {
          onChange(raw);
          return;
        }
        const parsed = parseIdInput(raw);
        onChange(parsed);
      }}
      className={cn(
        "h-9 w-full border-0 bg-transparent px-3 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0",
        isNumeric && "text-right tabular-nums",
        focused && bg,
        focused && "placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export interface TableCellInputProps {
  children: React.ReactNode;
  className?: string;
}
export function TableCellInput({ children, className }: TableCellInputProps) {
  return <div className={cn("p-0 border-r border-border last:border-r-0 h-9 flex items-center", className)}>{children}</div>;
}
