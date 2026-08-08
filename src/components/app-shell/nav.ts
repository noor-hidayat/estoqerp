import type { Role } from "@/types";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles: Role[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Operasi",
    items: [
      {
        label: "Dashboard",
        href: "/app",
        icon: "SquaresFour",
        roles: ["ADMINISTRATOR", "ADMIN", "STAFF"],
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
        roles: ["ADMINISTRATOR", "ADMIN", "STAFF"],
      },
      {
        label: "Variance Review",
        href: "/app/opname/variance",
        icon: "ArrowsLeftRight",
        roles: ["ADMINISTRATOR", "ADMIN", "STAFF"],
      },
    ],
  },
  {
    title: "Monitoring",
    items: [
      {
        label: "Stock Ledger",
        href: "/app/stock",
        icon: "Notebook",
        roles: ["ADMINISTRATOR", "ADMIN", "STAFF"],
      },
    ],
  },
  {
    title: "Setup",
    items: [
      {
        label: "Kategori",
        href: "/app/setup/categories",
        icon: "Tag",
        roles: ["ADMINISTRATOR", "ADMIN"],
      },
      {
        label: "Item / Produk",
        href: "/app/setup/items",
        icon: "Package",
        roles: ["ADMINISTRATOR", "ADMIN"],
      },
      {
        label: "Lokasi Gudang",
        href: "/app/setup/locations",
        icon: "MapPin",
        roles: ["ADMINISTRATOR", "ADMIN"],
      },
      {
        label: "Cabang & Gudang",
        href: "/app/setup/branches",
        icon: "Buildings",
        roles: ["ADMINISTRATOR", "ADMIN"],
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
        roles: ["ADMINISTRATOR", "ADMIN"],
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
        roles: ["ADMINISTRATOR", "ADMIN", "STAFF"],
      },
    ],
  },
];

export function navForRole(role: Role): NavGroup[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
