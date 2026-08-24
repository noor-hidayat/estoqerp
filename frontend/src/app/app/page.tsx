"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Maximize2, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useDashboard } from "@/lib/api/query";
import { useDashboardLayout } from "@/lib/api/use-dashboard-layout";
import { cn } from "@/lib/utils";
import {
  WIDGETS,
  DEFAULT_LAYOUT,
  type WidgetId,
  type DashboardData,
} from "@/components/dashboard/widgets";

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex items-center justify-end">
        <Skeleton className="h-8 w-44 rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[1.7fr_1fr]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}

function SortableWidget({
  id,
  span,
  onResizePreview,
  onResizeCommit,
  render,
}: {
  id: string;
  span: number;
  onResizePreview: (id: string, span: number) => void;
  onResizeCommit: (id: string, span: number) => void;
  render: (dragHandle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    gridColumn: `span ${span}`,
  };

  const dragHandle = (
    <button
      type="button"
      aria-label="Drag to reorder"
      className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical size={15} strokeWidth={2} />
    </button>
  );

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const grid = (e.currentTarget as HTMLElement).closest(
      "[data-grid]"
    ) as HTMLElement | null;
    if (!grid) return;
    const cs = getComputedStyle(grid);
    const cols = cs.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const gap = parseFloat(cs.columnGap || "0") || 0;
    const rect = grid.getBoundingClientRect();
    const colWidth = (rect.width - (cols - 1) * gap) / cols;
    const startX = e.clientX;
    const startSpan = span;
    let current = startSpan;

    const onMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      let ns = startSpan + Math.round((delta + colWidth / 2) / colWidth);
      ns = Math.max(1, Math.min(cols, ns));
      if (ns !== current) {
        current = ns;
        onResizePreview(id, ns);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
      onResizeCommit(id, current);
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const resizeHandle = (
    <button
      type="button"
      aria-label="Resize widget"
      onPointerDown={startResize}
      className="absolute bottom-2 right-2 inline-flex size-6 cursor-se-resize items-center justify-center rounded-md text-muted-foreground/50 hover:bg-muted hover:text-foreground"
    >
      <Maximize2 size={13} strokeWidth={2} />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-70", "relative")}
    >
      {render(dragHandle)}
      {resizeHandle}
    </div>
  );
}

export default function DashboardPage() {
  const { data: dashboard, isLoading, isError } = useDashboard();
  const { layout, isLoading: layoutLoading, save } = useDashboardLayout();
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const savedOrder = (layout?.order ?? DEFAULT_LAYOUT.order) as WidgetId[];
  const savedHidden = new Set<WidgetId>(
    (layout?.hidden ?? DEFAULT_LAYOUT.hidden) as WidgetId[]
  );

  const order = useMemo(() => {
    const known = savedOrder.filter((id) => id in WIDGETS);
    const missing = (Object.keys(WIDGETS) as WidgetId[]).filter(
      (id) => !known.includes(id)
    );
    return [...known, ...missing];
  }, [savedOrder]);

  const hidden = savedHidden;

  const [liveSpans, setLiveSpans] = useState<Record<string, number>>({});
  const spans = { ...(layout?.spans ?? {}), ...liveSpans } as Record<string, number>;

  function previewSpan(id: string, ns: number) {
    setLiveSpans((p) => ({ ...p, [id]: ns }));
  }
  function commitSpan(id: string, ns: number) {
    setLiveSpans((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
    save({
      order,
      hidden: [...hidden],
      spans: { ...(layout?.spans ?? {}), [id]: ns },
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (isLoading || layoutLoading) return <DashboardSkeleton />;

  if (isError || !dashboard) {
    return (
      <Card className="flex min-h-[50vh] flex-col items-center justify-center p-14 text-center">
        <p className="text-lg font-semibold text-foreground">
          Dashboard could not be loaded
        </p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Your role may not have access to this page.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/app/so">Open Projects</Link>
        </Button>
      </Card>
    );
  }

  const visible = order.filter((id) => !hidden.has(id));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as WidgetId);
    const newIndex = order.indexOf(over.id as WidgetId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    save({ order: next, hidden: [...hidden], spans: { ...(layout?.spans ?? {}), ...liveSpans } });
  }

  function toggleHidden(id: WidgetId) {
    const nextHidden = new Set(hidden);
    if (nextHidden.has(id)) nextHidden.delete(id);
    else nextHidden.add(id);
    save({ order, hidden: [...nextHidden], spans: { ...(layout?.spans ?? {}), ...liveSpans } });
  }

  function resetLayout() {
    save({ order: DEFAULT_LAYOUT.order, hidden: DEFAULT_LAYOUT.hidden });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => setCustomizeOpen(true)}>
          <SlidersHorizontal size={14} strokeWidth={2} />
          Customize
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={visible} strategy={rectSortingStrategy}>
          <div data-grid className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
            {visible.map((id) => {
              const W = WIDGETS[id];
              return (
                <SortableWidget
                  key={id}
                  id={id}
                  span={spans[id] ?? W.defaultSpan}
                  onResizePreview={previewSpan}
                  onResizeCommit={commitSpan}
                  render={(dh) => <W.Component data={dashboard as DashboardData} dragHandle={dh} />}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <SheetContent side="right" className="w-[360px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle>Customize Dashboard</SheetTitle>
            <SheetDescription>
              Atur urutan &amp; widget yang ditampilkan. Tersimpan otomatis.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-2">
            {(Object.keys(WIDGETS) as WidgetId[]).map((id) => {
              const w = WIDGETS[id];
              const isHidden = hidden.has(id);
              return (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5"
                >
                  <span className="text-sm font-medium">{w.title}</span>
                  <Switch
                    checked={!isHidden}
                    onCheckedChange={() => toggleHidden(id)}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-6">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={resetLayout}
            >
              Reset to default
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
