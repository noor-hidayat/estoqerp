import { type ReactNode } from "react";
import { Gauge } from "lucide-react";
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
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatNumber } from "@/lib/utils";
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
  const raw = data?.rows?.[0]?.[valueKey];
  const value: ReactNode =
    raw === undefined || raw === null ? "—" : formatNumber(Number(raw));
  return (
    <Card className="@container/card">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-base font-medium">{widget.config.title || "KPI"}</CardTitle>
          <p className="mt-1 text-3xl font-semibold tabular-nums @[250px]/card:text-4xl">
            {isLoading ? <Skeleton className="h-9 w-24" /> : value}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {dragHandle}
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gauge size={17} strokeWidth={2} />
          </div>
        </div>
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
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-medium">
          {widget.config.title || "Chart"}
        </CardTitle>
        {dragHandle}
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <div className="flex h-[260px] items-center justify-center">
            <Skeleton className="h-[240px] w-full rounded-lg" />
          </div>
        ) : empty ? (
          <EmptyState />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

function BarWidget({ widget, dragHandle, data: presetData, isLoading: presetLoading }: WidgetProps) {
  const { data: queryData, isLoading: queryLoading } = useWidgetQuery(
    presetData ? undefined : widget.config
  );
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
        <BarChart data={chartData} margin={{ left: 4, right: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="name"
            tickLine={false}
            tickMargin={8}
            axisLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={56}
            tick={{ fontSize: 10.5 }}
            tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)}
          />
          <YAxis tick={{ fontSize: 10.5 }} width={36} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
          <Bar dataKey="value" radius={4}>
            {chartData.map((e, i) => (
              <Cell key={i} fill={`var(--chart-${(i % 6) + 1})`} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </ChartShell>
  );
}

function LineWidget({ widget, dragHandle, data: presetData, isLoading: presetLoading }: WidgetProps) {
  const { data: queryData, isLoading: queryLoading } = useWidgetQuery(
    presetData ? undefined : widget.config
  );
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
          <Line dataKey="value" type="monotone" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
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
  const chartConfig = Object.fromEntries(
    chartData.map((r) => [r.name, { label: r.name }])
  ) satisfies ChartConfig;
  return (
    <ChartShell widget={widget} dragHandle={dragHandle} loading={isLoading} empty={rows.length === 0}>
      <ChartContainer config={chartConfig} className="h-[260px] w-full">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
          <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={95}>
            {chartData.map((e, i) => (
              <Cell key={i} fill={`var(--chart-${(i % 6) + 1})`} />
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