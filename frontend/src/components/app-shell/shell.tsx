"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { ShellLoader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
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
          className={cn(
            "min-w-0 flex-1 min-h-0 overflow-y-auto px-4 pt-8 sm:px-8 sm:pt-10",
            isAiChat
              ? "pb-0"
              : "pb-[calc(80px+env(safe-area-inset-bottom))] lg:pb-10"
          )}
        >
          {children}
        </main>
      </SidebarInset>
      <BottomNav />
    </SidebarProvider>
  );
}