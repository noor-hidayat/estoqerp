import type * as React from "react"

import { NavMain } from "@/components/layout/nav-main"
import { TeamSwitcher } from "@/components/layout/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { navForPermissions } from "@/components/layout/nav"
import { useSession } from "@/lib/session"
import { can } from "@/lib/permissions"
import { useActiveWorkspace } from "@/hooks/use-workspace"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isSystem, permissions } = useSession()
  const { active, activeId } = useActiveWorkspace()
  const canView = (menu: string) => can(isSystem, permissions, menu, "view")
  const canManage = (menu: string) => can(isSystem, permissions, menu, "manage")
  // Struktur dedicated dipicu key wsp-* ; workspace lain tidak difilter (fallback).
  const wsCode = (active as unknown as { code?: string } | null)?.code;
  const wsKey =
    wsCode === "warehouse"
      ? "wsp-warehouse"
      : wsCode === "quality"
        ? "wsp-quality"
        : wsCode === "purchasing"
          ? "wsp-purchasing"
          : wsCode === "marketing"
            ? "wsp-marketing"
            : activeId ?? null
  let groups = navForPermissions(canView, canManage, wsKey)
  // Administrator tidak memiliki My Account
  if (isSystem) {
    groups = groups
      .map((g) => ({
        ...g,
        items: g.items
          .map((it) => ({
            ...it,
            children: it.children?.filter((c) => c.menu !== "account" && c.menu !== "settings.account"),
          }))
          .filter((it) => it.menu !== "account" && it.menu !== "settings.account"),
      }))
      .filter((g) => g.items.length > 0)
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}