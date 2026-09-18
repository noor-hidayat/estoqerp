// Map pathname → page label for 3-level breadcrumb in Topbar.
// Only routes whose title differs from nav label need to be registered.

const STATIC_TITLES: Record<string, string> = {
  "/app/project/new": "Create Project",
  "/app/so/new": "Create Stock Opname",
  "/app/so/variance": "Variance Review",
  "/app/report/project": "Report per Stock Opname",
  "/app/report/variance": "Variance Report",
  "/app/report/summary": "Summary Report",
  "/app/report/history": "Scan History",
  "/app/settings/roles/new": "Add Role",
  "/app/settings/ai": "AI Assistant",
  "/app/ai": "AI Assistant",
  "/app/setup/barcode-formats/new": "New Barcode Format",
  "/app/setup/batch-formats/new": "New Batch Format",
  "/app/setup/transaction-types/new": "New Transaction Type",
  "/app/setup/uom/new": "Add UOM",
  "/app/setup/departments/new": "Add Department",
  "/app/transaction/new": "New Transaction",
  "/app/receiving": "Receiving",
  "/app/receiving/new": "New Receiving",
  "/app/qc": "QC Inspection",
  "/app/putaway": "Putaway",
  "/app/putaway/new": "New Putaway",
  "/app/supplier-return": "Supplier Return",
  "/app/outbound/picking": "Picking",
  "/app/outbound/packing": "Packing",
  "/app/outbound/customer-return": "Customer Return",
  "/app/report/stock-aging": "Stock Aging",
  "/app/report/batch-traceability": "Batch Traceability",
  "/app/report/inventory-valuation": "Inventory Valuation",
  "/app/report/receiving": "Receiving Report",
  "/app/report/delivery-performance": "Picking / Delivery Performance",
  "/app/inventory/ledger": "Stock Ledger",
  "/app/inventory/batches": "Batch",
};

const PATTERNS: { regex: RegExp; title: string }[] = [
  // All sub-pages in Project Details → label "Project Details",
  // except Session Details which shows the full hierarchy.
  { regex: /^\/app\/so\/[^/]+\/sessions\/[^/]+$/, title: "Session Details" },
  { regex: /^\/app\/so\/[^/]+$/, title: "Stock Opname Details" },
  { regex: /^\/app\/so\/[^/]+\/scan$/, title: "Stock Opname Details" },
  { regex: /^\/app\/so\/[^/]+\/sessions$/, title: "Stock Opname Details" },
  { regex: /^\/app\/so\/[^/]+\/variance$/, title: "Stock Opname Details" },
  { regex: /^\/app\/setup\/barcode-formats\/[^/]+$/, title: "Edit Format" },
  { regex: /^\/app\/setup\/batch-formats\/[^/]+$/, title: "Edit Format" },
  { regex: /^\/app\/settings\/roles\/[^/]+$/, title: "Edit Role" },
  { regex: /^\/app\/setup\/transaction-types\/[^/]+$/, title: "Edit Transaction Type" },
  { regex: /^\/app\/setup\/uom\/[^/]+$/, title: "Edit UOM" },
  { regex: /^\/app\/setup\/departments\/[^/]+$/, title: "Edit Department" },
  { regex: /^\/app\/transaction\/[^/]+$/, title: "Transaction Details" },
  { regex: /^\/app\/receiving\/[^/]+$/, title: "Receiving Details" },
  { regex: /^\/app\/putaway\/[^/]+$/, title: "Putaway Details" },
];

export function getPageTitle(pathname: string): string | null {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  for (const { regex, title } of PATTERNS) {
    if (regex.test(pathname)) return title;
  }
  return null;
}