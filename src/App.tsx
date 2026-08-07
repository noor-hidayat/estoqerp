import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider } from "@/lib/session";

import LoginPage from "@/app/login/page";
import AppLayout from "@/app/app/layout";
import DashboardPage from "@/app/app/page";
import OpnamePage from "@/app/app/opname/page";
import NewOpnamePage from "@/app/app/opname/new/page";
import ApprovalListPage from "@/app/app/opname/approval/page";
import VarianceListPage from "@/app/app/opname/variance/page";
import ProjectLayout from "@/app/app/opname/[id]/layout";
import ProjectDetailPage from "@/app/app/opname/[id]/page";
import ScanPage from "@/app/app/opname/[id]/scan/page";
import ProjectVariancePage from "@/app/app/opname/[id]/variance/page";
import ApprovalDetailPage from "@/app/app/opname/[id]/approval/page";
import ReportsPage from "@/app/app/reports/page";
import ReportsHistoryPage from "@/app/app/reports/history/page";
import ReportsLocationsPage from "@/app/app/reports/locations/page";
import ReportsSummaryPage from "@/app/app/reports/summary/page";
import ReportsVariancePage from "@/app/app/reports/variance/page";
import BranchesPage from "@/app/app/setup/branches/page";
import ItemsPage from "@/app/app/setup/items/page";
import LocationsPage from "@/app/app/setup/locations/page";
import UsersPage from "@/app/app/setup/users/page";
import BarcodeFormatsPage from "@/app/app/setup/barcode-formats/page";
import BarcodeFormatNewPage from "@/app/app/setup/barcode-formats/new/page";
import BarcodeFormatDetailPage from "@/app/app/setup/barcode-formats/[id]/page";

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
          <Route path="opname/approval" element={<ApprovalListPage />} />
          <Route path="opname/variance" element={<VarianceListPage />} />
          <Route path="opname/:id" element={<ProjectLayout />}>
            <Route index element={<ProjectDetailPage />} />
            <Route path="scan" element={<ScanPage />} />
            <Route path="variance" element={<ProjectVariancePage />} />
            <Route path="approval" element={<ApprovalDetailPage />} />
          </Route>
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/history" element={<ReportsHistoryPage />} />
          <Route path="reports/locations" element={<ReportsLocationsPage />} />
          <Route path="reports/summary" element={<ReportsSummaryPage />} />
          <Route path="reports/variance" element={<ReportsVariancePage />} />
          <Route path="setup/branches" element={<BranchesPage />} />
          <Route path="setup/items" element={<ItemsPage />} />
          <Route path="setup/locations" element={<LocationsPage />} />
          <Route path="setup/users" element={<UsersPage />} />
          <Route path="setup/barcode-formats" element={<BarcodeFormatsPage />} />
          <Route path="setup/barcode-formats/new" element={<BarcodeFormatNewPage />} />
          <Route path="setup/barcode-formats/:id" element={<BarcodeFormatDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </SessionProvider>
  );
}
