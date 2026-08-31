import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/utils";

/** Blok skeleton dasar — mengikuti theme, shimmer subtle. */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cx("skeleton", className)}
      {...props}
    />
  );
}

/** Garis teks skeleton. */
export function SkeletonLine({ className }: { className?: string }) {
  return <Skeleton className={cx("h-3 rounded-full", className)} />;
}

/** Field skeleton — label + input berbentuk field. */
export function SkeletonField({ className }: { className?: string }) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <Skeleton className="h-3.5 w-24 rounded" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}

/** Baris toggle skeleton — label + toggle pill. */
export function SkeletonToggleRow({ className }: { className?: string }) {
  return (
    <div className={cx("flex items-center justify-between py-3", className)}>
      <Skeleton className="h-3.5 w-36 rounded" />
      <Skeleton className="h-6 w-11 rounded-full" />
    </div>
  );
}

/** Baris segmen barcode skeleton — chip + select + posisi. */
export function SkeletonSegmentRow({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-lg border border-border/70 p-2",
        className
      )}
    >
      <Skeleton className="h-9 w-10 shrink-0 rounded-md" />
      <Skeleton className="h-9 w-full max-w-[200px] rounded-md" />
      <Skeleton className="ml-auto h-9 w-28 shrink-0 rounded-md" />
      <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
    </div>
  );
}

export type SkeletonRow =
  | "half"
  | "wide"
  | "toggle"
  | "block"
  | "mode"
  | "segment";

/** Form page skeleton — follows the actual form layout structure
 *  (header, section + divider, grid field, footer actions) so there is no
 *  layout shift when content finishes loading. */
export function FormSkeleton({
  breadcrumb,
  sections,
  className,
}: {
  breadcrumb?: ReactNode;
  sections: SkeletonRow[][];
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-[680px]", className)} aria-hidden="true">
      {breadcrumb}
      <div className="mb-9 mt-3 space-y-2.5">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-3.5 w-64 max-w-full rounded" />
      </div>

      {sections.map((rows, si) => (
        <section key={si} className="pb-9">
          <div className="mb-5 flex items-center gap-4">
            <Skeleton className="h-3 w-28 rounded" />
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {rows.map((row, i) => {
              switch (row) {
                case "toggle":
                  return <SkeletonToggleRow key={i} className="sm:col-span-2" />;
                case "block":
                  return <Skeleton key={i} className="h-9 w-full rounded-md" />;
                case "mode":
                  return (
                    <div key={i} className="flex flex-col gap-3 sm:col-span-2">
                      <Skeleton className="h-32 w-full rounded-lg" />
                      <Skeleton className="h-32 w-full rounded-lg" />
                    </div>
                  );
                case "segment":
                  return <SkeletonSegmentRow key={i} className="sm:col-span-2" />;
                default:
                  return (
                    <SkeletonField
                      key={i}
                      className={row === "wide" ? "sm:col-span-2" : ""}
                    />
                  );
              }
            })}
          </div>
        </section>
      ))}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-5">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-28 rounded-md" />
      </div>
    </div>
  );
}