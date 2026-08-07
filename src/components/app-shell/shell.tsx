"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { useSession } from "@/lib/session";
import { SidebarContent } from "./sidebar";
import { Topbar } from "./topbar";
import { ShellLoader } from "@/components/ui/loader";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return <ShellLoader />;

  return (
    <div className="min-h-[100dvh] bg-zinc-50">
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-[264px] lg:flex-col lg:border-r lg:border-zinc-200/70 lg:bg-white">
        <SidebarContent role={user.role} />
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
              className="fixed inset-y-0 left-0 z-50 w-[280px] bg-white shadow-2xl lg:hidden"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ type: "spring", stiffness: 340, damping: 34 }}
            >
              <button
                onClick={() => setDrawerOpen(false)}
                className="absolute right-3 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100"
              >
                <X size={16} weight="bold" />
              </button>
              <SidebarContent role={user.role} onNavigate={() => setDrawerOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[264px]">
        <Topbar onMenu={() => setDrawerOpen(true)} />
        <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
