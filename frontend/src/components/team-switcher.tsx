import { Check, ChevronsUpDown, ClipboardList, Megaphone, ShoppingCart, Warehouse } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { BrandMark } from "@/components/app-shell/sidebar"
import { useActiveWorkspace } from "@/hooks/use-workspace"

const WS_ICONS: Record<string, React.ElementType> = {
  ClipboardList,
  Warehouse,
  ShoppingCart,
  Megaphone,
  Layers: Warehouse,
};

function WsIcon({ name, className }: { name: string; className?: string }) {
  const Icon = WS_ICONS[name] ?? Warehouse;
  return <Icon className={className} />;
}

export function TeamSwitcher() {
  const { isMobile } = useSidebar()
  const { workspaces, active, setActiveId } = useActiveWorkspace()

  const activeIcon = active?.icon ?? "Warehouse"
  const activeLabel = active?.name ?? "Estoq"
  const activeDesc = (active as unknown as { description?: string })?.description ?? "Warehouse"

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <WsIcon name={activeIcon} className="size-5" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{activeLabel}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeDesc}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspace
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workspaces.length === 0 ? (
              <DropdownMenuItem disabled className="gap-2 p-2">
                <BrandMark className="size-5" />
                <span className="font-medium">Estoq</span>
              </DropdownMenuItem>
            ) : (
              workspaces.map((ws) => {
                const isActive = ws.id === active?.id
                return (
                  <DropdownMenuItem
                    key={ws.id}
                    onClick={() => setActiveId(ws.id)}
                    className="gap-2 p-2"
                  >
                    <WsIcon name={(ws as unknown as { icon: string }).icon} className="size-4" />
                    <span className="flex-1 font-medium">{ws.name}</span>
                    {isActive && <Check className="size-4 text-primary" />}
                  </DropdownMenuItem>
                )
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}