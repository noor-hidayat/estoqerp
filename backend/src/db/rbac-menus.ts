// Pohon menu RBAC — sumber kebenaran untuk ekspansi permission coarse → granular.
// Disinkronkan dengan MENU_GROUPS di frontend (components/roles/role-form.tsx).
// Update 2026-09-12: tambah Supply Chain + settings.workflows/company agar sinkron dengan NAV.

export const MENU_CHILDREN: Record<string, string[]> = {
  dashboard: [],
  supply: [
    "supply.suppliers",
    "supply.customers",
    "supply.purchaseOrders",
    "supply.receivings",
    "supply.salesOrders",
    "supply.goodsReceipts",
    "supply.deliveries",
  ],
  master: [
    "master.items",
    "master.itemGroups",
    "master.uom",
    "master.barcodeFormats",
    "master.barcodeFormats.new",
    "master.barcodeFormats.edit",
    "master.batchFormats",
    "master.batchFormats.new",
    "master.batchFormats.edit",
    "master.movementTypes",
    "master.taxCategories",
    "master.priceLists",
    "master.documentTypes",
  ],
  inventory: [
    "inventory.stockBalance",
    "inventory.branches",
    "inventory.warehouses",
    "inventory.locations",
    "inventory.transactions",
    "inventory.batches",
    "inventory.stockLedger",
  ],
  opname: [
    "opname.new",
    "opname.variance",
    "opname.detail",
    "opname.detail.scan",
    "opname.detail.sessions",
    "opname.detail.sessions.detail",
    "opname.detail.variance",
  ],
  reports: [
    "reports.project",
    "reports.summary",
    "reports.history",
    "reports.variance",
  ],
  settings: [
    "settings.users",
    "settings.roles",
    "settings.roles.new",
    "settings.roles.edit",
    "settings.workflows",
    "settings.company",
    "settings.import",
    "settings.columnWidth",
  ],
  ai: [],
};

export const ALL_MENUS: string[] = [
  ...Object.keys(MENU_CHILDREN),
  ...Object.values(MENU_CHILDREN).flat(),
];

// Menu yang punya tombol Export/Import (mirip actionsFor di role form).
export const EXPORT_MENUS = new Set([
  "inventory.stockBalance",
  "inventory.stockLedger",
  "reports.project",
  "reports.summary",
  "reports.history",
  "reports.variance",
]);

export function menuActions(menu: string): string[] {
  const base = ["view", "create", "update", "delete"];
  return EXPORT_MENUS.has(menu) ? [...base, "export", "import"] : base;
}

/** Menu induk dari sebuah menu (parent langsung maupun tidak langsung). */
export function ancestorMenus(menu: string): string[] {
  return Object.keys(MENU_CHILDREN).filter((p) => menu.startsWith(p + "."));
}

/** Ekspansi permission coarse → granular.
 *  Role yang punya (P, A) untuk menu induk P mendapat (M, A) untuk semua
 *  submenu M di bawahnya. Mengembalikan baris baru yang belum ada. */
export function expandPermissions(
  perms: { menu: string; action: string }[]
): { menu: string; action: string }[] {
  const existing = new Set(perms.map((p) => `${p.menu}:${p.action}`));
  const add: { menu: string; action: string }[] = [];
  for (const menu of ALL_MENUS) {
    if (ancestorMenus(menu).length === 0) continue;
    for (const action of menuActions(menu)) {
      if (existing.has(`${menu}:${action}`)) continue;
      if (ancestorMenus(menu).some((p) => existing.has(`${p}:${action}`))) {
        add.push({ menu, action });
      }
    }
  }
  return add;
}
