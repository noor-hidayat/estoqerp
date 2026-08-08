"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Barcode,
  BarChart3,
  Building2,
  ClipboardList,
  History,
  FileText,
  LayoutGrid,
  Map,
  MapPin,
  Notebook,
  Package,
  Tag,
  TriangleAlert,
  Users,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { navForRole, type NavGroup } from "./nav";
import { cx } from "@/lib/utils";
import type { Role } from "@/types";

const ICONS: Record<string, LucideIcon> = {
  SquaresFour: LayoutGrid,
  ClipboardText: ClipboardList,
  ArrowsLeftRight: ArrowLeftRight,
  Barcode,
  Package,
  MapPin,
  Buildings: Building2,
  UsersThree: Users,
  ChartBar: BarChart3,
  Warning: TriangleAlert,
  MapTrifold: Map,
  FileText,
  ClockCounterClockwise: History,
  GearSix: Settings,
  Notebook,
  Tag,
};

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/stockops.svg"
      alt="StockOps"
      className={cx("h-9 w-9", className)}
    />
  );
}

function Group({
  group,
  pathname,
  collapsed,
}: {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
}) {
  return (
    <div>
      <div className="flex flex-col gap-0">
        {group.items.map((item) => {
          const Icon = ICONS[item.icon] ?? LayoutGrid;
          const itemMatches =
            item.href === "/app"
              ? pathname === "/app"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const active =
            itemMatches &&
            !group.items.some(
              (other) =>
                other.href !== item.href &&
                other.href.length > item.href.length &&
                other.href.startsWith(item.href) &&
                (pathname === other.href || pathname.startsWith(other.href + "/"))
            );
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cx(
                "group relative flex items-center rounded-lg py-1 text-[13.5px] font-medium transition-colors",
                collapsed ? "w-11" : "w-full",
                active
                  ? "text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-200/60 hover:text-zinc-900"
              )}
            >
              {active && (
                <span className="absolute inset-0 rounded-lg bg-zinc-200/70" />
              )}
              <span className="relative z-10 flex h-9 w-11 shrink-0 items-center justify-center">
                <Icon
                  size={18}
                  strokeWidth={active ? 2.5 : 2}
                  className={cx(
                    "transition-colors",
                    active ? "text-[#0f1e3d]" : "text-zinc-500 group-hover:text-zinc-900"
                  )}
                />
              </span>
              <span
                className="grid transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{ gridTemplateColumns: collapsed ? "0fr" : "1fr" }}
              >
                <span className="overflow-hidden min-w-0">
                  <span
                    className={cx(
                      "block whitespace-nowrap pr-3 transition-opacity duration-200",
                      collapsed ? "opacity-0" : "opacity-100"
                    )}
                  >
                    {item.label}
                  </span>
                </span>
              </span>
              {active && !collapsed && (
                <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-[#0f1e3d]" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SidebarContent({
  role,
  onNavigate,
  collapsed = false,
}: {
  role: Role;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const groups = navForRole(role);

  return (
    <div className="flex h-full flex-col">
      <nav
        onClick={onNavigate}
        className="flex-1 overflow-x-hidden overflow-y-auto px-2 py-3"
      >
        {groups.map((group) => (
          <Group
            key={group.title}
            group={group}
            pathname={pathname}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </div>
  );
}
