;

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** RBAC menu key — item shows when role has view access to this menu. */
  menu: string;
  /** Submenu (Master Data, Inventory) — rendered as expandable group. */
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
        label: "Project",
        href: "/app/projects",
        icon: "FolderKanban",
        menu: "opname",
      },
    ],
  },
  {
    title: "Master",
    items: [
      {
        label: "Master",
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
            label: "Category",
            href: "/app/setup/categories",
            icon: "Tag",
            menu: "master.categories",
          },
          {
            label: "Barcode Format",
            href: "/app/setup/barcode-formats",
            icon: "Barcode",
            menu: "master.barcodeFormats",
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
        href: "/app/stock",
        icon: "Boxes",
        menu: "inventory",
        children: [
          {
            label: "Stock Balance",
            href: "/app/stock/balance",
            icon: "Boxes",
            menu: "inventory.stockBalance",
          },
          {
            label: "Plants",
            href: "/app/stock/branches",
            icon: "Buildings",
            menu: "inventory.branches",
          },
          {
            label: "Warehouses",
            href: "/app/stock/warehouses",
            icon: "Warehouse",
            menu: "inventory.warehouses",
          },
          {
            label: "Locations",
            href: "/app/stock/locations",
            icon: "MapPin",
            menu: "inventory.locations",
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
        href: "/app/reports",
        icon: "ChartColumn",
        menu: "reports",
        children: [
          {
            label: "Report per Project",
            href: "/app/reports/project",
            icon: "ChartColumn",
            menu: "reports.project",
          },
          {
            label: "Variance Report",
            href: "/app/reports/variance",
            icon: "TriangleAlert",
            menu: "reports.variance",
          },
          {
            label: "Summary Report",
            href: "/app/reports/summary",
            icon: "FileText",
            menu: "reports.summary",
          },
          {
            label: "Scan History",
            href: "/app/reports/history",
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