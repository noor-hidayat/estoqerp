// Map pathname → label halaman untuk breadcrumb 3 level di Topbar.
// Hanya route yang title-nya berbeda dari nav label yang perlu didaftarkan.

const STATIC_TITLES: Record<string, string> = {
  "/app/opname/new": "Buat Project Baru",
  "/app/opname/variance": "Variance Review",
  "/app/reports/project": "Laporan per Project",
  "/app/reports/variance": "Variance Report",
  "/app/reports/summary": "Summary Report",
  "/app/reports/history": "Riwayat Scan",
  "/app/settings/roles/new": "Tambah Role",
  "/app/setup/barcode-formats/new": "Format Barcode Baru",
};

const PATTERNS: { regex: RegExp; title: string }[] = [
  // Semua sub-page dalam Detail Project → label "Detail Project",
  // kecuali Detail Session yang menampilkan hierarki penuh.
  { regex: /^\/app\/opname\/[^/]+\/sessions\/[^/]+$/, title: "Detail Session" },
  { regex: /^\/app\/opname\/[^/]+$/, title: "Detail Project" },
  { regex: /^\/app\/opname\/[^/]+\/scan$/, title: "Detail Project" },
  { regex: /^\/app\/opname\/[^/]+\/sessions$/, title: "Detail Project" },
  { regex: /^\/app\/opname\/[^/]+\/variance$/, title: "Detail Project" },
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
