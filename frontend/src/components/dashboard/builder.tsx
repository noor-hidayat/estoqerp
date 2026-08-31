import { useMemo, useRef, useState } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { Check, GripVertical, Pencil, Plus, X } from "lucide-react";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useDashboardMeta, useWarehouses } from "@/lib/api/query";
import { useWidgetMutations } from "@/lib/api/use-dashboards";
import { WidgetRenderer } from "@/components/dashboard/widgets";
import {
  dimLabel,
  type Aggregation,
  type WidgetConfig,
  type WidgetInstance,
  type WidgetType,
} from "@/components/dashboard/types";
import { cn } from "@/lib/utils";

const ResponsiveGridLayout = WidthProvider(Responsive);

const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  kpi: { w: 3, h: 4 },
  bar: { w: 6, h: 8 },
  line: { w: 6, h: 8 },
  pie: { w: 4, h: 8 },
  table: { w: 6, h: 8 },
};

const TYPE_LABELS: Record<WidgetType, string> = {
  kpi: "KPI (Angka Tunggal)",
  bar: "Bar Chart",
  line: "Line Chart",
  pie: "Pie Chart",
  table: "Tabel",
};

interface DraftConfig {
  type: WidgetType;
  title: string;
  factTable: string;
  measures: { field: string; aggregation: Aggregation }[];
  groupBy: string[];
  dateFrom: string;
  dateTo: string;
  warehouseIds: string[];
}

const EMPTY_DRAFT: DraftConfig = {
  type: "bar",
  title: "",
  factTable: "",
  measures: [],
  groupBy: [],
  dateFrom: "",
  dateTo: "",
  warehouseIds: [],
};

