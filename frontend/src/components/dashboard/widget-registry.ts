// Mirror dari backend/src/lib/dashboard-templates.ts — harus sinkron!
// Jika tambah template di backend, tambah di sini juga.

export type WidgetType = "kpi" | "bar" | "line" | "pie" | "table";

export interface WidgetTemplate {
  id: string;
  workspaceId: string;
  type: WidgetType;
  title: string;
  description: string;
  config: {
    factTable: string;
    measures: { field: string; aggregation: "sum" | "count" | "countDistinct" | "avg" | "min" | "max"; alias?: string }[];
    groupBy: string[];
    filters?: Record<string, unknown>;
    limit?: number;
    orderBy?: string;
    orderDirection?: "asc" | "desc";
  };
  defaultLayout: { w: number; h: number };
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
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
  {
    id: "tpl-kpi-wh-stock-value",
    workspaceId: "wsp-warehouse",
    type: "kpi",
    title: "Total Stock Value",
    description: "Nilai stok (closingQty * valuationRate)",
    config: { factTable: "stock_balances", measures: [{ field: "stockValue", aggregation: "sum" }], groupBy: [] },
    defaultLayout: { w: 2, h: 4 },
  },
  {
    id: "tpl-kpi-wh-total-warehouse",
    workspaceId: "wsp-warehouse",
    type: "kpi",
    title: "Total Warehouse",
    description: "Jumlah gudang yang punya stock",
    config: { factTable: "stock_balances", measures: [{ field: "warehouseId", aggregation: "countDistinct" }], groupBy: [] },
    defaultLayout: { w: 2, h: 4 },
  },
  {
    id: "tpl-kpi-wh-active-items",
    workspaceId: "wsp-warehouse",
    type: "kpi",
    title: "Total Active Items",
    description: "Item aktif dengan stock",
    config: { factTable: "stock_balances", measures: [{ field: "itemId", aggregation: "countDistinct" }], groupBy: [], filters: { isActive: true } },
    defaultLayout: { w: 2, h: 4 },
  },
  {
    id: "tpl-kpi-wh-low-stock",
    workspaceId: "wsp-warehouse",
    type: "kpi",
    title: "Low Stock",
    description: "Stock 1-10 (closingQty rendah)",
    config: { factTable: "stock_balances", measures: [{ field: "itemId", aggregation: "count" }], groupBy: [], filters: { closingQtyGt: 0, closingQtyLte: 10 } },
    defaultLayout: { w: 2, h: 4 },
  },
  {
    id: "tpl-kpi-wh-out-of-stock",
    workspaceId: "wsp-warehouse",
    type: "kpi",
    title: "Out of Stock",
    description: "Stock kosong (closingQty = 0)",
    config: { factTable: "stock_balances", measures: [{ field: "itemId", aggregation: "count" }], groupBy: [], filters: { closingQtyEq: 0 } },
    defaultLayout: { w: 2, h: 4 },
  },
  {
    id: "tpl-kpi-wh-return-pct",
    workspaceId: "wsp-warehouse",
    type: "kpi",
    title: "Persentase Return",
    description: "Persentase Return = Total Return / Total Delivery * 100% (qty)",
    config: { factTable: "return_pct", measures: [{ field: "returnPct", aggregation: "avg", alias: "returnPct" }], groupBy: [] },
    defaultLayout: { w: 2, h: 4 },
  },
  {
    id: "tpl-line-wh-receiving-vs-delivery",
    workspaceId: "wsp-warehouse",
    type: "bar",
    title: "Receiving vs Delivery Trend",
    description: "Perbandingan nilai Receiving (GR receiptDate) vs Delivery SO (deliveryDate) per bulan — batang vertikal",
    config: { factTable: "receiving_vs_delivery", measures: [{ field: "receivingValue", aggregation: "sum" }, { field: "deliveryValue", aggregation: "sum" }], groupBy: ["month"] },
    defaultLayout: { w: 7, h: 8 },
  },
  {
    id: "tpl-bar-wh-stock-per-warehouse-h",
    workspaceId: "wsp-warehouse",
    type: "bar",
    title: "Stock per Warehouse",
    description: "Top 10 gudang dengan stock closing qty terbesar — diurut besar ke kecil",
    config: {
      factTable: "stock_balances",
      measures: [{ field: "closingQty", aggregation: "sum" }],
      groupBy: ["warehouse"],
      limit: 10,
      orderBy: "closingQty_sum",
      orderDirection: "desc",
    },
    defaultLayout: { w: 5, h: 8 },
  },
  {
    id: "tpl-top10-return-items",
    workspaceId: "wsp-warehouse",
    type: "bar",
    title: "Top 10 Most Returned Items",
    description: "Finish good paling sering di-return customer",
    config: { factTable: "stock_movement_details", measures: [{ field: "qty", aggregation: "sum", alias: "returnQty" }], groupBy: ["itemId"], filters: { movementTypeCode: "RETURN_CUSTOMER", isFinishGood: true } },
    defaultLayout: { w: 5, h: 8 },
  },
  {
    id: "tpl-line-wh-closing-stock-fg",
    workspaceId: "wsp-warehouse",
    type: "line",
    title: "Stock Level Trend (Finish Good)",
    description: "Closing stock per hari untuk item finish good (total semua warehouse)",
    config: { factTable: "stock_balances", measures: [{ field: "closingQty", aggregation: "sum", alias: "closingStock" }], groupBy: ["day"], filters: { isFinishGood: true } },
    defaultLayout: { w: 7, h: 8 },
  },
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
