import { Skeleton } from "@/components/ui/skeleton";

export function ShellLoader() {
  return (
    <div className="min-h-[100dvh] bg-background px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-7" aria-hidden="true">
        <div className="space-y-2.5">
          <Skeleton className="h-3.5 w-24 rounded" />
          <Skeleton className="h-7 w-56 rounded-md" />
          <Skeleton className="h-3.5 w-72 max-w-full rounded" />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-3 w-32 rounded" />
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PanelSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-lg bg-muted"
        />
      ))}
    </div>
  );
}