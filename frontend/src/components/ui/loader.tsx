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

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-9 w-64 rounded-md" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[300px] w-full rounded-xl" />
    </div>
  );
}

export function TableSkeleton({
  columns = 6,
  filters = 2,
  showSearch = true,
  hasKpi = false,
  kpiCount = 0,
}: {
  columns?: number;
  filters?: number;
  showSearch?: boolean;
  hasKpi?: boolean;
  kpiCount?: number;
}) {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      {hasKpi && kpiCount > 0 && (
        <div className={`grid gap-4 ${kpiCount === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-3"}`}>
          {Array.from({ length: kpiCount }).map((_, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-5 space-y-3">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-7 w-24 rounded-md" />
              {kpiCount === 4 && <Skeleton className="h-1.5 w-full rounded-full" />}
            </div>
          ))}
        </div>
      )}
      <div className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          {showSearch && <Skeleton className="h-8 w-56 rounded-md" />}
          {Array.from({ length: filters }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-40 rounded-md" />
          ))}
        </div>
        <div className="px-3 py-2">
          <div className="space-y-2">
            <div className="flex gap-4 border-b border-border/70 px-4 py-2.5">
              {Array.from({ length: columns }).map((_, i) => (
                <Skeleton key={i} className="h-4 flex-1 rounded" />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-4 px-4 py-3">
                {Array.from({ length: columns }).map((_, j) => (
                  <Skeleton key={j} className="h-4 flex-1 rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Skeleton className="h-7 w-32 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function HubSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-12 w-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-3 w-48 rounded" />
            </div>
            <Skeleton className="h-4 w-4 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 6, hasTable = false, tableColumns = 5 }: { fields?: number; hasTable?: boolean; tableColumns?: number }) {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56 rounded-md" />
          <Skeleton className="h-4 w-96 max-w-full rounded" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: fields }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
        {hasTable && (
          <div className="rounded-md border border-border">
            <div className="flex gap-2 border-b px-3 py-2">
              {Array.from({ length: tableColumns }).map((_, i) => (
                <Skeleton key={i} className="h-4 flex-1 rounded" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-2 px-3 py-3">
                {Array.from({ length: tableColumns }).map((_, j) => (
                  <Skeleton key={j} className="h-8 flex-1 rounded-md" />
                ))}
              </div>
            ))}
          </div>
        )}
        {!hasTable && <Skeleton className="h-10 w-full rounded-md" />}
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <Skeleton className="h-8 w-64 rounded-md" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col animate-pulse">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 pb-12">
        <Skeleton className="h-14 w-14 rounded-full" />
        <div className="space-y-2 text-center">
          <Skeleton className="h-5 w-64 rounded-md mx-auto" />
          <Skeleton className="h-4 w-80 max-w-full rounded mx-auto" />
        </div>
        <div className="flex flex-wrap justify-center gap-2 max-w-lg">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-36 rounded-full" />
          ))}
        </div>
      </div>
      <div className="border-t px-4 py-3">
        <Skeleton className="h-20 w-full max-w-3xl mx-auto rounded-3xl" />
      </div>
    </div>
  );
}

export function TableWithKpiSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48 rounded-md" />
        <Skeleton className="h-4 w-72 rounded" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-md border border-border bg-card p-5 space-y-3">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        ))}
      </div>
      <div className="rounded-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <Skeleton className="h-8 w-56 rounded-md" />
          <Skeleton className="h-8 w-40 rounded-md" />
        </div>
        <div className="px-3 py-2 space-y-2">
          <div className="flex gap-4 border-b px-4 py-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1 rounded" />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-4 flex-1 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}