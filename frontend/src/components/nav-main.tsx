"use client"

import { useEffect, useRef, useState } from "react"
import {
  Archive,
  ArrowLeftRight,
  ArrowRightLeft,
  Barcode,
  Boxes,
  Building2,
  ChartColumn,
  ChevronRight,
  Database,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  History,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  MapPin,
  NotebookText,
  Package,
  Settings,
  SquareAsterisk,
  Tag,
  TriangleAlert,
  Users,
  Warehouse,
  Bot,
  ClipboardList,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

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
}

function isActive(href: string, pathname: string): boolean {
  return href === "/app"
    ? pathname === "/app"
    : pathname === href || pathname.startsWith(href + "/")
}

export function NavMain({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname()
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
        <SidebarGroup key={group.title}>
          {!isCollapsed &&
          (group.title === "Menu" || group.title === "Settings") ? (
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
                      <Link href={item.href}>
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

  // Mode kecil (ikon): klik parent langsung menuju halamannya
  // (mis. /app/data-library), bukan membuka submenu.
  if (isCollapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isItemActive} tooltip={item.label}>
          <Link href={item.href}>
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
                  <Link href={child.href}>
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