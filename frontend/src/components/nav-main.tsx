import { Fragment, useEffect, useRef, useState } from "react"
import {
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRightLeft,
  ArrowUpFromLine,
  Barcode,
  Boxes,
  Building2,
  ChartColumn,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Database,
  Diff,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Gauge,
  History,
  Hourglass,
  Inbox,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  MapPin,
  Megaphone,
  NotebookText,
  Package,
  PackageSearch,
  RotateCcw,
  Route,
  Settings,
  SquareAsterisk,
  Tag,
  TriangleAlert,
  Undo2,
  Users,
  Warehouse,
  Bot,
  ClipboardList,
  Ruler,
  Truck,
  ShoppingCart,
  Receipt,
  PackageCheck,
  type LucideIcon,
} from "lucide-react"
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTransition } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { NavGroup, NavItem } from "@/components/app-shell/nav"

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FolderKanban,
  Database,
  Package,
  Archive,
  Boxes,
  MapPin,
  Buildings: Building2,
  ChartColumn,
  Settings,
  Warehouse,
  Tag,
  SquareAsterisk,
  Users,
  FileSpreadsheet,
  Barcode,
  TriangleAlert,
  FileText,
  History,
  Bot,
  ArrowLeftRight,
  ArrowRightLeft,
  NotebookText,
  Layers,
  ClipboardList,
  Ruler,
  LayoutGrid,
  Truck,
  ShoppingCart,
  Receipt,
  PackageCheck,
  Megaphone,
  ArrowDownToLine,
  ArrowUpFromLine,
  Inbox,
  ClipboardCheck,
  PackageSearch,
  Undo2,
  ListChecks,
  RotateCcw,
  Diff,
  Hourglass,
  Route,
  Coins,
  Gauge,
}

function isActive(href: string, pathname: string): boolean {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(href + "/")
}

const PREFETCH: Record<string, () => Promise<unknown>> = {
  "/app": () => import("@/app/app/page"),
  "/app/transaction": () => import("@/app/app/transaction/page"),
  "/app/inbound": () => import("@/app/app/inbound/page"),
  "/app/outbound": () => import("@/app/app/outbound/page"),
  "/app/so": () => import("@/app/app/so/page"),
  "/app/project": () => import("@/app/app/project/page"),
  "/app/report": () => import("@/app/app/report/page"),
  "/app/inventory/balance": () => import("@/app/app/inventory/balance/page"),
  "/app/setup/items": () => import("@/app/app/setup/items/page"),
  "/app/setup/warehouses": () => import("@/app/app/setup/warehouses/page"),
};

function prefetch(href: string) {
  const fn = PREFETCH[href];
  if (fn) void fn();
  // prefetch children too
  for (const [key, loader] of Object.entries(PREFETCH)) {
    if (key.startsWith(href + "/")) void loader();
  }
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [isPending, startTransition] = useTransition()
  const { state } = useSidebar()
  const isCollapsed = state === "collapsed"

  const activeHrefs = new Set<string>()
  for (const group of groups) {
    for (const item of group.items) {
      const children = item.children ?? []
      const childActive = children.find((c) => isActive(c.href, pathname))
      if (isActive(item.href, pathname)) activeHrefs.add(item.href)
      if (childActive) activeHrefs.add(childActive.href)
    }
  }

  // Akordeon: hanya satu submenu terbuka pada satu waktu.
  const [openHref, setOpenHref] = useState<string | null>(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if ((item.children?.length ?? 0) > 0) {
          const childActive = item.children?.find((c) =>
            isActive(c.href, pathname)
          )
          if (isActive(item.href, pathname) || childActive) return item.href
        }
      }
    }
    return null
  })

  // Buka parent yang sedang aktif (navigasi langsung / refresh).
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  useEffect(() => {
    for (const group of groupsRef.current) {
      for (const item of group.items) {
        if ((item.children?.length ?? 0) > 0) {
          const childActive = item.children?.find((c) =>
            isActive(c.href, pathname)
          )
          if (isActive(item.href, pathname) || childActive) {
            setOpenHref(item.href)
            return
          }
        }
      }
    }
  }, [pathname])

  const toggleItem = (href: string) => {
    setOpenHref((cur) => (cur === href ? null : href))
  }

  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.title}>
          <SidebarGroup>
          {!isCollapsed &&
          (group.title === "Menu" || group.title === "Setting") ? (
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
          ) : null}
          <SidebarMenu>
            {group.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutGrid
              const hasChildren = (item.children?.length ?? 0) > 0
              const isItemActive = activeHrefs.has(item.href)
              const childActive = item.children?.find((c) =>
                activeHrefs.has(c.href)
              )

              if (!hasChildren) {
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isItemActive}
                      tooltip={item.label}
                    >
                      <Link
                        to={item.href}
                        viewTransition
                        onMouseEnter={() => prefetch(item.href)}
                        onClick={(e) => {
                          if (isActive(item.href, pathname)) return;
                          e.preventDefault();
                          startTransition(() => navigate(item.href));
                        }}
                        style={{ opacity: isPending ? 0.85 : 1 }}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              }

              return (
                <NavCollapsibleItem
                  key={item.href}
                  item={item}
                  activeHrefs={activeHrefs}
                  isItemActive={isItemActive}
                  isCollapsed={isCollapsed}
                  open={openHref === item.href}
                  onToggle={() => toggleItem(item.href)}
                />
              )
            })}
          </SidebarMenu>
          </SidebarGroup>
        </Fragment>
      ))}
    </>
  )
}

function NavCollapsibleItem({
  item,
  activeHrefs,
  isItemActive,
  isCollapsed,
  open,
  onToggle,
}: {
  item: NavItem
  activeHrefs: Set<string>
  isItemActive: boolean
  isCollapsed: boolean
  open: boolean
  onToggle: () => void
}) {
  const Icon = ICONS[item.icon] ?? LayoutGrid
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [, startTransition] = useTransition()

  // Mode kecil (ikon): klik parent langsung menuju halamannya
  // (mis. /app/setup), bukan membuka submenu.
  if (isCollapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isItemActive} tooltip={item.label}>
          <Link
            to={item.href}
            viewTransition
            onMouseEnter={() => prefetch(item.href)}
            onClick={(e) => {
              if (isActive(item.href, pathname)) return
              e.preventDefault()
              startTransition(() => navigate(item.href))
            }}
          >
            <Icon />
            <span>{item.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={onToggle}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.label} isActive={isItemActive}>
            <Icon />
            <span>{item.label}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children?.map((child) => (
              <SidebarMenuSubItem key={child.href}>
                <SidebarMenuSubButton
                  asChild
                  isActive={activeHrefs.has(child.href)}
                >
                  <Link
                    to={child.href}
                    viewTransition
                    onMouseEnter={() => prefetch(child.href)}
                    onClick={(e) => {
                      if (activeHrefs.has(child.href)) return
                      e.preventDefault()
                      startTransition(() => navigate(child.href))
                    }}
                  >
                    <span>{child.label}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}