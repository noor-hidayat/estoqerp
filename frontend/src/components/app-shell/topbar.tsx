"use client";

import { usePathname, useRouter } from "next/navigation";
import { useMemo } from "react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { useSession, ROLE_LABELS } from "@/lib/session";
import { hueBg } from "@/lib/utils";
import { useStockMovement, useProject } from "@/lib/api/query";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Breadcrumb, type Crumb } from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NAV } from "./nav";
import { getPageTitle } from "./route-titles";

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useSession();

  const ids = useMemo(() => {
    const m = pathname.match(/^\/app\/transaction\/([^/]+)/);
    const p = pathname.match(/^\/app\/so\/([^/]+)/);
    return {
      movementId: m && m[1] !== "new" ? m[1] : undefined,
      projectId: p && p[1] !== "new" && p[1] !== "variance" ? p[1] : undefined,
    };
  }, [pathname]);

  const { data: movement } = useStockMovement(ids.movementId);
  const { data: project } = useProject(ids.projectId);

  // Title dinamis: transaksi → nama tipe transaksi, stock opname → nama project.
  const dynamicSubtitle = useMemo(
    () => movement?.typeName ?? project?.name ?? null,
    [movement, project]
  );

  const current = useMemo(() => {
    const match = (href: string) =>
      href === "/app"
        ? pathname === "/app"
        : pathname === href || pathname.startsWith(href + "/");

    let found = {
      label: "Estoq",
      href: "/app",
      subtitle: null as string | null,
    };
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.children?.length) {
          const child = item.children.find((c) => match(c.href));
          if (child) {
            const subtitle = dynamicSubtitle ?? getPageTitle(pathname);
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
          const subtitle = dynamicSubtitle ?? getPageTitle(pathname);
          found = {
            label: item.label,
            href: item.href,
            subtitle: subtitle && subtitle !== item.label ? subtitle : null,
          };
          break;
        }
      }
      if (found.label !== "Estoq") break;
    }
    return found;
  }, [pathname, dynamicSubtitle]);

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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="group flex cursor-pointer items-center gap-2.5 rounded-lg py-1.5 pl-1.5 pr-2.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm ring-2 ring-background transition-shadow group-hover:ring-primary/20"
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
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </span>
              <ChevronsUpDown
                size={14}
                strokeWidth={2.5}
                className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-72 overflow-hidden rounded-xl p-0"
          >
            <DropdownMenuLabel className="p-0">
              <div className="flex items-center gap-3 border-b border-border/60 bg-gradient-to-br from-primary/5 to-transparent px-4 py-3.5">
                <Avatar
                  name={user.name}
                  hue={user.avatarHue}
                  size="lg"
                  className="ring-2 ring-ring/20"
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-bold text-foreground">
                    {user.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="text-xs font-medium text-muted-foreground">
                Active role
              </span>
              <Badge tone="success" dot className="px-2.5 py-1">
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            </div>
            <DropdownMenuSeparator className="mx-2" />
            <DropdownMenuItem
              className="gap-2.5 px-4 py-2.5 text-[13px] font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
              onClick={() => {
                void signOut().then(() => router.push("/login"));
              }}
            >
              <LogOut size={16} strokeWidth={2} />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
