import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { navForPermissions } from "@/components/app-shell/nav";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "./topbar";
import { ShellLoader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { AccessDenied } from "@/components/ui/role-guard";

function RouteGuard({ children }: { children: ReactNode }) {
  const { isSystem, permissions } = useSession();
  const { pathname } = useLocation();
  // Map pathname prefix to required menu (reuse navForPermissions logic for exact match)
  // Simple heuristic: find NAV item whose href is prefix of pathname
  const requiredMenu = (() => {
    // Normalize pathname: remove trailing slash, decode
    const path = decodeURIComponent(pathname);
    // Collect all href->menu from nav
    const all: Array<{ href: string; menu: string }> = navForPermissions(() => true).flatMap((g) =>
      g.items.flatMap((i: any) => [{ href: i.href as string, menu: i.menu as string }, ...((i.children ?? []) as any[]).map((c: any) => ({ href: c.href as string, menu: c.menu as string }))])
    );
    // Find longest matching href
    let best: { href: string; menu: string } | null = null;
    for (const item of all as Array<{ href: string; menu: string }>) {
      if (path === item.href || path.startsWith(item.href + "/")) {
        if (!best || item.href.length > best.href.length) best = { href: item.href, menu: item.menu };
      }
    }
    // Fallback for dynamic routes not in NAV (e.g., /app/setup/items/new)
    if (!best) {
      if (path.startsWith("/app/setup/items")) return "master.items";
      if (path.startsWith("/app/setup/branches")) return "inventory.branches";
      if (path.startsWith("/app/setup/warehouses")) return "inventory.warehouses";
      if (path.startsWith("/app/setup/locations")) return "inventory.locations";
      if (path.startsWith("/app/setup/item-groups")) return "master.itemGroups";
      if (path.startsWith("/app/setup/uom")) return "master.uom";
      if (path.startsWith("/app/setup/departments")) return "master.departments";
      if (path.startsWith("/app/setup/tax-categories")) return "master";
      if (path.startsWith("/app/setup/price-lists")) return "master";
      if (path.startsWith("/app/setup/barcode-formats")) return "master.barcodeFormats";
      if (path.startsWith("/app/setup/batch-formats")) return "master.batchFormats";
      if (path.startsWith("/app/setup/transaction-types")) return "master.movementTypes";
      if (path.startsWith("/app/setup/document-types")) return "master";
      if (path.startsWith("/app/receiving")) return "supply.receivings";
      if (path.startsWith("/app/qc")) return "supply.receivings";
      if (path.startsWith("/app/goods-receipts")) return "supply.goodsReceipts";
      if (path.startsWith("/app/purchase-orders")) return "supply.purchaseOrders";
      if (path.startsWith("/app/sales-orders")) return "supply.salesOrders";
      if (path.startsWith("/app/deliveries")) return "supply.deliveries";
      if (path.startsWith("/app/suppliers")) return "supply.suppliers";
      if (path.startsWith("/app/customers")) return "supply.customers";
      if (path.startsWith("/app/purchase-requests")) return "supply.purchaseRequests";
      if (path.startsWith("/app/material-requests")) return "supply.materialRequests";
      if (path.startsWith("/app/inventory/balance")) return "inventory.stockBalance";
      if (path.startsWith("/app/inventory/ledger")) return "inventory.stockLedger";
      if (path.startsWith("/app/inventory/batches")) return "inventory.batches";
      if (path.startsWith("/app/transaction")) return "inventory.transactions";
      if (path.startsWith("/app/so") || path.startsWith("/app/project")) return "opname";
      if (path.startsWith("/app/report")) return "reports";
      if (path.startsWith("/app/settings/roles")) return "settings.roles";
      if (path.startsWith("/app/settings/users")) return "settings.users";
      if (path.startsWith("/app/settings/workflows")) return "settings.workflows";
      if (path.startsWith("/app/settings/company")) return "settings.company";
      if (path.startsWith("/app/settings/import")) return "settings.import";
      if (path.startsWith("/app/settings/ai")) return "settings";
      if (path.startsWith("/app/settings/account")) return "account";
      if (path.startsWith("/app/ai")) return "ai";
    }
    // @ts-ignore - TS narrow falsely to never
    return (best as any)?.menu ?? null;
  })();
  if (requiredMenu && !can(isSystem, permissions, requiredMenu, "view")) {
    return <AccessDenied />;
  }
  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const router = { push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1) } as any;
  const { pathname } = useLocation();
  const isAiChat = pathname === "/app/ai";

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return <ShellLoader />;

  return (
    <SidebarProvider className="overflow-hidden">
      <AppSidebar />
      <SidebarInset>
        <Topbar />
        <main
          key={pathname}
          className={cn(
            "min-w-0 flex-1 min-h-0 overflow-y-auto px-4 pt-6 sm:px-8 sm:pt-8 animate-fade-in",
            isAiChat ? "pb-0" : "pb-10"
          )}
        >
          <RouteGuard>{children}</RouteGuard>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}