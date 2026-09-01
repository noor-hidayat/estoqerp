import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSession } from "@/lib/session";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "./topbar";
import { ShellLoader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

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
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}