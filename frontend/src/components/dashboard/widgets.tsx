import * as React from "react";
import { type ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCompact, formatNumber } from "@/lib/utils";
import { useWidgetQuery } from "@/lib/api/query";
import {
  dimLabel,
  type WidgetConfig,
  type WidgetInstance,
  type WidgetRow,
  type WidgetType,
} from "@/components/dashboard/types";

export const WIDGET_TYPE_OPTIONS: { type: WidgetType; label: string }[] = [
  { type: "kpi", label: "KPI (Angka Tunggal)" },
  { type: "bar", label: "Bar Chart" },
  { type: "line", label: "Line Chart" },
  { type: "pie", label: "Pie Chart" },
  { type: "table", label: "Tabel" },
];

function measureAlias(m: { field: string; aggregation: string; alias?: string }) {
  return m.alias || `${m.field}_${m.aggregation}`;
}

function labelKeyOf(config: WidgetConfig): string | null {
  return (config as unknown as { groupBy?: string[] })?.groupBy?.[0] ?? null;
}

function valueKeyOf(config: WidgetConfig): string {
  const m = (config as unknown as { measures?: { field: string; aggregation: string; alias?: string }[] })?.measures?.[0];
  if (!m) return "value";
  return measureAlias(m);
}

function toChartRows(rows: WidgetRow[], labelKey: string | null, valueKey: string) {
  return rows.map((r) => ({
    name: labelKey ? String(r[labelKey] ?? "?") : "Nilai",
    value: Number(r[valueKey] ?? 0),
  }));
}

function EmptyState() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada data.</p>
  );
}

// ---------------------------------------------------------------------------
// KPI
// ---------------------------------------------------------------------------

