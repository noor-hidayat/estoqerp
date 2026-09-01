// Registry widget jadi per workspace — dashboard config tinggal pilih templateId, bukan config bebas.
// Tiap template punya config hardcode (factTable/measures/groupBy) yang dijalankan server via buildWidgetQuery.
// Frontend mirror: frontend/src/components/dashboard/widget-registry.ts harus sinkron.

export type WidgetType = "kpi" | "bar" | "line" | "pie" | "table";

export interface WidgetTemplate {
  id: string; // templateId yang disimpan di dashboard_widgets.config.templateId
  workspaceId: string; // wsp-stockopname | wsp-warehouse | wsp-purchasing | wsp-marketing | null (global)
  type: WidgetType;
  title: string;
  description: string;
  config: {
    factTable: string;
    measures: { field: string; aggregation: "sum" | "count" | "avg" | "min" | "max"; alias?: string }[];
    groupBy: string[];
    filters?: Record<string, unknown>;
  };
  defaultLayout: { w: number; h: number };
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  // ---- wsp-stockopname: fokus opname_scan_details ----
  {
    id: "tpl-kpi-total-scan",
    workspaceId: "wsp-stockopname",
    type: "kpi",
    title: "Total Qty Scan",
    description: "Jumlah quantity dari semua scan opname",
    config: { factTable: "opname_scan_details", measures: [{ field: "quantity", aggregation: "sum" }], groupBy: [] },
    defaultLayout: { w: 3, h: 4 },
  },
  {
    id: "tpl-bar-scan-warehouse",
    workspaceId: "wsp-stockopname",
    type: "bar",
    title: "Scan per Warehouse",
    description: "Qty scan dikelompokkan per gudang",
    config: { factTable: "opname_scan_details", measures: [{ field: "quantity", aggregation: "sum" }], groupBy: ["warehouse"] },
    defaultLayout: { w: 6, h: 8 },
  },
  {
    id: "tpl-pie-scan-itemgroup",
    workspaceId: "wsp-stockopname",
    type: "pie",
    title: "Scan per Item Group",
    description: "Qty scan per kategori barang",
    config: { factTable: "opname_scan_details", measures: [{ field: "quantity", aggregation: "sum" }], groupBy: ["itemGroup"] },
    defaultLayout: { w: 4, h: 8 },
  },
  {
    id: "tpl-line-scan-day",
    workspaceId: "wsp-stockopname",
    type: "line",
    title: "Tren Scan Harian",
    description: "Qty scan per hari",
    config: { factTable: "opname_scan_details", measures: [{ field: "quantity", aggregation: "sum" }], groupBy: ["day"] },
    defaultLayout: { w: 6, h: 8 },
  },
  {
    id: "tpl-table-scan-lokasi",
    workspaceId: "wsp-stockopname",
    type: "table",
    title: "Scan per Lokasi",
    description: "Qty scan per lokasi (top 20)",
    config: { factTable: "opname_scan_details", measures: [{ field: "quantity", aggregation: "sum" }], groupBy: ["location"] },
    defaultLayout: { w: 6, h: 8 },
  },
  // ---- wsp-warehouse: fokus stock_balances / stock_ledger / stock_batches ----
  {
    id: "tpl-kpi-total-stock",
    workspaceId: "wsp-warehouse",
    type: "kpi",
    title: "Total Stok (Closing)",
    description: "Sum closingQty seluruh gudang",
    config: { factTable: "stock_balances", measures: [{ field: "closingQty", aggregation: "sum" }], groupBy: [] },
    defaultLayout: { w: 3, h: 4 },
  },
  {
    id: "tpl-bar-stock-warehouse",
    workspaceId: "wsp-warehouse",
    type: "bar",
    title: "Stok per Warehouse",
    description: "Closing qty per gudang",
    config: { factTable: "stock_balances", measures: [{ field: "closingQty", aggregation: "sum" }], groupBy: ["warehouse"] },
    defaultLayout: { w: 6, h: 8 },
  },
  {
    id: "tpl-pie-stock-itemgroup",
    workspaceId: "wsp-warehouse",
    type: "pie",
    title: "Stok per Item Group",
    description: "Closing qty per kategori",
    config: { factTable: "stock_balances", measures: [{ field: "closingQty", aggregation: "sum" }], groupBy: ["itemGroup"] },
    defaultLayout: { w: 4, h: 8 },
  },
  {
    id: "tpl-table-ledger-branch",
    workspaceId: "wsp-warehouse",
    type: "table",
    title: "Ledger per Branch",
    description: "Qty in per branch",
    config: { factTable: "stock_ledger", measures: [{ field: "qtyIn", aggregation: "sum" }], groupBy: ["branch"] },
    defaultLayout: { w: 6, h: 8 },
  },
  {
    id: "tpl-line-stock-movement-day",
    workspaceId: "wsp-warehouse",
    type: "line",
    title: "Movement Harian",
    description: "Qty movement per hari",
    config: { factTable: "stock_movement_details", measures: [{ field: "qty", aggregation: "sum" }], groupBy: ["day"] },
    defaultLayout: { w: 6, h: 8 },
  },
  {
    id: "tpl-bar-batches-warehouse",
    workspaceId: "wsp-warehouse",
    type: "bar",
    title: "Batch Qty per Warehouse",
    description: "Qty batch per gudang",
    config: { factTable: "stock_batches", measures: [{ field: "qty", aggregation: "sum" }], groupBy: ["warehouse"] },
    defaultLayout: { w: 6, h: 8 },
  },
  // ---- wsp-purchasing: supply chain (pakai stock_movement_details & stock_ledger sebagai proxy, + opname untuk variasi) ----
  {
    id: "tpl-kpi-movement-qty",
    workspaceId: "wsp-purchasing",
    type: "kpi",
    title: "Total Qty Movement",
    description: "Sum qty movement (proxy PO/GR)",
    config: { factTable: "stock_movement_details", measures: [{ field: "qty", aggregation: "sum" }], groupBy: [] },
    defaultLayout: { w: 3, h: 4 },
  },
  {
    id: "tpl-bar-movement-warehouse",
    workspaceId: "wsp-purchasing",
    type: "bar",
    title: "Movement per Warehouse",
    description: "Qty movement per gudang (inbound)",
    config: { factTable: "stock_movement_details", measures: [{ field: "qty", aggregation: "sum" }], groupBy: ["warehouse"] },
    defaultLayout: { w: 6, h: 8 },
  },
  {
    id: "tpl-table-batches-itemgroup",
    workspaceId: "wsp-purchasing",
    type: "table",
    title: "Batch per Item Group",
    description: "Qty batch per kategori",
    config: { factTable: "stock_batches", measures: [{ field: "qty", aggregation: "sum" }], groupBy: ["itemGroup"] },
    defaultLayout: { w: 6, h: 8 },
  },
  // ---- wsp-marketing: sales / customer (reuse ledger & scan untuk demo) ----
  {
    id: "tpl-kpi-ledger-qtyout",
    workspaceId: "wsp-marketing",
    type: "kpi",
    title: "Total Qty Out",
    description: "Sum qtyOut ledger (proxy sales)",
    config: { factTable: "stock_ledger", measures: [{ field: "qtyOut", aggregation: "sum" }], groupBy: [] },
    defaultLayout: { w: 3, h: 4 },
  },
  {
    id: "tpl-bar-ledger-warehouse",
    workspaceId: "wsp-marketing",
    type: "bar",
    title: "Qty Out per Warehouse",
    description: "Qty out per gudang",
    config: { factTable: "stock_ledger", measures: [{ field: "qtyOut", aggregation: "sum" }], groupBy: ["warehouse"] },
    defaultLayout: { w: 6, h: 8 },
  },
  {
    id: "tpl-pie-ledger-itemgroup",
    workspaceId: "wsp-marketing",
    type: "pie",
    title: "Qty Out per Item Group",
    description: "Qty out per kategori",
    config: { factTable: "stock_ledger", measures: [{ field: "qtyOut", aggregation: "sum" }], groupBy: ["itemGroup"] },
    defaultLayout: { w: 4, h: 8 },
  },
];

export const TEMPLATE_BY_ID = new Map<string, WidgetTemplate>(WIDGET_TEMPLATES.map((t) => [t.id, t]));

export function templatesForWorkspace(workspaceId: string | null): WidgetTemplate[] {
  if (!workspaceId) return WIDGET_TEMPLATES;
  return WIDGET_TEMPLATES.filter((t) => t.workspaceId === workspaceId);
}

export function isTemplateForWorkspace(templateId: string, workspaceId: string | null): boolean {
  const t = TEMPLATE_BY_ID.get(templateId);
  if (!t) return false;
  if (!workspaceId) return true;
  return t.workspaceId === workspaceId;
}
