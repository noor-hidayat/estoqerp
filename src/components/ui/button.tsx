"use client";

import { motion } from "framer-motion";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-colors duration-200 select-none disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-zinc-900 text-zinc-50 hover:bg-zinc-800 active:bg-zinc-950 shadow-sm",
  secondary:
    "bg-emerald-600/90 text-white hover:bg-emerald-600 shadow-sm shadow-emerald-600/20",
  outline:
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 hover:border-zinc-400",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
  danger: "bg-red-600 text-white hover:bg-red-500 shadow-sm",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-7 text-sm",
  icon: "h-10 w-10",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "primary", size = "md", className, children, ...props }, ref) {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: 0.97 }}
        className={cx(base, variants[variant], sizes[size], className)}
        {...(props as object)}
      >
        {children}
      </motion.button>
    );
  }
);
