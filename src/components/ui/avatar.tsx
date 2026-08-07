import { hueBg, cx } from "@/lib/utils";

export function Avatar({
  name,
  hue,
  size = "md",
  className,
}: {
  name: string;
  hue: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-8 w-8 text-[10px]",
    md: "h-10 w-10 text-[12px]",
    lg: "h-14 w-14 text-[15px]",
  };
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizes[size],
        className
      )}
      style={{ background: hueBg(hue) }}
    >
      {initials}
    </span>
  );
}
