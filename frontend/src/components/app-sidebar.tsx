"use client"

import type * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { navForPermissions } from "@/components/app-shell/nav"
import { useSession } from "@/lib/session"
import { can } from "@/lib/permissions"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { isSystem, permissions } = useSession()
  const canView = (menu: string) => can(isSystem, permissions, menu, "view")
  const groups = navForPermissions(canView)
  const showAi = canView("ai")
  const pathname = usePathname()
  const aiActive = pathname === "/app/ai" || pathname.startsWith("/app/ai/")

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      {showAi && (
        <>
          <div className="px-2 pb-1 pt-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={aiActive}
                  tooltip="AI Assistant"
                >
                  <Link href="/app/ai">
                    <Bot />
                    <span>AI Assistant</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
          <SidebarSeparator className="mx-2" />
        </>
      )}
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