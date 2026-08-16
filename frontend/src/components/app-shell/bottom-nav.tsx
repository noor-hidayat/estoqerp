"use client";

import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  ClipboardList,
  Archive,
  Boxes,
  BarChart3,
  Settings,
  Bot,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { navForPermissions, type NavItem } from "./nav";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

const ICONS: Record<string, LucideIcon> = {
  SquaresFour: LayoutGrid,
  ClipboardText: ClipboardList,
  Archive,
  Boxes,
  ChartBar: BarChart3,
  Bot,
  GearSix: Settings,
};

const BOTTOM_NAV_ITEMS: { label: string; href: string; icon: string; menu: string }[] = [
  { label: "Dashboard", href: "/app", icon: "SquaresFour", menu: "dashboard" },
  { label: "Stock Opname", href: "/app/so", icon: "ClipboardText", menu: "opname" },
  { label: "Master Data", href: "/app/setup", icon: "Archive", menu: "master" },
  { label: "Inventory", href: "/app/stock", icon: "Boxes", menu: "inventory" },
  { label: "Reports", href: "/app/reports", icon: "ChartBar", menu: "reports" },
  { label: "AI", href: "/app/ai", icon: "Bot", menu: "ai" },
  { label: "Settings", href: "/app/settings", icon: "GearSix", menu: "settings" },
];

function isActive(href: string, pathname: string): boolean {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(href + "/");
}

function NavItemLink({
  item,
  active,
  onClick,
}: {
  item: (typeof BOTTOM_NAV_ITEMS)[number];
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = ICONS[item.icon] ?? LayoutGrid;
  return (
    <Link
      to={item.href}
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-[3px] py-2 transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <span className="relative">
        <Icon
          size={22}
          strokeWidth={active ? 2.4 : 2}
          className={cn("transition-colors", active ? "text-primary" : "text-muted-foreground")}
        />
        {active && (
          <span className="absolute -bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-primary" />
        )}
      </span>
      <span
        className={cn(
          "text-[10px] font-semibold leading-none",
          active ? "text-primary" : "text-muted-foreground"
        )}
      >
        {item.label}
      </span>
    </Link>
  );
}

export function BottomNav() {
  const { pathname } = useLocation();
  const { isSystem, permissions } = useSession();
  const canView = (menu: string) => can(isSystem, permissions, menu, "view");
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleItems = BOTTOM_NAV_ITEMS.filter((item) => canView(item.menu));
  const showMore = visibleItems.length > 5;
  const mainItems = showMore ? visibleItems.slice(0, 4) : visibleItems;
  const moreItems = showMore ? visibleItems.slice(4) : [];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
          {mainItems.map((item) => (
            <NavItemLink
              key={item.href}
              item={item}
              active={isActive(item.href, pathname)}
            />
          ))}
          {showMore && (
            <button
              onClick={() => setMoreOpen(true)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-[3px] py-2 transition-colors",
                moreOpen || moreItems.some((i) => isActive(i.href, pathname))
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span className="relative">
                <MoreHorizontal
                  size={22}
                  strokeWidth={2}
                  className={cn(
                    "transition-colors",
                    moreItems.some((i) => isActive(i.href, pathname))
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                />
                {moreItems.some((i) => isActive(i.href, pathname)) && (
                  <span className="absolute -bottom-1 left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-primary" />
                )}
              </span>
              <span className="text-[10px] font-semibold leading-none text-muted-foreground">
                More
              </span>
            </button>
          )}
        </div>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              className="fixed bottom-[calc(64px+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-2xl bg-card p-4 shadow-2xl lg:hidden"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
            >
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                More Menu
              </div>
              <div className="flex flex-col gap-1">
                {moreItems.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutGrid;
                  const active = isActive(item.href, pathname);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <Icon size={18} strokeWidth={active ? 2.4 : 2} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
