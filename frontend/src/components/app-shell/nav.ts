;

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  /** Kunci menu RBAC — item tampil bila role punya akses view menu ini. */
  menu: string;
  /** Submenu (Master, Inventory) — dirender sebagai grup expandable. */
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
        icon: "SquaresFour",
        menu: "dashboard",
      },
    ],
  },
  {
    title: "Variance",
    items: [
      {
        label: "Variance Review",
        href: "/app/opname/variance",
        icon: "ArrowsLeftRight",
        menu: "opname.variance",
      },
    ],
  },
  {
    title: "Stock Opname",
    items: [
      {
        label: "Projects",
        href: "/app/opname",
        icon: "ClipboardText",
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
        icon: "Archive",
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
    title: "Laporan",
    items: [
      {
        label: "Laporan",
        href: "/app/reports",
        icon: "ChartBar",
        menu: "reports",
      },
    ],
  },
  {
    title: "Settings",
    items: [
    {
      label: "Settings",
      href: "/app/settings",
      icon: "GearSix",
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
      ],
    },
    ],
  },
];

/** Filter nav berdasarkan akses view (berbasis permission, bukan role id). */
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
