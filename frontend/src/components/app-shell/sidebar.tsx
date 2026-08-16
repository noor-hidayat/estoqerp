"use client";

import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/stockops.svg"
      alt="StockOps"
      className={cn("h-9 w-9", className)}
    />
  );
}