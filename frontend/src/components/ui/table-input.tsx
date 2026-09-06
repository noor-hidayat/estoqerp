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
}

export function TableInput({
  value,
  onChange,
  columnTitle = "",
  isNumeric = false,
  placeholder,
  className,
  type,
  ...props
}: TableInputProps) {
  const [focused, setFocused] = React.useState(false);
  const isZero = value === "0" || value === "0.000" || value === "0.00" || value === "";
  const displayValue = focused && isZero ? "" : value;
  const isEmpty = displayValue === "";
  const placeholderText = placeholder ?? (isNumeric ? "Qty" : columnTitle || "");
  const bg = focused ? bgForColumn(columnTitle) : "bg-transparent";

  return (
    <input
      type={isNumeric ? "number" : type ?? "text"}
      value={displayValue}
      placeholder={isEmpty && focused ? placeholderText : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        if (isEmpty && isNumeric) {
          // keep as 0 for numeric if left empty
        }
      }}
      onWheel={(e) => (e.target as HTMLInputElement).blur()}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 w-full border-0 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0",
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
