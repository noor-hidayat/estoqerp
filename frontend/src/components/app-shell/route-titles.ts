// Map pathname → page label for 3-level breadcrumb in Topbar.
// Only routes whose title differs from nav label need to be registered.

const STATIC_TITLES: Record<string, string> = {
  "/app/project/new": "Create Project",
  "/app/project/so/new": "Create Stock Opname",
  "/app/project/so/variance": "Variance Review",
  "/app/report/project": "Report per Stock Opname",
  "/app/report/variance": "Variance Report",
  "/app/report/summary": "Summary Report",
  "/app/report/history": "Scan History",
  "/app/settings/roles/new": "Add Role",
  "/app/settings/ai": "AI Assistant",
  "/app/ai": "AI Assistant",
  "/app/data-library/barcode-formats/new": "New Barcode Format",
  "/app/data-library/transaction-types/new": "New Transaction Type",
  "/app/transaction/new": "New Transaction",
  "/app/inventory/ledger": "Stock Ledger",
  "/app/inventory/batches": "Batch",
};

const PATTERNS: { regex: RegExp; title: string }[] = [
  // All sub-pages in Project Details → label "Project Details",
  // except Session Details which shows the full hierarchy.
  { regex: /^\/app\/project\/[^/]+$/, title: "Project Details" },
  { regex: /^\/app\/project\/so\/[^/]+\/sessions\/[^/]+$/, title: "Session Details" },
  { regex: /^\/app\/project\/so\/[^/]+$/, title: "Stock Opname Details" },
  { regex: /^\/app\/project\/so\/[^/]+\/scan$/, title: "Stock Opname Details" },
  { regex: /^\/app\/project\/so\/[^/]+\/sessions$/, title: "Stock Opname Details" },
  { regex: /^\/app\/project\/so\/[^/]+\/variance$/, title: "Stock Opname Details" },
  { regex: /^\/app\/data-library\/barcode-formats\/[^/]+$/, title: "Edit Format" },
  { regex: /^\/app\/settings\/roles\/[^/]+$/, title: "Edit Role" },
  { regex: /^\/app\/data-library\/transaction-types\/[^/]+$/, title: "Edit Transaction Type" },
  { regex: /^\/app\/transaction\/[^/]+$/, title: "Transaction Details" },
];

export function getPageTitle(pathname: string): string | null {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  for (const { regex, title } of PATTERNS) {
    if (regex.test(pathname)) return title;
  }
  return null;
}