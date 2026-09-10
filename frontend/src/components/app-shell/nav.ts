;

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** RBAC menu key — item shows when role has view access to this menu. */
  menu: string;
  /** Bila true, item hanya tampil bila role punya akses MANAGE (bukan sekadar view). */
  manage?: boolean;
  /** Submenu (Data Library, Settings) — rendered as expandable group. */
  children?: NavItem[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Jika true, grup ini tampil di semua workspace (Settings/Setup) */
  shared?: boolean;
}

export const WORKSPACES = [
  { id: "wsp-warehouse", code: "warehouse", label: "Warehouse", icon: "Warehouse", description: "Stok, Ledger & Master" },
  { id: "wsp-purchasing", code: "purchasing", label: "Purchasing", icon: "ShoppingCart", description: "Supplier, PO & GR" },
  { id: "wsp-marketing", code: "marketing", label: "Marketing", icon: "Megaphone", description: "Customer & Sales Order" },
  { id: "wsp-quality", code: "quality", label: "Quality", icon: "ClipboardCheck", description: "QC Inspection & Quality Control" },
] as const;

export type WorkspaceId = (typeof WORKSPACES)[number]["id"];
export type WorkspaceCode = (typeof WORKSPACES)[number]["code"];

export const NAV: NavGroup[] = [
  {
    title: "Dashboards",
    items: [
      {
        label: "Dashboard",
        href: "/app",
        icon: "LayoutDashboard",
        menu: "dashboard",
      },
    ],
  },
  {
    title: "Menu",
    items: [
      {
        label: "Transaction",
        href: "/app/transaction",
        icon: "ArrowLeftRight",
        menu: "inventory.transactions",
      },
      {
        label: "AI Assistant",
        href: "/app/ai",
        icon: "Bot",
        menu: "ai",
      },
      {
        label: "Project",
        href: "/app/project",
        icon: "FolderKanban",
        menu: "opname",
        children: [
          {
            label: "All Projects",
            href: "/app/project",
            icon: "FolderKanban",
            menu: "opname",
          },
          {
            label: "Project Warehouse",
            href: "/app/project/warehouse",
            icon: "FolderKanban",
            menu: "opname",
          },
        ],
      },
      {
        label: "Stock Opname",
        href: "/app/so",
        icon: "ClipboardList",
        menu: "opname",
        children: [
          {
            label: "All Counts",
            href: "/app/so",
            icon: "ClipboardList",
            menu: "opname",
          },
          {
            label: "Count Entry",
            href: "/app/so/count",
            icon: "ClipboardList",
            menu: "opname",
          },
          {
            label: "Stock Adjustment",
            href: "/app/so/variance",
            icon: "Diff",
            menu: "opname.variance",
          },
        ],
      },
    ],
  },
  {
    title: "Inventory",
    items: [
      {
        label: "Inventory",
        href: "/app/inventory",
        icon: "Boxes",
        menu: "inventory",
        children: [
          {
            label: "Stock Balance",
            href: "/app/inventory/balance",
            icon: "Boxes",
            menu: "inventory.stockBalance",
          },
          {
            label: "Stock Ledger",
            href: "/app/inventory/ledger",
            icon: "NotebookText",
            menu: "inventory.stockLedger",
          },
          {
            label: "Batch",
            href: "/app/inventory/batches",
            icon: "Layers",
            menu: "inventory.batches",
          },
          {
            label: "Batch Barcodes",
            href: "/app/inventory/batches/barcode",
            icon: "Layers",
            menu: "inventory.batches",
          },
        ],
      },
    ],
  },
  {
    title: "Reports",
    items: [
      {
        label: "Reports",
        href: "/app/report",
        icon: "ChartColumn",
        menu: "reports",
        children: [
          {
            label: "Report per Project",
            href: "/app/report/project",
            icon: "ChartColumn",
            menu: "reports.project",
          },
          {
            label: "Variance Report",
            href: "/app/report/variance",
            icon: "TriangleAlert",
            menu: "reports.variance",
          },
          {
            label: "Summary Report",
            href: "/app/report/summary",
            icon: "FileText",
            menu: "reports.summary",
          },
          {
            label: "Scan History",
            href: "/app/report/history",
            icon: "History",
            menu: "reports.history",
          },
          {
            label: "Stock Aging",
            href: "/app/report/stock-aging",
            icon: "Hourglass",
            menu: "reports",
          },
          {
            label: "Batch Traceability",
            href: "/app/report/batch-traceability",
            icon: "Route",
            menu: "reports",
          },
          {
            label: "Inventory Valuation",
            href: "/app/report/inventory-valuation",
            icon: "Coins",
            menu: "reports",
          },
          {
            label: "Receiving Report",
            href: "/app/report/receiving",
            icon: "FileText",
            menu: "reports",
          },
          {
            label: "Picking / Delivery Performance",
            href: "/app/report/delivery-performance",
            icon: "Gauge",
            menu: "reports",
          },
        ],
      },
    ],
  },
  {
    title: "Supply Chain",
    items: [
      {
        label: "Suppliers",
        href: "/app/suppliers",
        icon: "Truck",
        menu: "supply.suppliers",
      },
      {
        label: "Customers",
        href: "/app/customers",
        icon: "Users",
        menu: "supply.customers",
      },
      {
        label: "Purchase Orders",
        href: "/app/purchase-orders",
        icon: "ShoppingCart",
        menu: "supply.purchaseOrders",
      },
      {
        label: "Sales Orders",
        href: "/app/sales-orders",
        icon: "Receipt",
        menu: "supply.salesOrders",
      },
      {
        label: "Goods Receipts",
        href: "/app/goods-receipts",
        icon: "PackageCheck",
        menu: "supply.goodsReceipts",
      },
      {
        label: "Deliveries",
        href: "/app/deliveries",
        icon: "Truck",
        menu: "supply.deliveries",
      },
    ],
  },
  {
    title: "Setting",
    shared: true,
    items: [
      {
        label: "Settings",
        href: "/app/settings",
        icon: "Settings",
        menu: "settings",
        children: [
          {
            label: "User & Role",
            href: "/app/settings/users",
            icon: "Users",
            menu: "settings.users",
          },
          {
            label: "Role Management",
            href: "/app/settings/roles",
            icon: "SquareAsterisk",
            menu: "settings.roles",
          },
          {
            label: "Import Data",
            href: "/app/settings/import",
            icon: "FileSpreadsheet",
            menu: "settings.import",
          },
          {
            label: "AI Settings",
            href: "/app/settings/ai",
            icon: "Bot",
            menu: "settings",
          },
          {
            label: "Company",
            href: "/app/settings/company",
            icon: "Building2",
            menu: "settings.company",
          },
        ],
      },
      {
        label: "Setup",
        href: "/app/setup",
        icon: "Database",
        menu: "master",
        children: [
          {
            label: "Item List",
            href: "/app/setup/items",
            icon: "Package",
            menu: "master.items",
          },
          {
            label: "Item Group",
            href: "/app/setup/item-groups",
            icon: "Tag",
            menu: "master.itemGroups",
          },
          {
            label: "UOM",
            href: "/app/setup/uom",
            icon: "Ruler",
            menu: "master.uom",
          },
          {
            label: "Tax Categories",
            href: "/app/setup/tax-categories",
            icon: "Percent",
            menu: "master",
          },
          {
            label: "Price Lists",
            href: "/app/setup/price-lists",
            icon: "Tag",
            menu: "master",
            children: [
              { label: "All Price Lists", href: "/app/setup/price-lists", icon: "Tag", menu: "master" },
              { label: "Item Pricelist", href: "/app/setup/price-lists/items", icon: "History", menu: "master" },
            ],
          },
          {
            label: "Barcode Format",
            href: "/app/setup/barcode-formats",
            icon: "Barcode",
            menu: "master.barcodeFormats",
          },
          {
            label: "Batch Format",
            href: "/app/setup/batch-formats",
            icon: "Layers",
            menu: "master.batchFormats",
          },
          {
            label: "Transaction Types",
            href: "/app/setup/transaction-types",
            icon: "ArrowRightLeft",
            menu: "master.movementTypes",
          },
          {
            label: "Document Numbering",
            href: "/app/setup/document-types",
            icon: "FileText",
            menu: "master",
          },
          {
            label: "Warehouses",
            href: "/app/setup/warehouses",
            icon: "Warehouse",
            menu: "inventory.warehouses",
          },
          {
            label: "Locations",
            href: "/app/setup/locations",
            icon: "MapPin",
            menu: "inventory.locations",
          },
          {
            label: "Branches",
            href: "/app/setup/branches",
            icon: "Buildings",
            menu: "inventory.branches",
          },
        ],
      },
    ],
  },
];

