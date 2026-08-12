"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  Barcode,
  BarChart3,
  Boxes,
  Building2,
  ClipboardList,
  LayoutGrid,
  MapPin,
  Package,
  PanelLeft,
  Scale,
  Settings,
  SquareAsterisk,
  Tag,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { navForPermissions, type NavGroup, type NavItem } from "./nav";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { cx } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  SquaresFour: LayoutGrid,
  ClipboardText: ClipboardList,
  ArrowsLeftRight: Scale,
  Barcode,
  Package,
  Archive,
  Boxes,
  MapPin,
  Buildings: Building2,
  ChartBar: BarChart3,
  GearSix: Settings,
  Warehouse,
  Tag,
  SquareAsterisk,
  Users,
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

function isActive(href: string, pathname: string): boolean {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(href + "/");
}

function computeActiveHrefs(
  groups: NavGroup[],
  pathname: string
): Set<string> {
  const links: string[] = groups.flatMap((g) =>
    g.items.flatMap((i) => [
      i.href,
      ...(i.children ?? []).map((c) => c.href),
    ])
  );
  const deepest = links
    .filter((href) => isActive(href, pathname))
    .sort((a, b) => b.length - a.length)[0];
  if (!deepest) return new Set();

  const active = new Set<string>();
  for (const group of groups) {
    for (const item of group.items) {
      if (item.href === deepest) active.add(item.href);
      if (
        (item.children?.length ?? 0) > 0 &&
        deepest.startsWith(item.href + "/")
      ) {
        active.add(item.href);
      }
      for (const child of item.children ?? []) {
        if (child.href === deepest) active.add(child.href);
      }
    }
  }
  return active;
}

function ItemLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = ICONS[item.icon] ?? LayoutGrid;
  return (
    <Link
      href={item.href}
      title={item.label}
      className={cx(
        "group relative flex items-center rounded-md py-[5px] text-[13px] font-medium transition-colors",
        collapsed ? "mx-1 w-10" : "mx-1.5 w-[calc(100%-12px)]",
        active
          ? "text-zinc-900"
          : "text-zinc-500 hover:text-zinc-900"
      )}
    >
      <span
        className={cx(
          "absolute inset-x-0 inset-y-1 rounded-md transition-colors",
          active
            ? "bg-zinc-100"
            : "bg-zinc-100 opacity-0 group-hover:opacity-100"
        )}
      />
      <span className="relative z-10 flex h-8 w-10 shrink-0 items-center justify-center">
        <Icon
          size={16}
          strokeWidth={active ? 2.4 : 2}
          className={cx(
            "transition-colors",
            active ? "text-zinc-900" : "text-zinc-600 group-hover:text-zinc-900"
          )}
        />
      </span>
      <span
        className="relative z-10 grid transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
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
        <span className="absolute right-3 z-10 h-1.5 w-1.5 rounded-full bg-zinc-900" />
      )}
    </Link>
  );
}

function Group({
  group,
  activeHrefs,
  collapsed,
}: {
  group: NavGroup;
  activeHrefs: Set<string>;
  collapsed: boolean;
}) {
  return (
    <div className="mt-0.4 first:mt-0">
      <div className="flex flex-col gap-0.4">
        {group.items.map((item) => (
          <ItemLink
            key={item.href}
            item={item}
            active={activeHrefs.has(item.href)}
            collapsed={collapsed}
          />
        ))}
      </div>
    </div>
  );
}

export type SidebarMode = "expanded" | "collapsed";

export function SidebarContent({
  onNavigate,
  collapsed = false,
  mode,
  onModeChange,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  mode?: SidebarMode;
  onModeChange?: (mode: SidebarMode) => void;
}) {
  const pathname = usePathname();
  const { isSystem, permissions } = useSession();
  const canView = (menu: string) => can(isSystem, permissions, menu, "view");
  const groups = navForPermissions(canView);
  const activeHrefs = computeActiveHrefs(groups, pathname);

  return (
    <div className="flex h-full flex-col">
      <div
        className={cx(
          "flex h-16 shrink-0 items-center gap-2.5 border-b border-zinc-200/80 px-2",
          collapsed && "justify-center px-2"
        )}
      >
        <span className="flex h-9 w-10 shrink-0 items-center justify-center">
          <BrandMark />
        </span>
        <span
          className="grid transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ gridTemplateColumns: collapsed ? "0fr" : "1fr" }}
        >
          <span className="min-w-0 overflow-hidden">
            <span
              className={cx(
                "block whitespace-nowrap pr-3 text-[15px] font-semibold tracking-tight text-zinc-900 transition-opacity duration-200",
                collapsed ? "opacity-0" : "opacity-100"
              )}
            >
              StockOps
            </span>
          </span>
        </span>
      </div>
      {onModeChange && (
        <div className="border-b border-zinc-200/80 px-2 py-2">
          <button
            onClick={() => onModeChange(mode === "expanded" ? "collapsed" : "expanded")}
            className={cx(
              "group flex items-center rounded-md p-0.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900",
              collapsed ? "mx-1 w-10 justify-center" : "mx-1.5 w-[calc(100%-12px)]"
            )}
          >
            <span className="flex h-8 w-10 shrink-0 items-center justify-center">
              <PanelLeft
                size={16}
                strokeWidth={2}
                className="text-zinc-600 transition-colors group-hover:text-zinc-900"
              />
            </span>
            <span
              className="grid transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ gridTemplateColumns: collapsed ? "0fr" : "1fr" }}
            >
              <span className="min-w-0 overflow-hidden">
                <span
                  className={cx(
                    "block whitespace-nowrap pr-3 text-[13px] font-medium transition-opacity duration-200",
                    collapsed ? "opacity-0" : "opacity-100"
                  )}
                >
                  Collapsed
                </span>
              </span>
            </span>
          </button>
        </div>
      )}
      <nav
        onClick={onNavigate}
        className="flex-1 overflow-x-hidden overflow-y-auto px-2 py-4"
      >
        {groups.map((group) => (
          <Group
            key={group.title}
            group={group}
            activeHrefs={activeHrefs}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </div>
  );
}
