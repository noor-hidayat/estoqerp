// Map pathname → page label for 3-level breadcrumb in Topbar.
// Only routes whose title differs from nav label need to be registered.

const STATIC_TITLES: Record<string, string> = {
  "/app/projects/new": "Create Project",
  "/app/so/new": "Create Stock Opname",
  "/app/so/variance": "Variance Review",
  "/app/reports/project": "Report per Stock Opname",
  "/app/reports/variance": "Variance Report",
  "/app/reports/summary": "Summary Report",
  "/app/reports/history": "Scan History",
  "/app/settings/roles/new": "Add Role",
  "/app/settings/ai": "AI Assistant",
  "/app/ai": "AI Assistant",
  "/app/setup/barcode-formats/new": "New Barcode Format",
};

const PATTERNS: { regex: RegExp; title: string }[] = [
  // All sub-pages in Project Details → label "Project Details",
  // except Session Details which shows the full hierarchy.
  { regex: /^\/app\/projects\/[^/]+$/, title: "Project Details" },
  { regex: /^\/app\/so\/[^/]+\/sessions\/[^/]+$/, title: "Session Details" },
  { regex: /^\/app\/so\/[^/]+$/, title: "Stock Opname Details" },
  { regex: /^\/app\/so\/[^/]+\/scan$/, title: "Stock Opname Details" },
  { regex: /^\/app\/so\/[^/]+\/sessions$/, title: "Stock Opname Details" },
  { regex: /^\/app\/so\/[^/]+\/variance$/, title: "Stock Opname Details" },
  { regex: /^\/app\/setup\/barcode-formats\/[^/]+$/, title: "Edit Format" },
  { regex: /^\/app\/settings\/roles\/[^/]+$/, title: "Edit Role" },
];

export function getPageTitle(pathname: string): string | null {
  if (STATIC_TITLES[pathname]) return STATIC_TITLES[pathname];
  for (const { regex, title } of PATTERNS) {
    if (regex.test(pathname)) return title;
  }
  return null;
}