export function DashboardBuilder({
  dashboardId,
  widgets: initialWidgets,
}: {
  dashboardId: string;
  widgets: WidgetInstance[];
}) {
  const [items, setItems] = useState<WidgetInstance[]>(initialWidgets);
  const originalRef = useRef<WidgetInstance[]>(initialWidgets);
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftConfig>(EMPTY_DRAFT);
  const [step, setStep] = useState(0);

  const { data: meta } = useDashboardMeta();
  const { data: warehouses } = useWarehouses();
  const mutations = useWidgetMutations(dashboardId);

  const fact = useMemo(
    () => meta?.factTables.find((f) => f.key === draft.factTable),
    [meta, draft.factTable]
  );

  function syncLayout(layout: Layout[]) {
    setItems((ws) =>
      ws.map((w) => {
        const l = layout.find((x) => x.i === w.id);
        return l ? { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } } : w;
      })
    );
  }

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setStep(0);
    setEditingId(null);
  }

  function openAdd() {
    resetDraft();
    setAddOpen(true);
  }

  function openEdit(w: WidgetInstance) {
    setEditingId(w.id);
    setDraft({
      type: w.type,
      title: w.config.title ?? "",
      factTable: w.config.factTable,
      measures: w.config.measures.map((m) => ({ field: m.field, aggregation: m.aggregation })),
      groupBy: w.config.groupBy,
      dateFrom: w.config.filters?.dateRange?.[0] ?? "",
      dateTo: w.config.filters?.dateRange?.[1] ?? "",
      warehouseIds: w.config.filters?.warehouseId ?? [],
    });
    setStep(0);
    setAddOpen(true);
  }

  function buildConfig(): WidgetConfig {
    const filters: WidgetConfig["filters"] = {};
    if (draft.dateFrom && draft.dateTo) filters.dateRange = [draft.dateFrom, draft.dateTo];
    if (draft.warehouseIds.length) filters.warehouseId = draft.warehouseIds;
    return {
      factTable: draft.factTable,
      measures: draft.measures,
      groupBy: draft.groupBy,
      filters,
      title: draft.title.trim() || undefined,
    };
  }

  function commitWidget() {
    const config = buildConfig();
    if (editingId) {
      setItems((ws) =>
        ws.map((w) => (w.id === editingId ? { ...w, type: draft.type, config } : w))
      );
    } else {
      const nextY = items.reduce((m, w) => Math.max(m, w.layout.y + w.layout.h), 0);
      const size = DEFAULT_SIZE[draft.type];
      const inst: WidgetInstance = {
        id: `tmp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        type: draft.type,
        config,
        layout: { x: 0, y: nextY, w: size.w, h: size.h },
      };
      setItems((ws) => [...ws, inst]);
    }
    setAddOpen(false);
    resetDraft();
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
          await mutations.addWidget.mutateAsync({
            type: w.type,
            config: w.config,
            layout: w.layout,
          });
        } else {
          const o = original.get(w.id);
          if (!o || JSON.stringify(o.config) !== JSON.stringify(w.config)) {
            await mutations.updateWidget.mutateAsync({
              widgetId: w.id,
              patch: { type: w.type, config: w.config },
            });
          }
        }
      }
      const layouts = items
        .filter((w) => !w.id.startsWith("tmp_"))
        .map((w) => ({ id: w.id, layout: w.layout }));
      await mutations.saveLayout.mutateAsync(layouts);
    } finally {
      setSaving(false);
    }
  }

  const layout: Layout[] = items.map((w) => ({ i: w.id, ...w.layout }));
  const canCommit =
    draft.factTable !== "" && draft.measures.length > 0 && !!meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={openAdd}>
          <Plus size={14} strokeWidth={2} />
          Add Widget
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Menyimpan…" : "Save"}
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          Belum ada widget. Klik “Add Widget” untuk menyusun dashboard.
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
                  aria-label="Edit"
                  onClick={() => openEdit(w)}
                  className="inline-flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground hover:bg-muted"
                >
                  <Pencil size={12} strokeWidth={2} />
                </button>
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

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetDraft(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Widget" : "Add Widget"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Ubah konfigurasi widget." : "Susun widget dari data stok."}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-1 text-xs">
            {["Tipe", "Tabel", "Measure", "Group By", "Filter"].map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(i)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium",
                  step === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}
              >
                {i + 1}. {label}
              </button>
            ))}
          </div>

          <div className="max-h-[55vh] space-y-3 overflow-auto pr-1">
            {step === 0 && (
              <div className="space-y-2">
                <Label>Tipe Visualisasi</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TYPE_LABELS) as WidgetType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, type: t }))}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm font-medium",
                        draft.type === t
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      {TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <Label>Fact Table</Label>
                <NativeSelect
                  value={draft.factTable}
                  onChange={(e) => setDraft((d) => ({ ...d, factTable: e.target.value, measures: [], groupBy: [] }))}
                >
                  <NativeSelectOption value="">— pilih —</NativeSelectOption>
                  {meta?.factTables.map((f) => (
                    <NativeSelectOption key={f.key} value={f.key}>
                      {f.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-2">
                <Label>Measure (minimal 1)</Label>
                {!fact && <p className="text-sm text-muted-foreground">Pilih fact table dulu.</p>}
                {fact?.measures.map((m) => {
                  const selected = draft.measures.find((x) => x.field === m);
                  return (
                    <div key={m} className="flex items-center gap-2 rounded-md border p-2">
                      <Checkbox
                        checked={!!selected}
                        onCheckedChange={(c) =>
                          setDraft((d) => ({
                            ...d,
                            measures: c
                              ? [
                                  ...d.measures.filter((x) => x.field !== m),
                                  { field: m, aggregation: "sum" as Aggregation },
                                ]
                              : d.measures.filter((x) => x.field !== m),
                          }))
                        }
                      />
                      <span className="flex-1 text-sm font-medium">{m}</span>
                      {selected && (
                        <NativeSelect
                          className="w-28"
                          value={selected.aggregation}
                          onChange={(e) =>
                            setDraft((d) => ({
                              ...d,
                              measures: d.measures.map((x) =>
                                x.field === m ? { ...x, aggregation: e.target.value as Aggregation } : x
                              ),
                            }))
                          }
                        >
                          {(meta?.aggregations ?? ["sum", "count", "avg", "min", "max"]).map((a) => (
                            <NativeSelectOption key={a} value={a}>
                              {a}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {step === 3 && (
              <div className="space-y-2">
                <Label>Group By (opsional)</Label>
                {!fact && <p className="text-sm text-muted-foreground">Pilih fact table dulu.</p>}
                {fact?.dims.map((dim) => (
                  <label key={dim} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Checkbox
                      checked={draft.groupBy.includes(dim)}
                      onCheckedChange={(c) =>
                        setDraft((d) => ({
                          ...d,
                          groupBy: c
                            ? [...d.groupBy, dim]
                            : d.groupBy.filter((x) => x !== dim),
                        }))
                      }
                    />
                    {dimLabel(dim)}
                  </label>
                ))}
                <p className="pt-1 text-xs font-medium text-muted-foreground">Berdasarkan Waktu</p>
                {(meta?.periodGrains ?? ["day", "week", "month"]).map((g) => (
                  <label key={g} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Checkbox
                      checked={draft.groupBy.includes(g)}
                      onCheckedChange={(c) =>
                        setDraft((d) => ({
                          ...d,
                          groupBy: c
                            ? [...d.groupBy, g]
                            : d.groupBy.filter((x) => x !== g),
                        }))
                      }
                    />
                    Tanggal · {g === "day" ? "Hari" : g === "week" ? "Minggu" : "Bulan"}
                  </label>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="space-y-3">
                <Label>Filter (opsional)</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Dari</Label>
                    <Input type="date" value={draft.dateFrom} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Sampai</Label>
                    <Input type="date" value={draft.dateTo} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Warehouse</Label>
                  <div className="mt-1 max-h-40 space-y-1 overflow-auto rounded-md border p-2">
                    {(warehouses ?? []).map((wh) => (
                      <label key={wh.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={draft.warehouseIds.includes(wh.id)}
                          onCheckedChange={(c) =>
                            setDraft((d) => ({
                              ...d,
                              warehouseIds: c
                                ? [...d.warehouseIds, wh.id]
                                : d.warehouseIds.filter((x) => x !== wh.id),
                            }))
                          }
                        />
                        {wh.name}
                      </label>
                    ))}
                    {(warehouses ?? []).length === 0 && (
                      <p className="text-xs text-muted-foreground">Memuat warehouse…</p>
                    )}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Judul (opsional)</Label>
                  <Input
                    value={draft.title}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder="Nama widget"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              Kembali
            </Button>
            {step < 4 ? (
              <Button onClick={() => setStep((s) => Math.min(4, s + 1))}>Lanjut</Button>
            ) : (
              <Button onClick={commitWidget} disabled={!canCommit}>
                {editingId ? "Simpan" : "Tambah"}
                {!editingId && <Check size={14} strokeWidth={2} className="ml-1" />}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}