"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowsLeftRight,
  Barcode,
  Buildings,
  ChartBar,
  ClipboardText,
  ClockCounterClockwise,
  FileText,
  MapPin,
  MapTrifold,
  Package,
  SquaresFour,
  Stamp,
  UsersThree,
  Warning,
  type Icon,
} from "@phosphor-icons/react";
import { navForRole, type NavGroup } from "./nav";
import { cx } from "@/lib/utils";
import type { Role } from "@/types";

const ICONS: Record<string, Icon> = {
  SquaresFour,
  ClipboardText,
  ArrowsLeftRight,
  Stamp,
  Barcode,
  Package,
  MapPin,
  Buildings,
  UsersThree,
  ChartBar,
  Warning,
  MapTrifold,
  FileText,
  ClockCounterClockwise,
};

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-emerald-400",
        className
      )}
    >
      <Barcode size={20} weight="bold" />
    </div>
  );
}

function Group({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <div className="mt-6 first:mt-0">
      <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
        {group.title}
      </p>
      <div className="flex flex-col gap-0.5">
        {group.items.map((item) => {
          const Icon = ICONS[item.icon] ?? SquaresFour;
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                active
                  ? "text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100/80 hover:text-zinc-800"
              )}
            >
              {active && (
                <span className="absolute inset-0 rounded-xl bg-zinc-100" />
              )}
              <Icon
                size={18}
                weight={active ? "bold" : "regular"}
                className={cx(
                  "relative z-10 transition-colors",
                  active ? "text-emerald-600" : "text-zinc-400 group-hover:text-zinc-600"
                )}
              />
              <span className="relative z-10">{item.label}</span>
              {active && (
                <span className="absolute right-3 h-1.5 w-1.5 rounded-full bg-emerald-500" />
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
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = navForRole(role);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-4 pb-6 pt-5">
        <BrandMark />
        <div className="leading-tight">
          <p className="text-[15px] font-semibold tracking-tight text-zinc-900">
            StockOpname
          </p>
          <p className="text-[11px] text-zinc-400">Gudang Operations</p>
        </div>
      </div>

      <nav
        onClick={onNavigate}
        className="flex-1 overflow-y-auto px-3 pb-6"
      >
        {groups.map((group) => (
          <Group key={group.title} group={group} pathname={pathname} />
        ))}
      </nav>

      <div className="border-t border-zinc-100 p-4">
        <div className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <p className="text-[11.5px] text-zinc-500">
            Sistem dalam mode{" "}
            <span className="font-semibold text-zinc-700">demo data</span>
          </p>
        </div>
      </div>
    </div>
  );
}
