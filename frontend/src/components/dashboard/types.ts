export type WidgetType = "bar" | "line" | "pie" | "table" | "kpi";

export type Aggregation = "sum" | "count" | "countDistinct" | "avg" | "min" | "max";

export interface WidgetMeasure {
  field: string;
  aggregation: Aggregation;
  alias?: string;
}

export interface WidgetFilter {
  dateRange?: [string, string];
  warehouseId?: string[];
  branchId?: string[];
  itemGroupId?: string[];
  itemId?: string[];
  locationId?: string[];
  batchId?: string[];
}

export interface WidgetConfig {
  factTable: string;
  measures: WidgetMeasure[];
  groupBy: string[];
  filters?: WidgetFilter;
  title?: string;
}

export interface WidgetLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  config: WidgetConfig;
  layout: WidgetLayout;
}

export interface DashboardMeta {
  factTables: { key: string; label: string; measures: string[]; dims: string[] }[];
  aggregations: Aggregation[];
  periodGrains: string[];
  filters: string[];
}

export type WidgetRow = Record<string, string | number | null>;

export const DIM_LABELS: Record<string, string> = {
  warehouse: "Warehouse",
  warehouseId: "Warehouse (ID)",
  branch: "Branch",
  itemGroup: "Item Group",
  itemId: "Item (ID)",
  location: "Location",
  locationId: "Location (ID)",
  batch: "Batch",
  batchId: "Batch (ID)",
  date: "Tanggal",
};

export function dimLabel(d: string): string {
  return DIM_LABELS[d] ?? d;
}

export function widgetTitle(config: WidgetConfig | undefined): string {
  if (!config) return "Widget";
  if (config.title) return config.title;
  const ft = config.factTable;
  const m = config.measures
    .map((x) => `${x.aggregation} ${x.field}`)
    .join(", ");
  const g = config.groupBy.length ? ` by ${config.groupBy.map(dimLabel).join(", ")}` : "";
  return `${ft}${g} (${m})`;
}
