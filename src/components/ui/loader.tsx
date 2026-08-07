export function ShellLoader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
        <p className="text-sm text-zinc-400">Memuat workspace...</p>
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
          className="h-32 animate-pulse rounded-2xl bg-zinc-200/70"
        />
      ))}
    </div>
  );
}
