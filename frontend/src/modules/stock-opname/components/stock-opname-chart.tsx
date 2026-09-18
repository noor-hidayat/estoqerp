import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";

export interface WarehouseOpnameRow {
  warehouseId: string;
  warehouseName: string;
  projectName: string;
  systemQty: number;
  countedQty: number;
}

const LIMIT = 7;

const chartConfig = {
  systemQty: {
    label: "System Stock",
    color: "var(--chart-2)",
  },
  countedQty: {
    label: "Opname Result",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const MAX_TICK = 18;

function tickLabel(value: string): string {
  return value.length > MAX_TICK ? `${value.slice(0, MAX_TICK - 1)}…` : value;
}

export function StockOpnameChart({
  warehouses,
  expanded,
}: {
  warehouses: WarehouseOpnameRow[];
  expanded: boolean;
}) {
  const visible = expanded ? warehouses : warehouses.slice(0, LIMIT);

  const chartData = visible.map((w) => ({
    name: w.warehouseName,
    systemQty: w.systemQty,
    countedQty: w.countedQty,
  }));

  return (
    <ChartContainer config={chartConfig} className="h-[320px]">
      <BarChart accessibilityLayer data={chartData}>
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
          tickFormatter={tickLabel}
        />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent indicator="dashed" />}
        />
        <Bar dataKey="systemQty" fill="var(--color-systemQty)" radius={4} />
        <Bar dataKey="countedQty" fill="var(--color-countedQty)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}