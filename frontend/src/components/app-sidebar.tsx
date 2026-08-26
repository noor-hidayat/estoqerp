"use client"

import type * as React from "react"

import { NavMain } from "@/components/nav-main"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { navForPermissions } from "@/components/app-shell/nav"
import { useSession } from "@/lib/session"
import { can } from "@/lib/permissions"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isSystem, permissions } = useSession()
  const canView = (menu: string) => can(isSystem, permissions, menu, "view")
  const canManage = (menu: string) => can(isSystem, permissions, menu, "manage")
  const groups = navForPermissions(canView, canManage)

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