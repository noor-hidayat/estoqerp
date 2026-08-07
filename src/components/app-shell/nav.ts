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
        roles: ["ADMIN", "STAFF", "APPROVER"],
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
        roles: ["ADMIN", "STAFF", "APPROVER"],
      },
      {
        label: "Variance Review",
        href: "/app/opname/variance",
        icon: "ArrowsLeftRight",
        roles: ["ADMIN", "STAFF", "APPROVER"],
      },
      {
        label: "Approval",
        href: "/app/opname/approval",
        icon: "Stamp",
        roles: ["ADMIN", "APPROVER"],
      },
    ],
  },
  {
    title: "Setup",
    items: [
      {
        label: "Barcode Format",
        href: "/app/setup/barcode-formats",
        icon: "Barcode",
        roles: ["ADMIN"],
      },
      {
        label: "Item / Produk",
        href: "/app/setup/items",
        icon: "Package",
        roles: ["ADMIN"],
      },
      {
        label: "Lokasi Gudang",
        href: "/app/setup/locations",
        icon: "MapPin",
        roles: ["ADMIN"],
      },
      {
        label: "Cabang & Gudang",
        href: "/app/setup/branches",
        icon: "Buildings",
        roles: ["ADMIN"],
      },
      {
        label: "User & Role",
        href: "/app/setup/users",
        icon: "UsersThree",
        roles: ["ADMIN"],
      },
    ],
  },
  {
    title: "Laporan",
    items: [
      {
        label: "Laporan per Project",
        href: "/app/reports",
        icon: "ChartBar",
        roles: ["ADMIN", "STAFF", "APPROVER"],
      },
      {
        label: "Variance Report",
        href: "/app/reports/variance",
        icon: "Warning",
        roles: ["ADMIN", "STAFF", "APPROVER"],
      },
      {
        label: "Laporan per Lokasi",
        href: "/app/reports/locations",
        icon: "MapTrifold",
        roles: ["ADMIN", "STAFF", "APPROVER"],
      },
      {
        label: "Summary Report",
        href: "/app/reports/summary",
        icon: "FileText",
        roles: ["ADMIN", "APPROVER"],
      },
      {
        label: "Riwayat Scan",
        href: "/app/reports/history",
        icon: "ClockCounterClockwise",
        roles: ["ADMIN", "STAFF", "APPROVER"],
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
