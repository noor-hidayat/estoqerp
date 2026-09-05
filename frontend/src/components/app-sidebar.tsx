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
import { useActiveWorkspace } from "@/hooks/use-workspace"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isSystem, permissions } = useSession()
  const { active, activeId } = useActiveWorkspace()
  const canView = (menu: string) => can(isSystem, permissions, menu, "view")
  const canManage = (menu: string) => can(isSystem, permissions, menu, "manage")
  // Struktur warehouse baru dipicu key "wsp-warehouse"; workspace lain tidak difilter (perilaku lama).
  const wsKey =
    (active as unknown as { code?: string } | null)?.code === "warehouse" ? "wsp-warehouse" : activeId ?? null
  const groups = navForPermissions(canView, canManage, wsKey)

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