import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/lib/session";

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
import ScanSessionDetailPage from "@/app/app/opname/[id]/sessions/[sessionId]/page";
import ReportsPage from "@/app/app/reports/page";
import ReportsProjectPage from "@/app/app/reports/project/page";
import ReportsHistoryPage from "@/app/app/reports/history/page";
import ReportsSummaryPage from "@/app/app/reports/summary/page";
import ReportsVariancePage from "@/app/app/reports/variance/page";
import StockLedgerPage from "@/app/app/stock/page";
import CategoriesPage from "@/app/app/setup/categories/page";
import BranchesPage from "@/app/app/setup/branches/page";
import ItemsPage from "@/app/app/setup/items/page";
import LocationsPage from "@/app/app/setup/locations/page";
import UsersPage from "@/app/app/settings/users/page";
import SettingsPage from "@/app/app/settings/page";
import BarcodeFormatsPage from "@/app/app/settings/barcode-formats/page";
import BarcodeFormatNewPage from "@/app/app/settings/barcode-formats/new/page";
import BarcodeFormatDetailPage from "@/app/app/settings/barcode-formats/[id]/page";

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route path="/app" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="opname" element={<OpnamePage />} />
          <Route path="opname/new" element={<NewOpnamePage />} />
          <Route path="opname/variance" element={<VarianceListPage />} />
          <Route path="opname/:id" element={<ProjectLayout />}>
            <Route index element={<ProjectDetailPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="variance" element={<ProjectVariancePage />} />
            <Route
              path="sessions/:sessionId"
              element={<ScanSessionDetailPage />}
            />
          </Route>
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/project" element={<ReportsProjectPage />} />
          <Route path="reports/history" element={<ReportsHistoryPage />} />
          <Route path="reports/summary" element={<ReportsSummaryPage />} />
          <Route path="reports/variance" element={<ReportsVariancePage />} />
          <Route path="stock" element={<StockLedgerPage />} />
          <Route path="setup/categories" element={<CategoriesPage />} />
          <Route path="setup/branches" element={<BranchesPage />} />
          <Route path="setup/items" element={<ItemsPage />} />
          <Route path="setup/locations" element={<LocationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/users" element={<UsersPage />} />
          <Route path="settings/barcode-formats" element={<BarcodeFormatsPage />} />
          <Route path="settings/barcode-formats/new" element={<BarcodeFormatNewPage />} />
          <Route path="settings/barcode-formats/:id" element={<BarcodeFormatDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </SessionProvider>
  );
}
