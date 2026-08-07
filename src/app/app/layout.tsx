import { Outlet } from "react-router-dom";
import { AppShell } from "@/components/app-shell/shell";
import { DBProvider } from "@/lib/supabase/db-provider";

export default function AppLayout() {
  return (
    <DBProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </DBProvider>
  );
}
