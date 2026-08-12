"use client";

import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "@/lib/utils";
import type { FieldProps } from "./input";

interface SelectProps
  extends SelectHTMLAttributes<HTMLSelectElement>,
    FieldProps {
  children: ReactNode;
  icon?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, icon, className, children, id, ...props },
  ref
) {
  const selectId = id || props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-[13px] font-medium text-zinc-700">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
            {icon}
          </span>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cx(
            "h-10 w-full appearance-none rounded-md border bg-white text-sm text-zinc-900 transition-colors",
            "focus:outline-none focus:ring-1 focus:ring-zinc-900/20 focus:border-zinc-400",
            error ? "border-red-400" : "border-zinc-300",
            icon ? "pl-10 pr-9" : "pl-3.5 pr-9",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
        />
      </div>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="text-xs text-zinc-400">{hint}</p>
      ) : null}
    </div>
  );
});
