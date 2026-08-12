"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/session";
import { hueBg, cx } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { NAV } from "./nav";
import { getPageTitle } from "./route-titles";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => {
    const match = (href: string) =>
      href === "/app"
        ? pathname === "/app"
        : pathname === href || pathname.startsWith(href + "/");

    let found = {
      label: "StockOps",
      group: "",
      subtitle: null as string | null,
      nested: false,
    };
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.children?.length) {
          const child = item.children.find((c) => match(c.href));
          if (child) {
            const subtitle = getPageTitle(pathname);
            found = {
              label: child.label,
              group: group.title,
              subtitle: subtitle && subtitle !== child.label ? subtitle : null,
              nested: true,
            };
            break;
          }
          if (match(item.href)) {
            found = { label: item.label, group: group.title, subtitle: null, nested: false };
            break;
          }
        } else if (match(item.href)) {
          const subtitle = getPageTitle(pathname);
          found = {
            label: item.label,
            group: group.title,
            subtitle: subtitle && subtitle !== item.label ? subtitle : null,
            nested: false,
          };
          break;
        }
      }
      if (found.label !== "StockOps") break;
    }
    return found;
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  // Grup hanya ditampilkan untuk menu nested (Settings > Role Management, dst).
  const crumbs = [
    ...(current.nested && current.group ? [current.group] : []),
    current.label,
    current.subtitle,
  ].filter((c): c is string => !!c);

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:pl-6 lg:pr-8 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={onMenu}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-100 lg:hidden"
        >
          <Menu size={20} strokeWidth={2} />
        </button>
        <nav className="flex min-w-0 items-center gap-1.5">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span
                key={i}
                className={cx(
                  "flex min-w-0 items-center gap-1.5",
                  !last && "hidden md:flex"
                )}
              >
                {i > 0 && (
                  <ChevronRight
                    size={13}
                    strokeWidth={2}
                    className="shrink-0 text-zinc-300"
                  />
                )}
                <span
                  className={cx(
                    "truncate",
                    last
                      ? "text-[15px] font-semibold tracking-tight text-zinc-900 sm:text-lg"
                      : "text-[12.5px] font-medium text-zinc-400"
                  )}
                >
                  {c}
                </span>
              </span>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-md border border-zinc-200 bg-white py-1.5 pl-1.5 pr-3 transition-colors hover:border-zinc-300"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold text-white"
              style={{ background: hueBg(user.avatarHue) }}
            >
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-[12.5px] font-medium text-zinc-800">
                {user.name}
              </span>
              <span className="block text-[10.5px] text-zinc-400">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
            <ChevronDown
              size={12}
              strokeWidth={2.5}
              className={cx(
                "text-zinc-400 transition-transform",
                menuOpen && "rotate-180"
              )}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-lg border border-zinc-200 bg-white p-2 shadow-[0_8px_24px_-8px_rgb(24_24_27/0.12)]">
              <div className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
                  style={{ background: hueBg(user.avatarHue) }}
                >
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[13.5px] font-semibold text-zinc-900">
                    {user.name}
                  </p>
                  <p className="truncate text-[11.5px] text-zinc-400">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between px-3 py-2">
                <span className="text-[12px] text-zinc-500">Role aktif</span>
                <Badge tone="emerald" dot>
                  {ROLE_LABELS[user.role]}
                </Badge>
              </div>
              <button
                onClick={() => {
                  void signOut().then(() => router.push("/login"));
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px] font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                <LogOut size={16} strokeWidth={2} />
                Keluar
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
