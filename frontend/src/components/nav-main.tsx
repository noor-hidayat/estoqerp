import { Fragment, useEffect, useMemo, useRef, useState } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  "/app/transaction/new": () => import("@/app/app/transaction/new/page"),
  "/app/receiving": () => import("@/app/app/receiving/page"),
  "/app/receiving/new": () => import("@/app/app/receiving/new/page"),
  "/app/qc": () => import("@/app/app/qc/page"),
  "/app/qc/new": () => import("@/app/app/qc/new/page"),
  "/app/sales-orders/new": () => import("@/app/app/sales-orders/new/page"),
  "/app/deliveries/new": () => import("@/app/app/deliveries/new/page"),
  "/app/inventory/batches/barcode": () => import("@/app/app/inventory/batches/barcode/page"),
  "/app/project/new": () => import("@/app/app/project/new/page"),
  "/app/project/warehouse": () => import("@/app/app/project/warehouse/page"),
  "/app/so/new": () => import("@/app/app/so/new/page"),
  "/app/so/count": () => import("@/app/app/so/count/page"),
  "/app/settings/ai": () => import("@/app/app/settings/ai/page"),
  "/app/so": () => import("@/app/app/so/page"),
  "/app/project": () => import("@/app/app/project/page"),
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

// Pilihan submenu yang terbuka — dipersist agar tidak ketutup pas reload.
const OPEN_HREF_KEY = "estoq:nav-open";

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

  // Parent yang sedang aktif dari rute — dihitung ulang tiap render sehingga
  // tetap benar walau data nav datang belakangan (session/workspace async).
  const activeParent = useMemo(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if ((item.children?.length ?? 0) > 0) {
          const childActive = item.children?.some((c) =>
            isActive(c.href, pathname)
          )
          if (isActive(item.href, pathname) || childActive) return item.href
        }
      }
    }
    return null
  }, [groups, pathname])

  // Akordeon: hanya satu submenu terbuka pada satu waktu.
  // `undefined` = ikuti rute aktif; string/null = pilihan manual user (persist reload).
  const [manualOpen, setManualOpen] = useState<string | null | undefined>(() => {
    try {
      const saved = localStorage.getItem(OPEN_HREF_KEY)
      return saved ? (JSON.parse(saved) as string | null) : undefined
    } catch {
      return undefined
    }
  })

  // Pindah halaman → kembali ikuti rute aktif.
  const lastPathname = useRef(pathname)
  useEffect(() => {
    if (lastPathname.current !== pathname) {
      lastPathname.current = pathname
      setManualOpen(undefined)
    }
  }, [pathname])

  // Simpan pilihan manual agar submenu tidak ketutup pas reload.
  useEffect(() => {
    try {
      if (manualOpen === undefined) localStorage.removeItem(OPEN_HREF_KEY)
      else localStorage.setItem(OPEN_HREF_KEY, JSON.stringify(manualOpen))
    } catch {
      /* abaikan (mode privat) */
    }
  }, [manualOpen])

  const openHref = manualOpen === undefined ? activeParent : manualOpen

  const toggleItem = (href: string) => {
    setManualOpen((cur) => {
      const effective = cur === undefined ? activeParent : cur
      return effective === href ? null : href
    })
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

  // Mode kecil (ikon): klik parent membuka flyout berisi halaman induk
  // + semua shortcut anak (lengkap, sama kayak mode expanded).
  if (isCollapsed) {
    const go = (href: string) => {
      if (isActive(href, pathname)) return
      startTransition(() => navigate(href))
    }
    return (
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton isActive={isItemActive} tooltip={item.label}>
              <Icon />
              <span>{item.label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start" className="min-w-52">
            <DropdownMenuLabel
              onClick={() => go(item.href)}
              className="flex cursor-pointer items-center gap-2"
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {item.children?.map((child) => {
              const active = activeHrefs.has(child.href)
              return (
                <DropdownMenuItem
                  key={child.href}
                  onMouseEnter={() => prefetch(child.href)}
                  onSelect={(e) => {
                    e.preventDefault()
                    go(child.href)
                  }}
                  className={active ? "bg-accent" : undefined}
                >
                  <span>{child.label}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  // Mode expanded: klik parent buka/tutup submenu.
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