export const WORKSPACE_MENU_MAP: Record<string, string[]> = {
  "wsp-purchasing": ["dashboard", "supply.suppliers", "supply.purchaseOrders", "supply.goodsReceipts", "supply.deliveries", "ai"],
  "wsp-marketing": ["dashboard", "supply.customers", "supply.salesOrders", "supply.deliveries", "ai"],
  "wsp-quality": ["dashboard", "supply.goodsReceipts", "ai"],
};

// ---------------------------------------------------------------------------
// Struktur khusus workspace Warehouse (5 grup sejajar, tanpa parent Transaction).
// Halaman reuse pakai menu key lama (tanpa migrasi RBAC); halaman placeholder
// memakai menu key induknya hingga modul granular fase 2 siap.
// ---------------------------------------------------------------------------
export const WAREHOUSE_NAV: NavGroup[] = [
  {
    title: "Dashboards",
    items: [
      { label: "Dashboard", href: "/app", icon: "LayoutDashboard", menu: "dashboard" },
      { label: "AI Assistant", href: "/app/ai", icon: "Bot", menu: "ai" },
    ],
  },
  {
    title: "Menu",
    items: [
      {
        label: "Transaction",
        href: "/app/transaction",
        icon: "ArrowLeftRight",
        menu: "inventory.transactions",
      },
      {
        label: "Inbound",
        href: "/app/inbound",
        icon: "ArrowDownToLine",
        menu: "supply.purchaseOrders",
        children: [
          { label: "Receiving", href: "/app/receiving", icon: "Inbox", menu: "supply.purchaseOrders" },
          { label: "GRN", href: "/app/goods-receipts", icon: "PackageCheck", menu: "supply.goodsReceipts" },
          { label: "Putaway", href: "/app/putaway", icon: "PackageSearch", menu: "supply.goodsReceipts" },
          { label: "Supplier Return", href: "/app/supplier-return", icon: "Undo2", menu: "supply.goodsReceipts" },
        ],
      },
      {
        label: "Outbound",
        href: "/app/outbound",
        icon: "ArrowUpFromLine",
        menu: "supply.salesOrders",
        children: [
          { label: "Delivery Order", href: "/app/sales-orders", icon: "Receipt", menu: "supply.salesOrders" },
          { label: "Picking", href: "/app/outbound/picking", icon: "ListChecks", menu: "supply.deliveries" },
          { label: "Packing", href: "/app/outbound/packing", icon: "Package", menu: "supply.deliveries" },
          { label: "Dispatch / Shipment", href: "/app/deliveries", icon: "Truck", menu: "supply.deliveries" },
          { label: "Customer Return", href: "/app/outbound/customer-return", icon: "RotateCcw", menu: "supply.deliveries" },
        ],
      },
      {
        label: "Inventory",
        href: "/app/inventory",
        icon: "Boxes",
        menu: "inventory",
        children: [
          { label: "Stock Balance", href: "/app/inventory/balance", icon: "Boxes", menu: "inventory.stockBalance" },
          { label: "Stock Ledger", href: "/app/inventory/ledger", icon: "NotebookText", menu: "inventory.stockLedger" },
          { label: "Batch / Lot", href: "/app/inventory/batches", icon: "Layers", menu: "inventory.batches" },
          { label: "Batch Barcodes", href: "/app/inventory/batches/barcode", icon: "Layers", menu: "inventory.batches" },
        ],
      },
      {
        label: "Stock Opname",
        href: "/app/so",
        icon: "ClipboardList",
        menu: "opname",
        children: [
          { label: "Opname Project", href: "/app/project", icon: "FolderKanban", menu: "opname" },
          { label: "Project Warehouse", href: "/app/project/warehouse", icon: "FolderKanban", menu: "opname" },
          { label: "Stock Opname", href: "/app/so", icon: "ClipboardList", menu: "opname" },
          { label: "Count Entry", href: "/app/so/count", icon: "ClipboardList", menu: "opname" },
          { label: "Stock Adjustment", href: "/app/so/variance", icon: "Diff", menu: "opname.variance" },
        ],
      },
      {
        label: "Report",
        href: "/app/report",
        icon: "ChartColumn",
        menu: "reports",
        children: [
          { label: "Stock Balance", href: "/app/inventory/balance", icon: "Boxes", menu: "inventory.stockBalance" },
          { label: "Stock Movement", href: "/app/inventory/ledger", icon: "ArrowLeftRight", menu: "inventory.stockLedger" },
          { label: "Stock Aging", href: "/app/report/stock-aging", icon: "Hourglass", menu: "reports" },
          { label: "Batch Traceability", href: "/app/report/batch-traceability", icon: "Route", menu: "reports" },
          { label: "Inventory Valuation", href: "/app/report/inventory-valuation", icon: "Coins", menu: "reports" },
          { label: "Receiving Report", href: "/app/report/receiving", icon: "FileText", menu: "reports" },
          { label: "Picking / Delivery Performance", href: "/app/report/delivery-performance", icon: "Gauge", menu: "reports" },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Struktur khusus workspace Quality: Dashboard + menu QC Inspection.
// QC Inspection tetap ada di Inbound (alur Receiving → QC → GRN); di sini
// tampil sebagai akses langsung tim Quality.
// ---------------------------------------------------------------------------
export const QUALITY_NAV: NavGroup[] = [
  {
    title: "Dashboards",
    items: [
      { label: "Dashboard", href: "/app", icon: "LayoutDashboard", menu: "dashboard" },
      { label: "AI Assistant", href: "/app/ai", icon: "Bot", menu: "ai" },
    ],
  },
  {
    title: "Menu",
    items: [
      {
        label: "QC Inspection",
        href: "/app/qc",
        icon: "ClipboardCheck",
        menu: "supply.goodsReceipts",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Workspace Purchasing — hanya menu relevan procurement.
// ---------------------------------------------------------------------------
export const PURCHASING_NAV: NavGroup[] = [
  {
    title: "Dashboards",
    items: [
      { label: "Dashboard", href: "/app", icon: "LayoutDashboard", menu: "dashboard" },
      { label: "AI Assistant", href: "/app/ai", icon: "Bot", menu: "ai" },
    ],
  },
  {
    title: "Menu",
    items: [
      {
        label: "Suppliers",
        href: "/app/suppliers",
        icon: "Truck",
        menu: "supply.suppliers",
      },
      {
        label: "Purchase Orders",
        href: "/app/purchase-orders",
        icon: "ShoppingCart",
        menu: "supply.purchaseOrders",
      },
      {
        label: "Goods Receipts",
        href: "/app/goods-receipts",
        icon: "PackageCheck",
        menu: "supply.goodsReceipts",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Workspace Marketing — hanya menu relevan sales.
// ---------------------------------------------------------------------------
export const MARKETING_NAV: NavGroup[] = [
  {
    title: "Dashboards",
    items: [
      { label: "Dashboard", href: "/app", icon: "LayoutDashboard", menu: "dashboard" },
      { label: "AI Assistant", href: "/app/ai", icon: "Bot", menu: "ai" },
    ],
  },
  {
    title: "Menu",
    items: [
      {
        label: "Customers",
        href: "/app/customers",
        icon: "Users",
        menu: "supply.customers",
      },
      {
        label: "Sales Orders",
        href: "/app/sales-orders",
        icon: "Receipt",
        menu: "supply.salesOrders",
      },
      {
        label: "Deliveries",
        href: "/app/deliveries",
        icon: "Truck",
        menu: "supply.deliveries",
      },
    ],
  },
];

function menuAllowedForWorkspace(menu: string, workspaceId: string | null): boolean {
  if (!workspaceId) return true;
  const allowed = WORKSPACE_MENU_MAP[workspaceId];
  if (!allowed) return true;
  return allowed.some((m) => menu === m || menu.startsWith(m + ".") || m.startsWith(menu + "."));
}

/** Filter nav based on view access + workspace. Shared groups (Settings) tampil di semua workspace. */
export function navForPermissions(
  canView: (menu: string) => boolean,
  canManage?: (menu: string) => boolean,
  workspaceId?: string | null
): NavGroup[] {
  // Workspace dengan struktur dedicated sudah scoped,
  // jadi filter workspace dilewati dan hanya permission yang berlaku.
  // Grup shared (Settings/Setup) ikut disertakan agar master data tetap terjangkau.
  const dedicated =
    workspaceId === "wsp-warehouse"
      ? WAREHOUSE_NAV
      : workspaceId === "wsp-quality"
        ? QUALITY_NAV
        : workspaceId === "wsp-purchasing"
          ? PURCHASING_NAV
          : workspaceId === "wsp-marketing"
            ? MARKETING_NAV
            : null;
  const base = dedicated
    ? [...dedicated, ...NAV.filter((g) => (g as unknown as { shared?: boolean }).shared)]
    : NAV;
  const skipWorkspaceFilter = dedicated !== null;
  return base.map((group) => {
    // Shared group selalu tampil (filter hanya by permission, bukan workspace)
    const isShared = (group as unknown as { shared?: boolean }).shared;
    if (!isShared && workspaceId) {
      // Jika grup tidak shared, cek apakah ada item yang allowed untuk workspace ini
      const hasAllowed = group.items.some((it) => menuAllowedForWorkspace(it.menu, workspaceId) || it.children?.some((c) => menuAllowedForWorkspace(c.menu, workspaceId)));
      if (!hasAllowed) return { ...group, items: [] };
    }
    return {
      ...group,
      items: group.items
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => canView(child.menu) && (skipWorkspaceFilter || menuAllowedForWorkspace(child.menu, workspaceId ?? null))),
        }))
        .filter((item) => {
          const wsOk = skipWorkspaceFilter || menuAllowedForWorkspace(item.menu, workspaceId ?? null) || (item.children?.length ?? 0) > 0;
          if (!wsOk && !isShared) return false;
          const visible = item.manage
            ? canManage?.(item.menu) ?? false
            : canView(item.menu) || (item.children?.length ?? 0) > 0;
          return visible;
        }),
    };
  }).filter((group) => group.items.length > 0);
}

export function navForWorkspace(
  workspaceId: string | null,
  canView: (menu: string) => boolean,
  canManage?: (menu: string) => boolean
): NavGroup[] {
  return navForPermissions(canView, canManage, workspaceId);
}