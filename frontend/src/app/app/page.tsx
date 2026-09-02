import { Responsive, WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  useActiveDashboardId,
  useDashboard,
  useDashboards,
  useDashboardWidgetsData,
} from "@/lib/api/use-dashboards";
import { WidgetRenderer } from "@/components/dashboard/widgets";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useActiveWorkspace } from "@/hooks/use-workspace";

const ResponsiveGridLayout = WidthProvider(Responsive);

export default function DashboardPage() {
  const { activeId: workspaceId } = useActiveWorkspace();
  const { dashboards, isLoading: listLoading } = useDashboards(workspaceId);
  const { activeId, setActiveId } = useActiveDashboardId(dashboards);
  const { data: dashboard, isLoading: dashLoading } = useDashboard(activeId ?? undefined);
  const { data: widgetsData, isLoading: widgetsLoading } = useDashboardWidgetsData(activeId ?? undefined);

  const workspacePending = workspaceId === undefined;
  if (workspacePending || listLoading || dashLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64 rounded-md" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const widgets = dashboard?.widgets ?? [];
  const hasWidgets = widgets.length > 0;
  // Data rows diambil via 1 GET /dashboards/:id/widgets/data (bukan N x POST)
  const dataWidgets = widgetsData?.widgets ?? [];
  // Mapping id -> rows untuk render, fallback ke widgets biasa jika data belum siap
  const dataById = new Map(dataWidgets.map((w) => [w.id, w]));

  return (
    <div className="space-y-6">
      {dashboards.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {dashboards.map((d) => (
            <button
              key={d.id}
              onClick={() => setActiveId(d.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                d.id === activeId
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {d.name}
              {d.isGlobal && (
                <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-70">
                  global
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {widgets.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Dashboard ini belum memiliki widget. Admin dapat menyusunnya lewat menu
          Konfigurasi Dashboard.
        </p>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: widgets.map((w) => ({ i: w.id, ...w.layout })) }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={30}
          margin={[16, 16]}
          isDraggable={false}
          isResizable={false}
        >
          {widgets.map((w) => {
            const dw = dataById.get(w.id);
            // Selama widgetsData loading, suppress fetch per-widget — tampilkan skeleton
            const isLoading = hasWidgets && widgetsLoading && !dw;
            const dataProp = dw ? { rows: dw.rows } : hasWidgets && widgetsLoading ? { rows: [] } : undefined;
            // Jika batch data ada, pakai config lengkap dari server (dw.config) yang sudah di-expand dari templateId
            const widgetEffective = dw?.config
              ? ({ ...w, type: dw.type as typeof w.type, config: dw.config as unknown as typeof w.config } as typeof w)
              : dw?.title
                ? ({ ...w, config: { ...(w.config as object), title: dw.title } as unknown as typeof w.config } as typeof w)
                : w;
            const useFallback = !dw && !widgetsLoading;
            return (
              <div key={w.id}>
                <WidgetRenderer
                  widget={widgetEffective}
                  {...(useFallback ? {} : { data: dataProp, isLoading })}
                />
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}