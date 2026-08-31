import { Navigate, Route, Routes } from "react-router-dom";
import { SessionProvider, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { navForPermissions } from "@/components/app-shell/nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

import LoginPage from "@/app/login/page";
import AppLayout from "@/app/app/layout";
import DashboardPage from "@/app/app/page";

import OpnamePage from "@/app/app/so/page";
import NewOpnamePage from "@/app/app/so/new/page";
import VarianceListPage from "@/app/app/so/variance/page";
import StockOpnameWarehousePage from "@/app/app/project/warehouse/page";
import CountPage from "@/app/app/so/count/page";
import CountDetailPage from "@/app/app/so/count/[id]/page";
import ProjectsPage from "@/app/app/project/page";
import NewProjectPage from "@/app/app/project/new/page";
import ReportsPage from "@/app/app/report/page";
import ReportsProjectPage from "@/app/app/report/project/page";
import ReportsHistoryPage from "@/app/app/report/history/page";
import ReportsSummaryPage from "@/app/app/report/summary/page";
import ReportsVariancePage from "@/app/app/report/variance/page";
import StockBalancePage from "@/app/app/inventory/balance/page";
import StockPage from "@/app/app/inventory/page";
import TransactionsPage from "@/app/app/transaction/page";
import NewTransactionPage from "@/app/app/transaction/new/page";
import TransactionDetailPage from "@/app/app/transaction/[id]/page";
import StockLedgerPage from "@/app/app/inventory/ledger/page";
import BatchesPage from "@/app/app/inventory/batches/page";
import BatchBarcodesPage from "@/app/app/inventory/batches/barcode/page";
import StockLocationsPage from "@/app/app/setup/locations/page";
import NewLocationPage from "@/app/app/setup/locations/new/page";
import EditLocationPage from "@/app/app/setup/locations/[id]/page";
import StockBranchesPage from "@/app/app/setup/branches/page";
import NewBranchPage from "@/app/app/setup/branches/new/page";
import EditBranchPage from "@/app/app/setup/branches/[id]/page";
import StockWarehousesPage from "@/app/app/setup/warehouses/page";
import NewWarehousePage from "@/app/app/setup/warehouses/new/page";
import EditWarehousePage from "@/app/app/setup/warehouses/[id]/page";
import ItemGroupsPage from "@/app/app/setup/item-groups/page";
import NewItemGroupPage from "@/app/app/setup/item-groups/new/page";
import EditItemGroupPage from "@/app/app/setup/item-groups/[id]/page";
import UomPage from "@/app/app/setup/uom/page";
import NewUomPage from "@/app/app/setup/uom/new/page";
import EditUomPage from "@/app/app/setup/uom/[id]/page";
import TransactionTypesPage from "@/app/app/setup/transaction-types/page";
import NewTransactionTypePage from "@/app/app/setup/transaction-types/new/page";
import EditTransactionTypePage from "@/app/app/setup/transaction-types/[id]/page";
import ItemsPage from "@/app/app/setup/items/page";
import NewItemPage from "@/app/app/setup/items/new/page";
import EditItemPage from "@/app/app/setup/items/[id]/page";
import SetupPage from "@/app/app/setup/page";
import BarcodeFormatsPage from "@/app/app/setup/barcode-formats/page";
import BarcodeFormatNewPage from "@/app/app/setup/barcode-formats/new/page";
import BarcodeFormatDetailPage from "@/app/app/setup/barcode-formats/[id]/page";
import BatchFormatsPage from "@/app/app/setup/batch-formats/page";
import BatchFormatNewPage from "@/app/app/setup/batch-formats/new/page";
import BatchFormatDetailPage from "@/app/app/setup/batch-formats/[id]/page";
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
import SuppliersPage from "@/app/app/suppliers/page";
import CustomersPage from "@/app/app/customers/page";
import PurchaseOrdersPage from "@/app/app/purchase-orders/page";
import NewPurchaseOrderPage from "@/app/app/purchase-orders/new/page";
import PurchaseOrderDetailPage from "@/app/app/purchase-orders/[id]/page";
import SalesOrdersPage from "@/app/app/sales-orders/page";
import NewSalesOrderPage from "@/app/app/sales-orders/new/page";
import SalesOrderDetailPage from "@/app/app/sales-orders/[id]/page";
import GoodsReceiptsPage from "@/app/app/goods-receipts/page";
import NewGoodsReceiptPage from "@/app/app/goods-receipts/new/page";
import GoodsReceiptDetailPage from "@/app/app/goods-receipts/[id]/page";

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
          
          <Route path="project" element={<ProjectsPage />} />
          <Route path="project/new" element={<NewProjectPage />} />
          <Route path="so" element={<OpnamePage />} />
          <Route path="so/new" element={<NewOpnamePage />} />
          <Route path="so/variance" element={<VarianceListPage />} />
          <Route path="project/warehouse" element={<StockOpnameWarehousePage />} />
          <Route path="so/count" element={<CountPage />} />
          <Route path="so/count/:id" element={<CountDetailPage />} />
          <Route path="report" element={<ReportsPage />} />
          <Route path="report/project" element={<ReportsProjectPage />} />
          <Route path="report/history" element={<ReportsHistoryPage />} />
          <Route path="report/summary" element={<ReportsSummaryPage />} />
          <Route path="report/variance" element={<ReportsVariancePage />} />
          <Route path="inventory" element={<StockPage />} />
          <Route path="inventory/balance" element={<StockBalancePage />} />
          <Route path="transaction" element={<TransactionsPage />} />
          <Route path="transaction/new" element={<NewTransactionPage />} />
          <Route path="transaction/:id" element={<TransactionDetailPage />} />
          <Route path="inventory/ledger" element={<StockLedgerPage />} />
          <Route path="inventory/batches" element={<BatchesPage />} />
          <Route path="inventory/batches/barcode" element={<BatchBarcodesPage />} />
          <Route path="setup/locations" element={<StockLocationsPage />} />
          <Route path="setup/locations/new" element={<NewLocationPage />} />
          <Route path="setup/locations/:id" element={<EditLocationPage />} />
          <Route path="setup/branches" element={<StockBranchesPage />} />
          <Route path="setup/branches/new" element={<NewBranchPage />} />
          <Route path="setup/branches/:id" element={<EditBranchPage />} />
          <Route path="setup/warehouses" element={<StockWarehousesPage />} />
          <Route path="setup/warehouses/new" element={<NewWarehousePage />} />
          <Route path="setup/warehouses/:id" element={<EditWarehousePage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="setup/item-groups" element={<ItemGroupsPage />} />
          <Route path="setup/item-groups/new" element={<NewItemGroupPage />} />
          <Route path="setup/item-groups/:id" element={<EditItemGroupPage />} />
          <Route path="setup/uom" element={<UomPage />} />
          <Route path="setup/uom/new" element={<NewUomPage />} />
          <Route path="setup/uom/:id" element={<EditUomPage />} />
          <Route path="setup/transaction-types" element={<TransactionTypesPage />} />
          <Route path="setup/transaction-types/new" element={<NewTransactionTypePage />} />
          <Route path="setup/transaction-types/:id" element={<EditTransactionTypePage />} />
          <Route path="setup/items" element={<ItemsPage />} />
          <Route path="setup/items/new" element={<NewItemPage />} />
          <Route path="setup/items/:id" element={<EditItemPage />} />
          <Route path="setup/barcode-formats" element={<BarcodeFormatsPage />} />
          <Route path="setup/barcode-formats/new" element={<BarcodeFormatNewPage />} />
          <Route path="setup/barcode-formats/:id" element={<BarcodeFormatDetailPage />} />
          <Route path="setup/batch-formats" element={<BatchFormatsPage />} />
          <Route path="setup/batch-formats/new" element={<BatchFormatNewPage />} />
          <Route path="setup/batch-formats/:id" element={<BatchFormatDetailPage />} />
          {/* Legacy redirect: /app/data-library/* -> /app/setup/* */}
          <Route path="data-library/*" element={<Navigate to="/app/setup" replace />} />
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
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
          <Route path="purchase-orders/new" element={<NewPurchaseOrderPage />} />
          <Route path="purchase-orders/:id" element={<PurchaseOrderDetailPage />} />
          <Route path="sales-orders" element={<SalesOrdersPage />} />
          <Route path="sales-orders/new" element={<NewSalesOrderPage />} />
          <Route path="sales-orders/:id" element={<SalesOrderDetailPage />} />
          <Route path="goods-receipts" element={<GoodsReceiptsPage />} />
          <Route path="goods-receipts/new" element={<NewGoodsReceiptPage />} />
          <Route path="goods-receipts/:id" element={<GoodsReceiptDetailPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </TooltipProvider>
      <Toaster />
    </SessionProvider>
  );
}