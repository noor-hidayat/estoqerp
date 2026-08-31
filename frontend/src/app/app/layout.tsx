import { Outlet } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell/shell";
import { queryClient } from "@/lib/api/query-client";

export default function AppLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Outlet />
      </AppShell>
    </QueryClientProvider>
  );
}