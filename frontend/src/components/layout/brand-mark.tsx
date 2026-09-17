import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/estoq.svg"
      alt="Estoq"
      className={cn("h-9 w-9", className)}
    />
  );
}