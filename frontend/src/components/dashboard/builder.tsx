import { useMemo, useRef, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Check, GripVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWidgetMutations, useDashboard } from "@/lib/api/use-dashboards";
import { WidgetRenderer } from "@/components/dashboard/widgets";
import { type WidgetInstance } from "@/components/dashboard/types";
import { WIDGET_TEMPLATES, templatesForWorkspace } from "@/components/dashboard/widget-registry";
import { cn } from "@/lib/utils";

const ResponsiveGridLayout = WidthProvider(Responsive);

export function DashboardBuilder({
  dashboardId,
  widgets: initialWidgets,
}: {
  dashboardId: string;
  widgets: WidgetInstance[];
}) {
  const { data: dashboard } = useDashboard(dashboardId);
  const workspaceId = dashboard?.workspaceId ?? null;
  const available = useMemo(() => templatesForWorkspace(workspaceId), [workspaceId]);

  const [items, setItems] = useState<WidgetInstance[]>(initialWidgets);
  const originalRef = useRef<WidgetInstance[]>(initialWidgets);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>({});

  const mutations = useWidgetMutations(dashboardId);

  function syncLayout(layout: Layout[]) {
    setItems((ws) =>
      ws.map((w) => {
        const l = layout.find((x) => x.i === w.id);
        return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
      })
    );
  }

  function openAdd() {
    // pre-select already added templates
    const existingTemplateIds = new Set(
      items
        .map((w) => (w.config as unknown as Record<string, unknown>)?.templateId as string | undefined)
        .filter(Boolean) as string[]
    );
    // keep overrides for existing
    const overrides: Record<string, string> = {};
    for (const w of items) {
      const cfg = w.config as unknown as Record<string, unknown>;
      if (cfg?.templateId && cfg?.title) overrides[cfg.templateId as string] = String(cfg.title);
    }
    setTitleOverrides(overrides);
    setSelectedIds(new Set(existingTemplateIds));
    setAddOpen(true);
  }

  function toggleTemplate(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commitSelection() {
    // Build new items from selectedIds
    const existingByTemplate = new Map<string, WidgetInstance>();
    for (const w of items) {
      const tid = (w.config as unknown as Record<string, unknown>)?.templateId as string | undefined;
      if (tid) existingByTemplate.set(tid, w);
    }
    const nextItems: WidgetInstance[] = [];
    let yCursor = 0;
    for (const tpl of WIDGET_TEMPLATES) {
      if (!selectedIds.has(tpl.id)) continue;
      if (!available.some((a) => a.id === tpl.id)) continue; // workspace filter
      const existing = existingByTemplate.get(tpl.id);
      if (existing) {
        const title = titleOverrides[tpl.id]?.trim();
        const newConfig: Record<string, unknown> = { templateId: tpl.id, ...(title ? { title } : {}) };
        nextItems.push({ ...existing, config: newConfig as unknown as WidgetInstance["config"] });
        yCursor = Math.max(yCursor, existing.layout.y + existing.layout.h);
      } else {
        const title = titleOverrides[tpl.id]?.trim();
        const cfg: Record<string, unknown> = { templateId: tpl.id, ...(title ? { title } : {}) };
        const size = tpl.defaultLayout;
        nextItems.push({
          id: `tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}_${tpl.id}`,
          type: tpl.type,
          config: cfg as unknown as WidgetInstance["config"],
          layout: { x: 0, y: yCursor, w: size.w, h: size.h },
        });
        yCursor += size.h;
      }
    }
    // Include legacy widgets that are not template-based? Keep them as is
    for (const w of items) {
      const tid = (w.config as unknown as Record<string, unknown>)?.templateId as string | undefined;
      if (!tid) nextItems.push(w);
    }
    setItems(nextItems);
    setAddOpen(false);
  }

  function removeWidget(id: string) {
    setItems((ws) => ws.filter((w) => w.id !== id));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const original = new Map(originalRef.current.map((w) => [w.id, w]));
      const current = new Map(items.map((w) => [w.id, w]));

      for (const [id] of original) {
        if (!current.has(id)) {
          await mutations.deleteWidget.mutateAsync(id);
        }
      }
      for (const w of items) {
        if (w.id.startsWith("tmp_")) {
          const cfg = w.config as unknown as Record<string, unknown>;
          const templateId = cfg?.templateId as string | undefined;
          if (templateId) {
            await mutations.addWidget.mutateAsync({
              templateId,
              title: (cfg?.title as string | undefined),
              layout: w.layout,
            } as unknown as never);
          } else {
            await mutations.addWidget.mutateAsync({
              type: w.type,
              config: w.config,
              layout: w.layout,
            } as unknown as never);
          }
        } else {
          const o = original.get(w.id);
          const newCfg = w.config as unknown as Record<string, unknown>;
          const oldCfg = o?.config as unknown as Record<string, unknown> | undefined;
          if (!o || JSON.stringify(oldCfg) !== JSON.stringify(newCfg) || o.type !== w.type) {
            const tid = newCfg?.templateId as string | undefined;
            if (tid) {
              await mutations.updateWidget.mutateAsync({
                widgetId: w.id,
                patch: { templateId: tid, title: newCfg?.title as string | undefined },
              } as unknown as never);
            } else {
              await mutations.updateWidget.mutateAsync({
                widgetId: w.id,
                patch: { type: w.type, config: w.config },
              } as unknown as never);
            }
          }
        }
      }
      const layouts = items
        .filter((w) => !w.id.startsWith("tmp_"))
        .map((w) => ({ id: w.id, layout: w.layout }));
      if (layouts.length) await mutations.saveLayout.mutateAsync(layouts);
      originalRef.current = items.filter((w) => !w.id.startsWith("tmp_"));
    } finally {
      setSaving(false);
    }
  }

  const layout: Layout[] = items.map((w) => ({ i: w.id, ...w.layout }));
  const grouped = useMemo(() => {
    const g: Record<string, typeof available> = {};
    for (const tpl of available) {
      const key = tpl.workspaceId;
      if (!g[key]) g[key] = [];
      g[key].push(tpl);
    }
    return g;
  }, [available]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={openAdd}>
          <Plus size={14} strokeWidth={2} />
          Pilih Widget
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Menyimpan…" : "Save"}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Belum ada widget. Klik “Pilih Widget” untuk menampilkan widget jadi sesuai workspace.
        </p>
      ) : (
        <ResponsiveGridLayout
          className="layout"
          layouts={{ lg: layout, md: layout, sm: layout }}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 12, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={30}
          margin={[16, 16]}
          draggableHandle=".widget-drag"
          onLayoutChange={syncLayout}
          isBounded={false}
        >
          {items.map((w) => (
            <div key={w.id} className="relative">
              <button
                type="button"
                aria-label="Drag"
                className="widget-drag absolute left-1.5 top-1.5 z-20 inline-flex size-7 cursor-grab touch-none items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:bg-muted active:cursor-grabbing"
              >
                <GripVertical size={15} strokeWidth={2} />
              </button>
              <div className="absolute right-1.5 top-1.5 z-20 flex gap-1">
                <button
                  type="button"
                  aria-label="Remove"
                  onClick={() => removeWidget(w.id)}
                  className="inline-flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
              <WidgetRenderer widget={w} />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Pilih Widget</DialogTitle>
            <DialogDescription>
              Centang widget jadi sesuai workspace <span className="font-medium">{workspaceId ?? "global"}</span>. Dashboard sekarang tinggal pilih, tidak perlu setting factTable manual.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto space-y-6 pr-1">
            {Object.entries(grouped).map(([wsId, tpls]) => (
              <div key={wsId} className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {wsId === "wsp-warehouse" ? "Warehouse" : wsId === "wsp-purchasing" ? "Purchasing" : wsId === "wsp-marketing" ? "Marketing" : wsId}
                </h4>
                <div className="grid gap-2">
                  {tpls.map((tpl) => {
                    const checked = selectedIds.has(tpl.id);
                    return (
                      <label
                        key={tpl.id}
                        className={cn(
                          "flex gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                          checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleTemplate(tpl.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{tpl.title}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{tpl.type}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                          {checked && (
                            <div className="mt-2">
                              <Label className="text-xs">Judul custom (opsional)</Label>
                              <Input
                                className="mt-1 h-8"
                                placeholder={tpl.title}
                                value={titleOverrides[tpl.id] ?? ""}
                                onChange={(e) => setTitleOverrides((prev) => ({ ...prev, [tpl.id]: e.target.value }))}
                              />
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">Tidak ada template untuk workspace ini.</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button onClick={commitSelection}>
              Terapkan <Check size={14} strokeWidth={2} className="ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
