"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo, useRef, useState, useEffect } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { useSession, ROLE_LABELS } from "@/lib/session";
import { hueBg, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, type Crumb } from "@/components/ui/breadcrumb";
import { NAV } from "./nav";
import { getPageTitle } from "./route-titles";

export function Topbar() {
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
      href: "/app",
      subtitle: null as string | null,
    };
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.children?.length) {
          const child = item.children.find((c) => match(c.href));
          if (child) {
            const subtitle = getPageTitle(pathname);
            found = {
              label: child.label,
              href: child.href,
              subtitle: subtitle && subtitle !== child.label ? subtitle : null,
            };
            break;
          }
          if (match(item.href)) {
            found = {
              label: item.label,
              href: item.href,
              subtitle: null,
            };
            break;
          }
        } else if (match(item.href)) {
          const subtitle = getPageTitle(pathname);
          found = {
            label: item.label,
            href: item.href,
            subtitle: subtitle && subtitle !== item.label ? subtitle : null,
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

  const crumbs: Crumb[] = [
    { label: current.label, href: current.href && pathname !== current.href ? current.href : undefined },
    ...(current.subtitle ? [{ label: current.subtitle }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 flex h-[60px] items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="-ml-1 size-9 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent" />
        <Breadcrumb
          crumbs={[{ label: "Home", href: "/app" }, ...crumbs]}
          className="mb-0 min-w-0"
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-card py-1.5 pl-1.5 pr-3 transition-all hover:border-primary/30 hover:shadow-sm"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm"
              style={{ background: hueBg(user.avatarHue) }}
            >
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span className="hidden text-left leading-tight md:block">
              <span className="block text-[12.5px] font-semibold text-foreground">
                {user.name}
              </span>
              <span className="block text-[10.5px] text-muted-foreground">
                {ROLE_LABELS[user.role]}
              </span>
            </span>
            <ChevronDown
              size={12}
              strokeWidth={2.5}
              className={cn(
                "text-muted-foreground transition-transform",
                menuOpen && "rotate-180"
              )}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-xl border border-border bg-card p-2 shadow-xl">
              <div className="flex items-center gap-3 rounded-lg bg-accent/50 px-3 py-3">
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white shadow-sm"
                  style={{ background: hueBg(user.avatarHue) }}
                >
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[13.5px] font-bold text-foreground">
                    {user.name}
                  </p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between px-3 py-2">
                <span className="text-[12px] text-muted-foreground">Active role</span>
                <Badge tone="success" dot>
                  {ROLE_LABELS[user.role]}
                </Badge>
              </div>
              <button
                onClick={() => {
                  void signOut().then(() => router.push("/login"));
                }}
                className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut size={16} strokeWidth={2} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
