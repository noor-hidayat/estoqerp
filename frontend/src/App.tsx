import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { navForPermissions } from "@/components/app-shell/nav";
import { TooltipProvider } from "@/components/ui/tooltip";

import LoginPage from "@/app/login/page";
import AppLayout from "@/app/app/layout";
import DashboardPage from "@/app/app/page";
import OpnamePage from "@/app/app/so/page";
import NewOpnamePage from "@/app/app/so/new/page";
import VarianceListPage from "@/app/app/so/variance/page";
import ProjectLayout from "@/app/app/so/[id]/layout";
import ProjectDetailPage from "@/app/app/so/[id]/page";
import ScanPage from "@/app/app/so/[id]/scan/page";
import ProjectVariancePage from "@/app/app/so/[id]/variance/page";
import ScanSessionsPage from "@/app/app/so/[id]/sessions/page";
import ScanSessionDetailPage from "@/app/app/so/[id]/sessions/[sessionId]/page";
import ProjectsPage from "@/app/app/projects/page";
import NewProjectPage from "@/app/app/projects/new/page";
import ProjectParentDetailPage from "@/app/app/projects/[id]/page";
import ReportsPage from "@/app/app/reports/page";
import ReportsProjectPage from "@/app/app/reports/project/page";
import ReportsHistoryPage from "@/app/app/reports/history/page";
import ReportsSummaryPage from "@/app/app/reports/summary/page";
import ReportsVariancePage from "@/app/app/reports/variance/page";
import StockBalancePage from "@/app/app/stock/balance/page";
import StockPage from "@/app/app/stock/page";
import StockLocationsPage from "@/app/app/stock/locations/page";
import NewLocationPage from "@/app/app/stock/locations/new/page";
import EditLocationPage from "@/app/app/stock/locations/[id]/page";
import StockBranchesPage from "@/app/app/stock/branches/page";
import NewBranchPage from "@/app/app/stock/branches/new/page";
import EditBranchPage from "@/app/app/stock/branches/[id]/page";
import StockWarehousesPage from "@/app/app/stock/warehouses/page";
import NewWarehousePage from "@/app/app/stock/warehouses/new/page";
import EditWarehousePage from "@/app/app/stock/warehouses/[id]/page";
import CategoriesPage from "@/app/app/setup/categories/page";
import NewCategoryPage from "@/app/app/setup/categories/new/page";
import EditCategoryPage from "@/app/app/setup/categories/[id]/page";
import ItemsPage from "@/app/app/setup/items/page";
import NewItemPage from "@/app/app/setup/items/new/page";
import EditItemPage from "@/app/app/setup/items/[id]/page";
import SetupPage from "@/app/app/setup/page";
import BarcodeFormatsPage from "@/app/app/setup/barcode-formats/page";
import BarcodeFormatNewPage from "@/app/app/setup/barcode-formats/new/page";
import BarcodeFormatDetailPage from "@/app/app/setup/barcode-formats/[id]/page";
import UsersPage from "@/app/app/settings/users/page";
import NewUserPage from "@/app/app/settings/users/new/page";
import EditUserPage from "@/app/app/settings/users/[id]/page";
import RolesPage from "@/app/app/settings/roles/page";
import NewRolePage from "@/app/app/settings/roles/new/page";
import EditRolePage from "@/app/app/settings/roles/[id]/page";
import ImportDataPage from "@/app/app/settings/import/page";
import AiSettingsPage from "@/app/app/settings/ai/page";
import SettingsPage from "@/app/app/settings/page";
import AiChatPage from "@/app/app/ai/page";

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
      .find((href) => href !== "/app") ?? "/app/so";
  return <Navigate to={firstHref} replace />;
}

export default function App() {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={200}>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route path="/app" element={<AppLayout />}>
          <Route index element={<HomeRoute />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<NewProjectPage />} />
          <Route path="projects/:id" element={<ProjectParentDetailPage />} />
          <Route path="so" element={<OpnamePage />} />
          <Route path="so/new" element={<NewOpnamePage />} />
          <Route path="so/variance" element={<VarianceListPage />} />
          <Route path="so/:id" element={<ProjectLayout />}>
            <Route index element={<ProjectDetailPage />} />
            <Route path="variance" element={<ProjectVariancePage />} />
            <Route
              path="sessions"
              element={<ScanSessionsPage />}
            />
          </Route>
          <Route
            path="so/:id/sessions/:sessionId"
            element={<ScanSessionDetailPage />}
          />
          <Route path="so/:id/scan" element={<ScanPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/project" element={<ReportsProjectPage />} />
          <Route path="reports/history" element={<ReportsHistoryPage />} />
          <Route path="reports/summary" element={<ReportsSummaryPage />} />
          <Route path="reports/variance" element={<ReportsVariancePage />} />
          <Route path="stock" element={<StockPage />} />
          <Route path="stock/balance" element={<StockBalancePage />} />
          <Route path="stock/locations" element={<StockLocationsPage />} />
          <Route path="stock/locations/new" element={<NewLocationPage />} />
          <Route path="stock/locations/:id" element={<EditLocationPage />} />
          <Route path="stock/branches" element={<StockBranchesPage />} />
          <Route path="stock/branches/new" element={<NewBranchPage />} />
          <Route path="stock/branches/:id" element={<EditBranchPage />} />
          <Route path="stock/warehouses" element={<StockWarehousesPage />} />
          <Route path="stock/warehouses/new" element={<NewWarehousePage />} />
          <Route path="stock/warehouses/:id" element={<EditWarehousePage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="setup/categories" element={<CategoriesPage />} />
          <Route path="setup/categories/new" element={<NewCategoryPage />} />
          <Route path="setup/categories/:id" element={<EditCategoryPage />} />
          <Route path="setup/items" element={<ItemsPage />} />
          <Route path="setup/items/new" element={<NewItemPage />} />
          <Route path="setup/items/:id" element={<EditItemPage />} />
          <Route path="setup/barcode-formats" element={<BarcodeFormatsPage />} />
          <Route path="setup/barcode-formats/new" element={<BarcodeFormatNewPage />} />
          <Route path="setup/barcode-formats/:id" element={<BarcodeFormatDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/users" element={<UsersPage />} />
          <Route path="settings/users/new" element={<NewUserPage />} />
          <Route path="settings/users/:id" element={<EditUserPage />} />
          <Route path="settings/roles" element={<RolesPage />} />
          <Route path="settings/roles/new" element={<NewRolePage />} />
          <Route path="settings/roles/:id" element={<EditRolePage />} />
          <Route path="settings/import" element={<ImportDataPage />} />
          <Route path="settings/ai" element={<AiSettingsPage />} />
          <Route path="ai" element={<AiChatPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </TooltipProvider>
    </SessionProvider>
  );
}
