;

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** RBAC menu key — item shows when role has view access to this menu. */
  menu: string;
  /** Submenu (Data Library, Settings) — rendered as expandable group. */
  children?: NavItem[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Main",
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
    title: "Settings",
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
        label: "Data Library",
        href: "/app/data-library",
        icon: "Database",
        menu: "master",
        children: [
          {
            label: "Item List",
            href: "/app/data-library/items",
            icon: "Package",
            menu: "master.items",
          },
          {
            label: "Item Group",
            href: "/app/data-library/item-groups",
            icon: "Tag",
            menu: "master.itemGroups",
          },
          {
            label: "UOM",
            href: "/app/data-library/uom",
            icon: "Ruler",
            menu: "master.uom",
          },
          {
            label: "Barcode Format",
            href: "/app/data-library/barcode-formats",
            icon: "Barcode",
            menu: "master.barcodeFormats",
          },
          {
            label: "Batch Format",
            href: "/app/data-library/batch-formats",
            icon: "Layers",
            menu: "master.batchFormats",
          },
          {
            label: "Transaction Types",
            href: "/app/data-library/transaction-types",
            icon: "ArrowRightLeft",
            menu: "master.movementTypes",
          },
          {
            label: "Warehouses",
            href: "/app/data-library/warehouses",
            icon: "Warehouse",
            menu: "inventory.warehouses",
          },
          {
            label: "Locations",
            href: "/app/data-library/locations",
            icon: "MapPin",
            menu: "inventory.locations",
          },
          {
            label: "Branches",
            href: "/app/data-library/branches",
            icon: "Buildings",
            menu: "inventory.branches",
          },
        ],
      },
    ],
  },
];

/** Filter nav based on view access (permission-based, not role id). */
export function navForPermissions(canView: (menu: string) => boolean): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .map((item) => ({
        ...item,
        children: item.children?.filter((child) => canView(child.menu)),
      }))
      .filter(
        (item) =>
          canView(item.menu) || (item.children?.length ?? 0) > 0
      ),
  })).filter((group) => group.items.length > 0);
}