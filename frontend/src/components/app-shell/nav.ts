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
  { id: "wsp-stockopname", code: "stockopname", label: "Stock Opname", icon: "ClipboardList", description: "Project, Scan & Laporan" },
  { id: "wsp-warehouse", code: "warehouse", label: "Warehouse", icon: "Warehouse", description: "Stok, Ledger & Master" },
  { id: "wsp-purchasing", code: "purchasing", label: "Purchasing", icon: "ShoppingCart", description: "Supplier, PO & GR" },
  { id: "wsp-marketing", code: "marketing", label: "Marketing", icon: "Megaphone", description: "Customer & Sales Order" },
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
      },
      {
        label: "Stock Opname",
        href: "/app/so",
        icon: "ClipboardList",
        menu: "opname",
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
    title: "Settings",
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
  "wsp-stockopname": ["dashboard", "opname", "reports", "ai"],
  "wsp-warehouse": ["dashboard", "inventory", "master", "ai", "inventory.transactions", "inventory.stockBalance", "inventory.stockLedger", "inventory.batches", "inventory.warehouses", "inventory.locations", "inventory.branches", "supply.deliveries"],
  "wsp-purchasing": ["dashboard", "supply.suppliers", "supply.purchaseOrders", "supply.goodsReceipts", "supply.deliveries", "ai"],
  "wsp-marketing": ["dashboard", "supply.customers", "supply.salesOrders", "supply.deliveries", "ai"],
};

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
  return NAV.map((group) => {
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
          children: item.children?.filter((child) => canView(child.menu) && menuAllowedForWorkspace(child.menu, workspaceId ?? null)),
        }))
        .filter((item) => {
          const wsOk = menuAllowedForWorkspace(item.menu, workspaceId ?? null) || (item.children?.length ?? 0) > 0;
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