function KpiWidget({ widget, dragHandle, data: presetData, isLoading: presetLoading }: WidgetProps) {
  const { data: queryData, isLoading: queryLoading } = useWidgetQuery(
    presetData ? undefined : widget.config
  );
  const data = presetData ?? queryData;
  const isLoading = presetData !== undefined ? !!presetLoading : queryLoading;
  const valueKey = valueKeyOf(widget.config);
  const raw = (data as unknown as { rows?: WidgetRow[] })?.rows?.[0]?.[valueKey];
  const isCurrency = /stockvalue/i.test(valueKey) || /stock\s*value/i.test(widget.config.title ?? "");
  const isPercent = /persentase\s*return/i.test(widget.config.title ?? "") || /returnPct|percent/i.test(valueKey) || /return_pct/i.test((widget.config as unknown as { factTable?: string })?.factTable ?? "");
  const formattedCompact = (() => {
    if (raw === undefined || raw === null) return "—";
    const num = Number(raw);
    if (!Number.isFinite(num)) return "—";
    if (isPercent) {
      const pct = Number(num.toFixed(2));
      const formatted = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(pct);
      return `${formatted}%`;
    }
    const compact = formatCompact(num);
    return isCurrency ? `Rp ${compact}` : compact;
  })();
  const value: ReactNode = formattedCompact;
  const fullTitle = (() => {
    if (raw === undefined || raw === null) return "";
    const num = Number(raw);
    if (!Number.isFinite(num)) return String(raw);
    if (isPercent) {
      const pct = Number(num.toFixed(2));
      const formatted = new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(pct);
      return `${formatted}%`;
    }
    return isCurrency ? `Rp ${formatNumber(num)}` : formatNumber(num);
  })();
  // percentChange & periodLabel dari backend (jika ada filter dateRange)
  const percentChange = (data as unknown as { percentChange?: number | null })?.percentChange ?? null;
  const periodLabel = (data as unknown as { periodLabel?: string | null })?.periodLabel ?? null;
  const isPositive = percentChange !== null && percentChange > 0;
  const isNegative = percentChange !== null && percentChange < 0;
  const isZero = percentChange !== null && percentChange === 0;
  return (
    <Card className="@container/card overflow-hidden">
      <CardHeader className="flex flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="truncate text-sm font-medium leading-tight" title={widget.config.title || ""}>
            {widget.config.title || "—"}
          </CardTitle>
          {dragHandle}
        </div>
        <p className="truncate text-2xl font-semibold tabular-nums leading-none @[250px]/card:text-[26px]" title={fullTitle}>
          {isLoading ? <Skeleton className="h-7 w-24" /> : value}
        </p>
        {percentChange !== null && !isLoading && (
          <div className="flex items-center gap-1 text-xs">
            <span
              className={
                isPositive
                  ? "inline-flex items-center gap-0.5 font-medium text-emerald-600"
                  : isNegative
                    ? "inline-flex items-center gap-0.5 font-medium text-red-600"
                    : "inline-flex items-center gap-0.5 font-medium text-muted-foreground"
              }
            >
              {isPositive ? <ArrowUp size={12} strokeWidth={2.5} /> : isNegative ? <ArrowDown size={12} strokeWidth={2.5} /> : <Minus size={12} strokeWidth={2} />}
              {isZero ? "0%" : `${isPositive ? "+" : ""}${percentChange.toFixed(1)}%`}
            </span>
            {periodLabel && <span className="truncate text-muted-foreground">{periodLabel}</span>}
          </div>
        )}
      </CardHeader>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CHARTS
// ---------------------------------------------------------------------------

function ChartShell({
  widget,
  dragHandle,
  children,
  loading,
  empty,
}: {
  widget: WidgetInstance;
  dragHandle?: ReactNode;
  children: ReactNode;
  loading: boolean;
  empty: boolean;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-medium tracking-tight">
          {widget.config.title || "Chart"}
        </CardTitle>
        {dragHandle}
      </CardHeader>
      <CardContent className="flex-1 p-4 pt-0">
        {loading ? (
          <div className="flex h-[280px] items-center justify-center">
            <Skeleton className="h-[260px] w-full rounded-lg" />
          </div>
        ) : empty ? (
          <EmptyState />
        ) : (
          <div className="h-[280px] w-full p-2">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BarWidget({ widget, dragHandle, data: presetData, isLoading: presetLoading }: WidgetProps) {
  const factTableBar = (widget.config as unknown as { factTable?: string })?.factTable;
  const isReceivingBar =
    (factTableBar === "purchase_vs_delivery" || factTableBar === "receiving_vs_delivery") &&
    Array.isArray((widget.config as unknown as { measures?: unknown[] })?.measures) &&
    ((widget.config as unknown as { measures: unknown[] }).measures.length > 1);
  const isReceiving = factTableBar === "receiving_vs_delivery";

  // Filter untuk Receiving vs Delivery bar vertikal (sama seperti line sebelumnya)
  const [granularity, setGranularity] = React.useState<string>(() => {
    const g = (widget.config as unknown as { groupBy?: string[] })?.groupBy?.[0];
    return g && ["day", "week", "month"].includes(g) ? g : "month";
  });
  const [period, setPeriod] = React.useState<string>("quarterly");
  const [customStart, setCustomStart] = React.useState<string>("");
  const [customEnd, setCustomEnd] = React.useState<string>("");

  const dateRange = React.useMemo((): [string, string] | null => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const endOfQuarter = new Date(startOfQuarter.getFullYear(), startOfQuarter.getMonth() + 3, 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    switch (period) {
      case "monthly":
        return [fmt(startOfMonth), fmt(endOfMonth)];
      case "quarterly":
        return [fmt(startOfQuarter), fmt(endOfQuarter)];
      case "yearly":
      case "annual":
        return [fmt(startOfYear), fmt(endOfYear)];
      case "custom":
        if (customStart && customEnd) return [customStart, customEnd];
        return null;
      default:
        return null;
    }
  }, [period, customStart, customEnd]);

  const dynamicConfigBar = React.useMemo(() => {
    if (!isReceivingBar) return null;
    const base = widget.config as unknown as { factTable: string; measures: unknown[]; groupBy: string[]; filters?: Record<string, unknown> };
    const filters: Record<string, unknown> = { ...(base.filters ?? {}) };
    if (dateRange) filters.dateRange = dateRange;
    else delete (filters as any).dateRange;
    return { factTable: base.factTable, measures: base.measures, groupBy: [granularity], filters };
  }, [isReceivingBar, widget.config, granularity, dateRange, period]);

  const { data: dynamicDataBar, isLoading: dynamicLoadingBar } = useWidgetQuery(
    isReceivingBar ? (dynamicConfigBar as unknown as import("@/components/dashboard/types").WidgetConfig) ?? undefined : undefined
  );
  const { data: queryData, isLoading: queryLoading } = useWidgetQuery(
    isReceivingBar ? undefined : presetData ? undefined : widget.config
  );

  // Special grouped vertical bar untuk Receiving vs Delivery
  if (isReceivingBar) {
    const data = dynamicDataBar;
    const isLoading = dynamicLoadingBar;
    const rows = (data as any)?.rows ?? [];
    const chartData = rows.map((r: any) => ({
      name: String(r.date ?? "?"),
      receiving: Number(r.receivingValue ?? r.purchaseValue ?? 0),
      delivery: Number(r.deliveryValue ?? 0),
    }));
    const chartConfig = (isReceiving
      ? {
          receiving: { label: "Receiving", color: "hsl(221 83% 53%)" },
          delivery: { label: "Delivery", color: "hsl(24 94% 53%)" },
        }
      : {
          purchase: { label: "Purchase", color: "hsl(221 83% 53%)" },
          delivery: { label: "Delivery", color: "hsl(24 94% 53%)" },
        }) as unknown as ChartConfig;
    return (
      <Card className="flex h-full flex-col overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2">
          <CardTitle className="text-base font-medium tracking-tight whitespace-nowrap">{widget.config.title || "Chart"}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm">
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>
            {period === "custom" && (
              <>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm" />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm" />
              </>
            )}
            {dragHandle}
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-4 pt-0">
          {isLoading ? (
            <div className="flex h-[280px] items-center justify-center">
              <Skeleton className="h-[260px] w-full rounded-lg" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-[300px] w-full p-1">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <BarChart data={chartData} margin={{ left: 16, right: 24, top: 12, bottom: 24 }} barGap={0} barCategoryGap="24%">
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="name" tickLine={false} tickMargin={12} axisLine={false} tick={{ fontSize: 11 }} interval={chartData.length > 12 ? Math.floor(chartData.length / 12) : 0} angle={chartData.length > 8 ? -18 : 0} textAnchor={chartData.length > 8 ? "end" : "middle"} height={chartData.length > 8 ? 60 : 32} />
                  <YAxis tick={{ fontSize: 11 }} width={56} tickMargin={8} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} />
                  <ChartTooltip cursor={{ fill: "hsl(var(--muted)/0.4)" }} content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey={isReceiving ? "receiving" : "purchase"} fill="hsl(221 83% 53%)" radius={0} name={isReceiving ? "Receiving" : "Purchase"} />
                  <Bar dataKey="delivery" fill="hsl(24 94% 53%)" radius={0} name="Delivery" />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const data = presetData ?? queryData;
  const isLoading = presetData !== undefined ? !!presetLoading : queryLoading;
  const rows = data?.rows ?? [];
  const labelKey = labelKeyOf(widget.config);
  const valueKey = valueKeyOf(widget.config);
  const chartData = toChartRows(rows, labelKey, valueKey);
  const chartConfig = { value: { label: widget.config.title || "Nilai" } } satisfies ChartConfig;
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
  const isHorizontalStockPerWarehouse =
    (widget.config as unknown as { factTable?: string })?.factTable === "stock_balances" &&
    ((widget.config as unknown as { groupBy?: string[] })?.groupBy?.[0] === "warehouse" ||
      widget.config.title === "Stock per Warehouse");
  const isTop10Return =
    widget.config.title === "Top 10 Most Returned Items" ||
    ((widget.config as unknown as { factTable?: string })?.factTable === "stock_movement_details" &&
      (widget.config as unknown as { filters?: Record<string, unknown> })?.filters !== undefined);
  const isHorizontal = isHorizontalStockPerWarehouse || isTop10Return;
  const isSingleColor = isTop10Return;
  if (isHorizontal) {
    // Stock per Warehouse: 1 baris utuh, spacing kiri-kanan ke batas card disamakan 1rem (16px) — Card px-3 (12) + chart margin 4 =16
    const yAxisWidth = isTop10Return ? 130 : 165;
    const yTickFormatter = (v: string) => {
      const s = String(v);
      if (isTop10Return) {
        if (s.length > 22) return `${s.slice(0, 20)}…`;
        return s;
      }
      // Warehouse: 1 baris utuh (longest 30 "Gudang Bahan Baku Tangerang ZG"), baru truncate jika >32
      if (s.length > 32) return `${s.slice(0, 30)}…`;
      return s;
    };
    return (
      <Card className="flex h-full flex-col overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium tracking-tight">{widget.config.title || "Chart"}</CardTitle>
          {dragHandle}
        </CardHeader>
        <CardContent className="flex-1 px-3 pt-0 pb-3">
          {isLoading ? (
            <div className="flex h-[280px] items-center justify-center">
              <Skeleton className="h-[240px] w-full rounded-lg" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <ChartContainer config={chartConfig} className="h-[280px] w-full">
              <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 4, top: 4, bottom: 4 }} barCategoryGap={isTop10Return ? "22%" : "30%"}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.6} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickMargin={6} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={yAxisWidth}
                  tickMargin={8}
                  interval={0}
                  tick={{ fontSize: isTop10Return ? 8 : 8.5, textAnchor: "end" as const, dominantBaseline: "middle" as const }}
                  tickFormatter={yTickFormatter}
                />
                <ChartTooltip cursor={{ fill: "hsl(var(--muted)/0.4)" }} content={<ChartTooltipContent />} />
                  <Bar dataKey="value" radius={0} barSize={isTop10Return ? 11 : 13}>
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={isSingleColor ? "hsl(221 83% 53%)" : palette[i % palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <ChartShell widget={widget} dragHandle={dragHandle} loading={isLoading} empty={rows.length === 0}>
      <ChartContainer config={chartConfig} className="h-full w-full">
        <BarChart data={chartData} margin={{ left: 12, right: 16, top: 12, bottom: 8 }} barCategoryGap="20%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="name"
            tickLine={false}
            tickMargin={12}
            axisLine={false}
            interval={0}
            angle={-18}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 10.5 }}
            tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
          />
          <YAxis tick={{ fontSize: 11 }} width={44} tickMargin={8} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v as unknown as number)} />
          <ChartTooltip cursor={{ fill: "hsl(var(--muted)/0.4)" }} content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={0} barSize={22}>
            {chartData.map((e, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartShell>
  );
}

function LineWidget({ widget, dragHandle, data: presetData, isLoading: presetLoading }: WidgetProps) {
  const factTable = (widget.config as unknown as { factTable?: string })?.factTable;
  const isMultiPurchaseDelivery =
    (factTable === "purchase_vs_delivery" || factTable === "receiving_vs_delivery") &&
    Array.isArray((widget.config as unknown as { measures?: unknown[] })?.measures) &&
    ((widget.config as unknown as { measures: unknown[] }).measures.length > 1);
  const isReceiving = factTable === "receiving_vs_delivery";
  const isStockLevelFg =
    (factTable === "stock_ledger" || factTable === "stock_balances") &&
    String(widget.config.title ?? "").toLowerCase().includes("stock level");

  // Filter 1: granularity Daily / Weekly / Monthly — Filter 2: Monthly / Quarterly / Yearly / Custom
  const [granularity, setGranularity] = React.useState<string>(() => {
    const g = (widget.config as unknown as { groupBy?: string[] })?.groupBy?.[0];
    return g && ["day", "week", "month"].includes(g) ? g : "month";
  });
  const [period, setPeriod] = React.useState<string>("quarterly");
  const [customStart, setCustomStart] = React.useState<string>("");
  const [customEnd, setCustomEnd] = React.useState<string>("");

  const dateRange = React.useMemo((): [string, string] | null => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    const endOfQuarter = new Date(startOfQuarter.getFullYear(), startOfQuarter.getMonth() + 3, 0);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    switch (period) {
      case "monthly":
        return [fmt(startOfMonth), fmt(endOfMonth)];
      case "quarterly":
        return [fmt(startOfQuarter), fmt(endOfQuarter)];
      case "yearly":
      case "annual":
        return [fmt(startOfYear), fmt(endOfYear)];
      case "custom":
        if (customStart && customEnd) return [customStart, customEnd];
        return null;
      default:
        return null;
    }
  }, [period, customStart, customEnd]);

  const dynamicConfig = React.useMemo(() => {
    if (!isMultiPurchaseDelivery) return null;
    const base = widget.config as unknown as { factTable: string; measures: unknown[]; groupBy: string[]; filters?: Record<string, unknown> };
    const filters: Record<string, unknown> = { ...(base.filters ?? {}) };
    if (dateRange) filters.dateRange = dateRange;
    else delete filters.dateRange;
    return { factTable: base.factTable, measures: base.measures, groupBy: [granularity], filters };
  }, [isMultiPurchaseDelivery, widget.config, granularity, dateRange, period]);

  const dynamicConfigStock = React.useMemo(() => {
    if (!isStockLevelFg) return null;
    const base = widget.config as unknown as { factTable: string; measures: unknown[]; groupBy: string[]; filters?: Record<string, unknown> };
    const filters: Record<string, unknown> = { ...(base.filters ?? {}), isFinishGood: true };
    if (dateRange) filters.dateRange = dateRange;
    else delete (filters as any).dateRange;
    return { factTable: base.factTable, measures: base.measures, groupBy: [granularity], filters };
  }, [isStockLevelFg, widget.config, granularity, dateRange, period]);

  const { data: dynamicData, isLoading: dynamicLoading } = useWidgetQuery(
    isMultiPurchaseDelivery ? (dynamicConfig as unknown as import("@/components/dashboard/types").WidgetConfig) ?? undefined : undefined
  );
  const { data: dynamicDataStock, isLoading: dynamicLoadingStock } = useWidgetQuery(
    isStockLevelFg ? (dynamicConfigStock as unknown as import("@/components/dashboard/types").WidgetConfig) ?? undefined : undefined
  );
  const useFilterable = isMultiPurchaseDelivery || isStockLevelFg;
  const { data: queryData, isLoading: queryLoading } = useWidgetQuery(
    useFilterable ? undefined : presetData ? undefined : widget.config
  );

  // Stock Level Trend (Finish Good) — closing stock per hari, 1 garis, filter sama seperti Receiving vs Delivery
  if (isStockLevelFg) {
    const data = dynamicDataStock;
    const isLoading = dynamicLoadingStock;
    const rows = (data as any)?.rows ?? [];
    const chartData = rows.map((r: any) => ({
      name: String(r.date ?? "?"),
      stock: Number(r.closingStock ?? (r as any).closingQty_sum ?? (r as any).value ?? 0),
    }));
    const chartConfig = {
      stock: { label: "Closing Stock", color: "hsl(142 76% 36%)" },
    } as unknown as ChartConfig;
    return (
      <Card className="flex h-full flex-col overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2">
          <CardTitle className="text-base font-medium tracking-tight whitespace-nowrap">{widget.config.title || "Chart"}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm">
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>
            {period === "custom" && (
              <>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm" />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm" />
              </>
            )}
            {dragHandle}
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-4 pt-0">
          {isLoading ? (
            <div className="flex h-[280px] items-center justify-center">
              <Skeleton className="h-[260px] w-full rounded-lg" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-[300px] w-full p-1">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart data={chartData} margin={{ left: 16, right: 24, top: 12, bottom: 24 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="name" tickLine={false} tickMargin={12} axisLine={false} tick={{ fontSize: 11 }} interval={chartData.length > 12 ? Math.floor(chartData.length / 12) : 0} angle={chartData.length > 8 ? -18 : 0} textAnchor={chartData.length > 8 ? "end" : "middle"} height={chartData.length > 8 ? 60 : 32} />
                  <YAxis tick={{ fontSize: 11 }} width={56} tickMargin={8} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} />
                  <ChartTooltip cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 4" }} content={<ChartTooltipContent indicator="line" />} />
                  <Line dataKey="stock" type="linear" stroke="hsl(142 76% 36%)" strokeWidth={2.5} dot={false} activeDot={false} name="Closing Stock" />
                </LineChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Untuk receiving_vs_delivery / purchase_vs_delivery pakai dynamic query, bukan preset dari dashboard
  if (isMultiPurchaseDelivery) {
    const data = dynamicData;
    const isLoading = dynamicLoading;
    const rows = (data as any)?.rows ?? [];
    const chartData = rows.map((r: any) => ({
      name: String(r.date ?? "?"),
      receiving: Number(r.receivingValue ?? r.purchaseValue ?? 0),
      delivery: Number(r.deliveryValue ?? 0),
    }));
    const chartConfig = (isReceiving
      ? {
          receiving: { label: "Receiving", color: "hsl(221 83% 53%)" },
          delivery: { label: "Delivery", color: "hsl(24 94% 53%)" },
        }
      : {
          purchase: { label: "Purchase", color: "hsl(221 83% 53%)" },
          delivery: { label: "Delivery", color: "hsl(24 94% 53%)" },
        }) as unknown as ChartConfig;
    const lineKeys = isReceiving ? (["receiving", "delivery"] as const) : (["purchase", "delivery"] as const);
    return (
      <Card className="flex h-full flex-col overflow-hidden border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 gap-2">
          <CardTitle className="text-base font-medium tracking-tight whitespace-nowrap">{widget.config.title || "Chart"}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <select value={granularity} onChange={(e) => setGranularity(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm">
              <option value="day">Daily</option>
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium shadow-sm">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
              <option value="custom">Custom</option>
            </select>
            {period === "custom" && (
              <>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm" />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-sm" />
              </>
            )}
            {dragHandle}
          </div>
        </CardHeader>
        <CardContent className="flex-1 p-4 pt-0">
          {isLoading ? (
            <div className="flex h-[280px] items-center justify-center">
              <Skeleton className="h-[260px] w-full rounded-lg" />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="h-[300px] w-full p-1">
              <ChartContainer config={chartConfig} className="h-full w-full">
                <LineChart data={chartData} margin={{ left: 16, right: 24, top: 12, bottom: 24 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="name" tickLine={false} tickMargin={12} axisLine={false} tick={{ fontSize: 11 }} interval={chartData.length > 12 ? Math.floor(chartData.length / 12) : 0} angle={chartData.length > 8 ? -18 : 0} textAnchor={chartData.length > 8 ? "end" : "middle"} height={chartData.length > 8 ? 60 : 32} />
                  <YAxis tick={{ fontSize: 11 }} width={56} tickMargin={8} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatCompact(v)} />
                  <ChartTooltip cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 4" }} content={<ChartTooltipContent indicator="line" />} />
                  <Line dataKey={isReceiving ? "receiving" : "purchase"} type="linear" stroke="hsl(221 83% 53%)" strokeWidth={2.5} dot={false} activeDot={false} name={isReceiving ? "Receiving" : "Purchase"} />
                  <Line dataKey="delivery" type="linear" stroke="hsl(24 94% 53%)" strokeWidth={2.5} dot={false} activeDot={false} name="Delivery" />
                </LineChart>
              </ChartContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  const data = presetData ?? queryData;
  const isLoading = presetData !== undefined ? !!presetLoading : queryLoading;
  const rows = data?.rows ?? [];
  const labelKey = labelKeyOf(widget.config);
  const valueKey = valueKeyOf(widget.config);
  const chartData = toChartRows(rows, labelKey, valueKey);
  const chartConfig = { value: { label: widget.config.title || "Nilai" } } satisfies ChartConfig;
  return (
    <ChartShell widget={widget} dragHandle={dragHandle} loading={isLoading} empty={rows.length === 0}>
      <ChartContainer config={chartConfig} className="h-[260px] w-full">
        <LineChart data={chartData} margin={{ left: 4, right: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="name" tickLine={false} tickMargin={8} axisLine={false} tick={{ fontSize: 10.5 }} />
          <YAxis tick={{ fontSize: 10.5 }} width={36} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Line dataKey="value" type="linear" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
        </LineChart>
      </ChartContainer>
    </ChartShell>
  );
}

function PieWidget({ widget, dragHandle, data: presetData, isLoading: presetLoading }: WidgetProps) {
  const { data: queryData, isLoading: queryLoading } = useWidgetQuery(
    presetData ? undefined : widget.config
  );
  const data = presetData ?? queryData;
  const isLoading = presetData !== undefined ? !!presetLoading : queryLoading;
  const rows = data?.rows ?? [];
  const labelKey = labelKeyOf(widget.config);
  const valueKey = valueKeyOf(widget.config);
  const chartData = toChartRows(rows, labelKey, valueKey);
  const total = chartData.reduce((acc, cur) => acc + cur.value, 0);
  const chartConfig = Object.fromEntries(
    chartData.map((r) => [r.name, { label: r.name }])
  ) satisfies ChartConfig;
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];
  // Custom label luar donat dengan garis tipis: warna di kanan → garis → "Bahan Baku" + "50%" di bawahnya
  const renderOutsideLabel = (props: any) => {
    const { cx, cy, midAngle, outerRadius, percent, name, fill } = props;
    const RADIAN = Math.PI / 180;
    const radius = (outerRadius ?? 92) + 18;
    const x = (cx ?? 0) + radius * Math.cos(-(midAngle ?? 0) * RADIAN);
    const y = (cy ?? 0) + radius * Math.sin(-(midAngle ?? 0) * RADIAN);
    const pct = ((percent ?? 0) * 100).toFixed(1);
    const isRight = x > (cx ?? 0);
    // sembunyikan label sangat kecil biar tidak mepet
    if ((percent ?? 0) < 0.03) return null;
    return (
      <text
        x={x}
        y={y}
        fill="hsl(var(--foreground))"
        textAnchor={isRight ? "start" : "end"}
        dominantBaseline="central"
        fontSize={10}
        fontWeight={500}
      >
        <tspan x={x} dy="-2" fill={fill ?? "hsl(var(--foreground))"}>
          {name}
        </tspan>
        <tspan x={x} dy="11" fontSize={9} fill="hsl(var(--muted-foreground))" fontWeight={600}>
          {pct}%
        </tspan>
      </text>
    );
  };
  return (
    <ChartShell widget={widget} dragHandle={dragHandle} loading={isLoading} empty={rows.length === 0}>
      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <PieChart margin={{ left: 24, right: 24, top: 12, bottom: 12 }}>
          <ChartTooltip
            content={
              <ChartTooltipContent
                nameKey="name"
                formatter={(value: unknown, name: unknown) => {
                  const v = Number(value ?? 0);
                  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : "0";
                  return [`${formatNumber(v)} (${pct}%)`, String(name ?? "")];
                }}
              />
            }
          />
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={1.8}
            labelLine={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeOpacity: 0.9 }}
            label={renderOutsideLabel}
          >
            {chartData.map((e, i) => (
              <Cell key={i} fill={palette[i % palette.length]} stroke="white" strokeWidth={2} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
    </ChartShell>
  );
}

function TableWidget({ widget, dragHandle, data: presetData, isLoading: presetLoading }: WidgetProps) {
  const { data: queryData, isLoading: queryLoading } = useWidgetQuery(
    presetData ? undefined : widget.config
  );
  const data = presetData ?? queryData;
  const isLoading = presetData !== undefined ? !!presetLoading : queryLoading;
  const rows = data?.rows ?? [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-medium">
          {widget.config.title || "Tabel"}
        </CardTitle>
        {dragHandle}
      </CardHeader>
      <CardContent className="flex-1 p-0">
        {isLoading ? (
          <div className="space-y-2 p-6">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="max-h-[320px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-muted-foreground">
                  {cols.map((c) => (
                    <th key={c} className="px-4 py-2 font-medium">
                      {dimLabel(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {cols.map((c) => (
                      <td key={c} className="px-4 py-2.5 tabular-nums">
                        {typeof r[c] === "number" ? formatNumber(Number(r[c])) : String(r[c] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export interface WidgetProps {
  widget: WidgetInstance;
  dragHandle?: ReactNode;
  /** Jika diisi, Widget tidak akan fetch sendiri — pakai data batch dari parent (efisien). */
  data?: { rows: WidgetRow[] };
  isLoading?: boolean;
}

const COMPONENTS: Record<WidgetType, (p: WidgetProps) => ReactNode> = {
  kpi: KpiWidget,
  bar: BarWidget,
  line: LineWidget,
  pie: PieWidget,
  table: TableWidget,
};

export function WidgetRenderer({ widget, dragHandle, data, isLoading }: WidgetProps) {
  const Comp = COMPONENTS[widget.type] ?? KpiWidget;
  return <Comp widget={widget} dragHandle={dragHandle} data={data} isLoading={isLoading} />;
}
