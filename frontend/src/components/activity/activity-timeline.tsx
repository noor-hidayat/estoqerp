import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { timeAgo, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Clock, FilePlus, Edit, Send, Check, X, Ban, ArrowRightLeft, FileText } from "lucide-react";

type Activity = {
  id: string;
  publicId?: string | null;
  documentType: string;
  documentId: number;
  actorUserId: number | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  isBackfilled?: boolean;
};

function useActivities(documentType?: string, documentId?: string) {
  return useQuery({
    queryKey: ["activity-logs", documentType, documentId],
    queryFn: () => api.get<Activity[]>(`/activity-logs?documentType=${documentType}&documentId=${documentId}`),
    enabled: !!documentType && !!documentId,
    staleTime: 30_000,
  });
}

const ACTION_META: Record<string, { label: string; icon: any; dot: string }> = {
  create: { label: "Dibuat", icon: FilePlus, dot: "bg-primary" },
  update: { label: "Diperbarui", icon: Edit, dot: "bg-zinc-400" },
  post: { label: "Diposting", icon: Send, dot: "bg-amber-500" },
  submit: { label: "Disubmit", icon: Send, dot: "bg-amber-500" },
  approve: { label: "Disetujui", icon: Check, dot: "bg-emerald-500" },
  reject: { label: "Ditolak", icon: X, dot: "bg-red-500" },
  cancel: { label: "Dibatalkan", icon: Ban, dot: "bg-zinc-400" },
  convert: { label: "Dikonversi", icon: ArrowRightLeft, dot: "bg-violet-500" },
  prepare: { label: "Disiapkan", icon: FileText, dot: "bg-sky-500" },
  complete: { label: "Selesai", icon: Check, dot: "bg-emerald-600" },
};

function Dot({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, icon: Clock, dot: "bg-zinc-300" };
  const Icon = meta.icon;
  return (
    <div className={cn("flex size-7 items-center justify-center rounded-full border-2 border-background shadow-sm", meta.dot)}>
      <Icon size={12} className="text-white" strokeWidth={2.5} />
    </div>
  );
}

export function ActivityTimeline({ documentType, documentId }: { documentType: string; documentId: string }) {
  const { data: activities = [], isLoading } = useActivities(documentType, documentId);

  if (isLoading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">Memuat aktivitas…</div>;
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
        <Clock size={18} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Belum ada aktivitas</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="space-y-0">
        {activities.map((a, idx) => {
          const meta = ACTION_META[a.action] ?? { label: a.action, icon: Clock, dot: "bg-zinc-300" };
          const isLast = idx === activities.length - 1;
          return (
            <div key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
              {/* vertical line */}
              {!isLast && (
                <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
              )}
              <div className="relative z-10 shrink-0">
                <Dot action={a.action} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-medium text-foreground">{meta.label}</span>
                  {(a.fromStatus || a.toStatus) && (
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {a.fromStatus ? <span>{a.fromStatus}</span> : <span>—</span>}
                      <ArrowRightLeft size={10} className="opacity-60" />
                      <span className="text-foreground">{a.toStatus ?? "—"}</span>
                    </span>
                  )}
                  {a.isBackfilled && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      backfilled
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">{a.actorName ?? "System"}</span>
                  {a.actorRole && <span className="text-[11px]">• {a.actorRole}</span>}
                  <span className="text-[11px]">• {timeAgo(a.createdAt)}</span>
                  <span className="hidden sm:inline text-[11px] text-muted-foreground/70" title={formatDateTime(a.createdAt)}>
                    ({formatDateTime(a.createdAt)})
                  </span>
                </div>
                {a.comment && (
                  <div className="mt-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs leading-relaxed text-foreground">
                    {a.comment}
                  </div>
                )}
                {a.metadata && Object.keys(a.metadata).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {a.metadata.documentNo && (
                      <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {String((a.metadata as any).documentNo)}
                      </span>
                    )}
                    {(a.metadata as any).targetDocumentNo && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700 dark:bg-violet-900/20 dark:text-violet-300">
                        → {(a.metadata as any).targetType ?? "PO"} {(a.metadata as any).targetDocumentNo}
                      </span>
                    )}
                    {(a.metadata as any).level && (
                      <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                        L{(a.metadata as any).level}
                        {(a.metadata as any).total ? `/${(a.metadata as any).total}` : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="hidden sm:block shrink-0 pt-1 text-right">
                <span className="text-[11px] text-muted-foreground">{formatDateTime(a.createdAt).split(",")[1]?.trim() ?? ""}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { useActivities };
