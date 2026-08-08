"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useSession } from "@/lib/session";
import { SidebarContent } from "./sidebar";
import { Topbar } from "./topbar";
import { ShellLoader } from "@/components/ui/loader";
import { cx } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return <ShellLoader />;

  return (
    <div className="min-h-[100dvh] bg-[#f7f6f3]">
      <div
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
        className={cx(
          "hidden lg:fixed lg:left-0 lg:top-16 lg:bottom-0 lg:z-40 lg:flex lg:flex-col lg:border-r lg:border-zinc-200 lg:bg-[#f7f6f3] lg:transition-[width] lg:duration-300 lg:ease-[cubic-bezier(0.4,0,0.2,1)] lg:shadow-2xl",
          sidebarHovered ? "lg:w-[232px]" : "lg:w-[68px]"
        )}
      >
        <SidebarContent role={user.role} collapsed={!sidebarHovered} />
      </div>

      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-[280px] bg-[#f7f6f3] shadow-2xl lg:hidden"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200/70 hover:text-zinc-900"
              >
                <X size={16} strokeWidth={2.2} />
              </button>
              <SidebarContent role={user.role} onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div>
        <Topbar onMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10 lg:pl-[76px] lg:pr-8">
          {children}
        </main>
      </div>
    </div>
  );
}
