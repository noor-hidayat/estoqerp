"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/utils";

export interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, id, ...props },
  ref
) {
  const inputId = id || props.name;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[13px] font-medium text-zinc-700"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cx(
            "h-10 w-full rounded-xl border bg-white text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/60",
            error
              ? "border-red-400 focus:ring-red-500/40 focus:border-red-500"
              : "border-zinc-300",
            icon ? "pl-10 pr-3.5" : "px-3.5",
            className
          )}
          {...props}
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
