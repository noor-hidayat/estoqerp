"use client"

import type * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { navForPermissions } from "@/components/app-shell/nav"
import { useSession } from "@/lib/session"
import { can } from "@/lib/permissions"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isSystem, permissions } = useSession()
  const canView = (menu: string) => can(isSystem, permissions, menu, "view")
  const groups = navForPermissions(canView)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={groups} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}