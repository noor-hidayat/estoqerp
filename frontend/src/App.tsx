import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { navForPermissions } from "@/components/app-shell/nav";

import LoginPage from "@/app/login/page";
import AppLayout from "@/app/app/layout";
import DashboardPage from "@/app/app/page";
import OpnamePage from "@/app/app/opname/page";
import NewOpnamePage from "@/app/app/opname/new/page";
import VarianceListPage from "@/app/app/opname/variance/page";
import ProjectLayout from "@/app/app/opname/[id]/layout";
import ProjectDetailPage from "@/app/app/opname/[id]/page";
import ScanPage from "@/app/app/opname/[id]/scan/page";
import ProjectVariancePage from "@/app/app/opname/[id]/variance/page";
import ScanSessionsPage from "@/app/app/opname/[id]/sessions/page";
import ScanSessionDetailPage from "@/app/app/opname/[id]/sessions/[sessionId]/page";
import ReportsPage from "@/app/app/reports/page";
import ReportsProjectPage from "@/app/app/reports/project/page";
import ReportsHistoryPage from "@/app/app/reports/history/page";
import ReportsSummaryPage from "@/app/app/reports/summary/page";
import ReportsVariancePage from "@/app/app/reports/variance/page";
import StockBalancePage from "@/app/app/stock/balance/page";
import StockPage from "@/app/app/stock/page";
import StockLocationsPage from "@/app/app/stock/locations/page";
import StockBranchesPage from "@/app/app/stock/branches/page";
import StockWarehousesPage from "@/app/app/stock/warehouses/page";
import CategoriesPage from "@/app/app/setup/categories/page";
import ItemsPage from "@/app/app/setup/items/page";
import SetupPage from "@/app/app/setup/page";
import BarcodeFormatsPage from "@/app/app/setup/barcode-formats/page";
import BarcodeFormatNewPage from "@/app/app/setup/barcode-formats/new/page";
import BarcodeFormatDetailPage from "@/app/app/setup/barcode-formats/[id]/page";
import UsersPage from "@/app/app/settings/users/page";
import RolesPage from "@/app/app/settings/roles/page";
import NewRolePage from "@/app/app/settings/roles/new/page";
import EditRolePage from "@/app/app/settings/roles/[id]/page";
import SettingsPage from "@/app/app/settings/page";

/** Halaman pertama "/app" — Dashboard bila punya aksesnya, selain itu
 *  diarahkan ke menu pertama yang boleh dibuka role-nya. */
function HomeRoute() {
  const { isSystem, permissions, loading } = useSession();
  if (loading) return null;
  if (can(isSystem, permissions, "dashboard", "view")) {
    return <DashboardPage />;
  }
  const firstHref =
    navForPermissions((menu) => can(isSystem, permissions, menu, "view"))
      .flatMap((g) => g.items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]))
      .find((href) => href !== "/app") ?? "/app/opname";
  return <Navigate to={firstHref} replace />;
}

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route path="/app" element={<AppLayout />}>
          <Route index element={<HomeRoute />} />
          <Route path="opname" element={<OpnamePage />} />
          <Route path="opname/new" element={<NewOpnamePage />} />
          <Route path="opname/variance" element={<VarianceListPage />} />
          <Route path="opname/:id" element={<ProjectLayout />}>
            <Route index element={<ProjectDetailPage />} />
            <Route path="variance" element={<ProjectVariancePage />} />
            <Route
              path="sessions"
              element={<ScanSessionsPage />}
            />
          </Route>
          <Route
            path="opname/:id/sessions/:sessionId"
            element={<ScanSessionDetailPage />}
          />
          <Route path="opname/:id/scan" element={<ScanPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/project" element={<ReportsProjectPage />} />
          <Route path="reports/history" element={<ReportsHistoryPage />} />
          <Route path="reports/summary" element={<ReportsSummaryPage />} />
          <Route path="reports/variance" element={<ReportsVariancePage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="stock/balance" element={<StockBalancePage />} />
          <Route path="stock/locations" element={<StockLocationsPage />} />
          <Route path="stock/branches" element={<StockBranchesPage />} />
          <Route path="stock/warehouses" element={<StockWarehousesPage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="setup/categories" element={<CategoriesPage />} />
          <Route path="setup/items" element={<ItemsPage />} />
          <Route path="setup/barcode-formats" element={<BarcodeFormatsPage />} />
          <Route path="setup/barcode-formats/new" element={<BarcodeFormatNewPage />} />
          <Route path="setup/barcode-formats/:id" element={<BarcodeFormatDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/users" element={<UsersPage />} />
          <Route path="settings/roles" element={<RolesPage />} />
          <Route path="settings/roles/new" element={<NewRolePage />} />
          <Route path="settings/roles/:id" element={<EditRolePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </SessionProvider>
  );
}
