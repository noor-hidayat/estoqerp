import { lazy, Suspense, useTransition } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { SessionProvider, useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { navForPermissions } from "@/components/app-shell/nav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { TableSkeleton, FormSkeleton, DetailSkeleton, ChatSkeleton, TableWithKpiSkeleton } from "@/components/ui/loader";

import LoginPage from "@/app/login/page";
import AppLayout from "@/app/app/layout";
import DashboardPage from "@/app/app/page";

// Lazy — hanya download saat menu dibuka (dashboard tetap eager + chart)
const OpnamePage = lazy(() => import("@/app/app/so/page"));
const NewOpnamePage = lazy(() => import("@/app/app/so/new/page"));
const VarianceListPage = lazy(() => import("@/app/app/so/variance/page"));
const StockOpnameWarehousePage = lazy(() => import("@/app/app/project/warehouse/page"));
const CountPage = lazy(() => import("@/app/app/so/count/page"));
const CountDetailPage = lazy(() => import("@/app/app/so/count/[id]/page"));
const ProjectsPage = lazy(() => import("@/app/app/project/page"));
const NewProjectPage = lazy(() => import("@/app/app/project/new/page"));
const ReportsProjectPage = lazy(() => import("@/app/app/report/project/page"));
const ReportsHistoryPage = lazy(() => import("@/app/app/report/history/page"));
const ReportsSummaryPage = lazy(() => import("@/app/app/report/summary/page"));
const ReportsVariancePage = lazy(() => import("@/app/app/report/variance/page"));
const StockBalancePage = lazy(() => import("@/app/app/inventory/balance/page"));
const TransactionsPage = lazy(() => import("@/app/app/transaction/page"));
const NewTransactionPage = lazy(() => import("@/app/app/transaction/new/page"));
const TransactionDetailPage = lazy(() => import("@/app/app/transaction/[id]/page"));
const StockLedgerPage = lazy(() => import("@/app/app/inventory/ledger/page"));
const BatchesPage = lazy(() => import("@/app/app/inventory/batches/page"));
const BatchBarcodesPage = lazy(() => import("@/app/app/inventory/batches/barcode/page"));
const StockLocationsPage = lazy(() => import("@/app/app/setup/locations/page"));
const NewLocationPage = lazy(() => import("@/app/app/setup/locations/new/page"));
const EditLocationPage = lazy(() => import("@/app/app/setup/locations/[id]/page"));
const StockBranchesPage = lazy(() => import("@/app/app/setup/branches/page"));
const NewBranchPage = lazy(() => import("@/app/app/setup/branches/new/page"));
const EditBranchPage = lazy(() => import("@/app/app/setup/branches/[id]/page"));
const StockWarehousesPage = lazy(() => import("@/app/app/setup/warehouses/page"));
const NewWarehousePage = lazy(() => import("@/app/app/setup/warehouses/new/page"));
const EditWarehousePage = lazy(() => import("@/app/app/setup/warehouses/[id]/page"));
const ItemGroupsPage = lazy(() => import("@/app/app/setup/item-groups/page"));
const NewItemGroupPage = lazy(() => import("@/app/app/setup/item-groups/new/page"));
const EditItemGroupPage = lazy(() => import("@/app/app/setup/item-groups/[id]/page"));
const UomPage = lazy(() => import("@/app/app/setup/uom/page"));
const NewUomPage = lazy(() => import("@/app/app/setup/uom/new/page"));
const EditUomPage = lazy(() => import("@/app/app/setup/uom/[id]/page"));
const TransactionTypesPage = lazy(() => import("@/app/app/setup/transaction-types/page"));
const NewTransactionTypePage = lazy(() => import("@/app/app/setup/transaction-types/new/page"));
const EditTransactionTypePage = lazy(() => import("@/app/app/setup/transaction-types/[id]/page"));
const DocumentTypesPage = lazy(() => import("@/app/app/setup/document-types/page"));
const NewDocumentTypePage = lazy(() => import("@/app/app/setup/document-types/new/page"));
const EditDocumentSeriesPage = lazy(() => import("@/app/app/setup/document-types/[id]/page"));
const ItemsPage = lazy(() => import("@/app/app/setup/items/page"));
const NewItemPage = lazy(() => import("@/app/app/setup/items/new/page"));
const EditItemPage = lazy(() => import("@/app/app/setup/items/[id]/page"));
const BarcodeFormatsPage = lazy(() => import("@/app/app/setup/barcode-formats/page"));
const BarcodeFormatNewPage = lazy(() => import("@/app/app/setup/barcode-formats/new/page"));
const BarcodeFormatDetailPage = lazy(() => import("@/app/app/setup/barcode-formats/[id]/page"));
const BatchFormatsPage = lazy(() => import("@/app/app/setup/batch-formats/page"));
const BatchFormatNewPage = lazy(() => import("@/app/app/setup/batch-formats/new/page"));
const BatchFormatDetailPage = lazy(() => import("@/app/app/setup/batch-formats/[id]/page"));
const TaxCategoriesPage = lazy(() => import("@/app/app/setup/tax-categories/page"));
const NewTaxCategoryPage = lazy(() => import("@/app/app/setup/tax-categories/new/page"));
const EditTaxCategoryPage = lazy(() => import("@/app/app/setup/tax-categories/[id]/page"));
const PriceListsPage = lazy(() => import("@/app/app/setup/price-lists/page"));
const NewPriceListPage = lazy(() => import("@/app/app/setup/price-lists/new/page"));
const EditPriceListPage = lazy(() => import("@/app/app/setup/price-lists/[id]/page"));
const ItemPricelistPage = lazy(() => import("@/app/app/setup/price-lists/items/page"));
const UsersPage = lazy(() => import("@/app/app/settings/users/page"));
const NewUserPage = lazy(() => import("@/app/app/settings/users/new/page"));
const EditUserPage = lazy(() => import("@/app/app/settings/users/[id]/page"));
const RolesPage = lazy(() => import("@/app/app/settings/roles/page"));
const NewRolePage = lazy(() => import("@/app/app/settings/roles/new/page"));
const EditRolePage = lazy(() => import("@/app/app/settings/roles/[id]/page"));
const ImportDataPage = lazy(() => import("@/app/app/settings/import/page"));
const AiSettingsPage = lazy(() => import("@/app/app/settings/ai/page"));
const CompanySettingsPage = lazy(() => import("@/app/app/settings/company/page"));
const AiChatPage = lazy(() => import("@/app/app/ai/page"));
const SuppliersPage = lazy(() => import("@/app/app/suppliers/page"));
const CustomersPage = lazy(() => import("@/app/app/customers/page"));
const PurchaseOrdersPage = lazy(() => import("@/app/app/purchase-orders/page"));
const NewPurchaseOrderPage = lazy(() => import("@/app/app/purchase-orders/new/page"));
const PurchaseOrderDetailPage = lazy(() => import("@/app/app/purchase-orders/[id]/page"));
const SalesOrdersPage = lazy(() => import("@/app/app/sales-orders/page"));
const NewSalesOrderPage = lazy(() => import("@/app/app/sales-orders/new/page"));
const SalesOrderDetailPage = lazy(() => import("@/app/app/sales-orders/[id]/page"));
const GoodsReceiptsPage = lazy(() => import("@/app/app/goods-receipts/page"));
const NewGoodsReceiptPage = lazy(() => import("@/app/app/goods-receipts/new/page"));
const GoodsReceiptDetailPage = lazy(() => import("@/app/app/goods-receipts/[id]/page"));
const DeliveriesPage = lazy(() => import("@/app/app/deliveries/page"));
const NewDeliveryPage = lazy(() => import("@/app/app/deliveries/new/page"));
const DeliveryDetailPage = lazy(() => import("@/app/app/deliveries/[id]/page"));
const InboundReceivingPage = lazy(() => import("@/app/app/receiving/page"));
const NewInboundReceivingPage = lazy(() => import("@/app/app/receiving/new/page"));
const InboundReceivingDetailPage = lazy(() => import("@/app/app/receiving/[id]/page"));
const InboundQcPage = lazy(() => import("@/app/app/qc/page"));
const NewQcInspectionPage = lazy(() => import("@/app/app/qc/new/page"));
const QcInspectionDetailPage = lazy(() => import("@/app/app/qc/[id]/page"));
const InboundPutawayPage = lazy(() => import("@/app/app/putaway/page"));
const SupplierReturnPage = lazy(() => import("@/app/app/supplier-return/page"));
const OutboundPickingPage = lazy(() => import("@/app/app/outbound/picking/page"));
const OutboundPackingPage = lazy(() => import("@/app/app/outbound/packing/page"));
const CustomerReturnPage = lazy(() => import("@/app/app/outbound/customer-return/page"));
const StockAgingReportPage = lazy(() => import("@/app/app/report/stock-aging/page"));
const BatchTraceabilityReportPage = lazy(() => import("@/app/app/report/batch-traceability/page"));
const InventoryValuationReportPage = lazy(() => import("@/app/app/report/inventory-valuation/page"));
const ReceivingReportPage = lazy(() => import("@/app/app/report/receiving/page"));
const DeliveryPerformanceReportPage = lazy(() => import("@/app/app/report/delivery-performance/page"));

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

function LazyPage({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <Suspense fallback={fallback ?? <TableSkeleton />}>{children}</Suspense>;
}

/** Redirect dengan meneruskan param dinamis (mis. :id) ke path tujuan. */
function RedirectTo({ to }: { to: string }) {
  const params = useParams();
  let path = to;
  for (const [k, v] of Object.entries(params)) {
    path = path.replace(`:${k}`, v ?? "");
  }
  return <Navigate to={path} replace />;
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
            
            <Route path="project" element={<LazyPage fallback={<TableSkeleton columns={7} filters={0} />}><ProjectsPage /></LazyPage>} />
            <Route path="project/new" element={<LazyPage fallback={<FormSkeleton fields={7} />}><NewProjectPage /></LazyPage>} />
            <Route path="so" element={<LazyPage fallback={<TableSkeleton columns={6} filters={0} />}><OpnamePage /></LazyPage>} />
            <Route path="so/new" element={<LazyPage fallback={<FormSkeleton fields={5} />}><NewOpnamePage /></LazyPage>} />
            <Route path="so/variance" element={<LazyPage fallback={<TableSkeleton columns={5} filters={1} />}><VarianceListPage /></LazyPage>} />
            <Route path="project/warehouse" element={<LazyPage fallback={<TableSkeleton columns={5} filters={1} />}><StockOpnameWarehousePage /></LazyPage>} />
            <Route path="so/count" element={<LazyPage fallback={<FormSkeleton fields={8} hasTable tableColumns={7} />}><CountPage /></LazyPage>} />
            <Route path="so/count/:id" element={<LazyPage fallback={<FormSkeleton fields={8} hasTable tableColumns={7} />}><CountDetailPage /></LazyPage>} />
            <Route path="report" element={<Navigate to="/app/report/project" replace />} />
            <Route path="report/project" element={<LazyPage fallback={<TableSkeleton columns={8} filters={1} />}><ReportsProjectPage /></LazyPage>} />
            <Route path="report/history" element={<LazyPage fallback={<TableSkeleton columns={7} filters={3} />}><ReportsHistoryPage /></LazyPage>} />
            <Route path="report/summary" element={<LazyPage fallback={<TableSkeleton columns={5} filters={0} hasKpi kpiCount={4} />}><ReportsSummaryPage /></LazyPage>} />
            <Route path="report/variance" element={<LazyPage fallback={<TableSkeleton columns={7} filters={2} />}><ReportsVariancePage /></LazyPage>} />
            <Route path="inventory" element={<Navigate to="/app/inventory/balance" replace />} />
            <Route path="inventory/balance" element={<LazyPage fallback={<TableSkeleton columns={8} filters={1} hasKpi kpiCount={3} />}><StockBalancePage /></LazyPage>} />
            <Route path="transaction" element={<LazyPage fallback={<TableSkeleton columns={6} filters={3} />}><TransactionsPage /></LazyPage>} />
            <Route path="transaction/new" element={<LazyPage fallback={<FormSkeleton fields={6} hasTable tableColumns={5} />}><NewTransactionPage /></LazyPage>} />
            <Route path="transaction/:id" element={<LazyPage fallback={<DetailSkeleton />}><TransactionDetailPage /></LazyPage>} />
            <Route path="inventory/ledger" element={<LazyPage fallback={<TableSkeleton columns={9} filters={4} />}><StockLedgerPage /></LazyPage>} />
            <Route path="inventory/batches" element={<LazyPage fallback={<TableSkeleton columns={9} filters={3} />}><BatchesPage /></LazyPage>} />
            <Route path="inventory/batches/barcode" element={<LazyPage fallback={<TableSkeleton columns={5} filters={3} />}><BatchBarcodesPage /></LazyPage>} />
            <Route path="setup/locations" element={<LazyPage fallback={<TableSkeleton columns={5} filters={1} />}><StockLocationsPage /></LazyPage>} />
            <Route path="setup/locations/new" element={<LazyPage fallback={<FormSkeleton fields={4} />}><NewLocationPage /></LazyPage>} />
            <Route path="setup/locations/:id" element={<LazyPage fallback={<FormSkeleton fields={4} />}><EditLocationPage /></LazyPage>} />
            <Route path="setup/branches" element={<LazyPage fallback={<TableSkeleton columns={5} filters={0} />}><StockBranchesPage /></LazyPage>} />
            <Route path="setup/branches/new" element={<LazyPage fallback={<FormSkeleton fields={3} />}><NewBranchPage /></LazyPage>} />
            <Route path="setup/branches/:id" element={<LazyPage fallback={<FormSkeleton fields={3} />}><EditBranchPage /></LazyPage>} />
            <Route path="setup/warehouses" element={<LazyPage fallback={<TableSkeleton columns={5} filters={0} />}><StockWarehousesPage /></LazyPage>} />
            <Route path="setup/warehouses/new" element={<LazyPage fallback={<FormSkeleton fields={4} />}><NewWarehousePage /></LazyPage>} />
            <Route path="setup/warehouses/:id" element={<LazyPage fallback={<FormSkeleton fields={4} />}><EditWarehousePage /></LazyPage>} />
            <Route path="setup" element={<Navigate to="/app/setup/items" replace />} />
            <Route path="setup/item-groups" element={<LazyPage fallback={<TableSkeleton columns={4} filters={0} />}><ItemGroupsPage /></LazyPage>} />
            <Route path="setup/item-groups/new" element={<LazyPage fallback={<FormSkeleton fields={2} />}><NewItemGroupPage /></LazyPage>} />
            <Route path="setup/item-groups/:id" element={<LazyPage fallback={<FormSkeleton fields={2} />}><EditItemGroupPage /></LazyPage>} />
            <Route path="setup/uom" element={<LazyPage fallback={<TableSkeleton columns={3} filters={0} />}><UomPage /></LazyPage>} />
            <Route path="setup/uom/new" element={<LazyPage fallback={<FormSkeleton fields={2} />}><NewUomPage /></LazyPage>} />
            <Route path="setup/uom/:id" element={<LazyPage fallback={<FormSkeleton fields={2} />}><EditUomPage /></LazyPage>} />
            <Route path="setup/transaction-types" element={<LazyPage fallback={<TableSkeleton columns={5} filters={0} />}><TransactionTypesPage /></LazyPage>} />
            <Route path="setup/transaction-types/new" element={<LazyPage fallback={<FormSkeleton fields={4} />}><NewTransactionTypePage /></LazyPage>} />
            <Route path="setup/transaction-types/:id" element={<LazyPage fallback={<FormSkeleton fields={4} />}><EditTransactionTypePage /></LazyPage>} />
            <Route path="setup/document-types" element={<LazyPage fallback={<TableSkeleton columns={6} filters={0} />}><DocumentTypesPage /></LazyPage>} />
            <Route path="setup/document-types/new" element={<LazyPage fallback={<FormSkeleton fields={6} />}><NewDocumentTypePage /></LazyPage>} />
            <Route path="setup/document-types/:id" element={<LazyPage fallback={<FormSkeleton fields={6} />}><EditDocumentSeriesPage /></LazyPage>} />
            <Route path="setup/items" element={<LazyPage fallback={<TableSkeleton columns={7} filters={1} />}><ItemsPage /></LazyPage>} />
            <Route path="setup/items/new" element={<LazyPage fallback={<FormSkeleton fields={6} />}><NewItemPage /></LazyPage>} />
            <Route path="setup/items/:id" element={<LazyPage fallback={<FormSkeleton fields={6} />}><EditItemPage /></LazyPage>} />
            <Route path="setup/barcode-formats" element={<LazyPage fallback={<TableSkeleton columns={6} filters={0} />}><BarcodeFormatsPage /></LazyPage>} />
            <Route path="setup/barcode-formats/new" element={<LazyPage fallback={<FormSkeleton fields={5} />}><BarcodeFormatNewPage /></LazyPage>} />
            <Route path="setup/barcode-formats/:id" element={<LazyPage fallback={<FormSkeleton fields={5} />}><BarcodeFormatDetailPage /></LazyPage>} />
            <Route path="setup/batch-formats" element={<LazyPage fallback={<TableSkeleton columns={5} filters={0} />}><BatchFormatsPage /></LazyPage>} />
            <Route path="setup/batch-formats/new" element={<LazyPage fallback={<FormSkeleton fields={5} />}><BatchFormatNewPage /></LazyPage>} />
            <Route path="setup/batch-formats/:id" element={<LazyPage fallback={<FormSkeleton fields={5} />}><BatchFormatDetailPage /></LazyPage>} />
            <Route path="setup/tax-categories" element={<LazyPage fallback={<TableSkeleton columns={6} filters={0} />}><TaxCategoriesPage /></LazyPage>} />
            <Route path="setup/tax-categories/new" element={<LazyPage fallback={<FormSkeleton fields={4} />}><NewTaxCategoryPage /></LazyPage>} />
            <Route path="setup/tax-categories/:id" element={<LazyPage fallback={<FormSkeleton fields={4} />}><EditTaxCategoryPage /></LazyPage>} />
            <Route path="setup/price-lists/items" element={<LazyPage fallback={<TableSkeleton columns={6} filters={1} />}><ItemPricelistPage /></LazyPage>} />
            <Route path="setup/price-lists" element={<LazyPage fallback={<TableSkeleton columns={6} filters={0} />}><PriceListsPage /></LazyPage>} />
            <Route path="setup/price-lists/new" element={<LazyPage fallback={<FormSkeleton fields={4} />}><NewPriceListPage /></LazyPage>} />
            <Route path="setup/price-lists/:id" element={<LazyPage fallback={<FormSkeleton fields={4} />}><EditPriceListPage /></LazyPage>} />
            {/* Legacy redirect: /app/data-library/* -> /app/setup/* */}
            <Route path="data-library/*" element={<Navigate to="/app/setup/items" replace />} />
            <Route path="settings" element={<Navigate to="/app/settings/users" replace />} />
            <Route path="settings/users" element={<LazyPage fallback={<TableSkeleton columns={5} filters={0} />}><UsersPage /></LazyPage>} />
            <Route path="settings/users/new" element={<LazyPage fallback={<FormSkeleton fields={5} />}><NewUserPage /></LazyPage>} />
            <Route path="settings/users/:id" element={<LazyPage fallback={<FormSkeleton fields={5} />}><EditUserPage /></LazyPage>} />
            <Route path="settings/roles" element={<LazyPage fallback={<TableSkeleton columns={6} filters={0} />}><RolesPage /></LazyPage>} />
            <Route path="settings/roles/new" element={<LazyPage fallback={<FormSkeleton fields={4} />}><NewRolePage /></LazyPage>} />
            <Route path="settings/roles/:id" element={<LazyPage fallback={<FormSkeleton fields={6} />}><EditRolePage /></LazyPage>} />
            <Route path="settings/import" element={<LazyPage fallback={<TableSkeleton columns={4} filters={0} />}><ImportDataPage /></LazyPage>} />
            <Route path="settings/ai" element={<LazyPage fallback={<FormSkeleton fields={6} />}><AiSettingsPage /></LazyPage>} />
            <Route path="settings/company" element={<LazyPage fallback={<FormSkeleton fields={6} />}><CompanySettingsPage /></LazyPage>} />
            <Route path="ai" element={<LazyPage fallback={<ChatSkeleton />}><AiChatPage /></LazyPage>} />
            <Route path="suppliers" element={<LazyPage fallback={<TableSkeleton columns={6} filters={2} />}><SuppliersPage /></LazyPage>} />
            <Route path="customers" element={<LazyPage fallback={<TableSkeleton columns={6} filters={2} />}><CustomersPage /></LazyPage>} />
            <Route path="purchase-orders" element={<LazyPage fallback={<TableSkeleton columns={6} filters={2} />}><PurchaseOrdersPage /></LazyPage>} />
            <Route path="purchase-orders/new" element={<LazyPage fallback={<FormSkeleton fields={5} hasTable tableColumns={5} />}><NewPurchaseOrderPage /></LazyPage>} />
            <Route path="purchase-orders/:id" element={<LazyPage fallback={<DetailSkeleton />}><PurchaseOrderDetailPage /></LazyPage>} />
            <Route path="sales-orders" element={<LazyPage fallback={<TableSkeleton columns={6} filters={2} />}><SalesOrdersPage /></LazyPage>} />
            <Route path="sales-orders/new" element={<LazyPage fallback={<FormSkeleton fields={5} hasTable tableColumns={5} />}><NewSalesOrderPage /></LazyPage>} />
            <Route path="sales-orders/:id" element={<LazyPage fallback={<DetailSkeleton />}><SalesOrderDetailPage /></LazyPage>} />
            <Route path="goods-receipts" element={<LazyPage fallback={<TableSkeleton columns={6} filters={2} />}><GoodsReceiptsPage /></LazyPage>} />
            <Route path="goods-receipts/new" element={<LazyPage fallback={<FormSkeleton fields={4} hasTable tableColumns={5} />}><NewGoodsReceiptPage /></LazyPage>} />
            <Route path="goods-receipts/:id" element={<LazyPage fallback={<DetailSkeleton />}><GoodsReceiptDetailPage /></LazyPage>} />
            <Route path="deliveries" element={<LazyPage fallback={<TableSkeleton columns={6} filters={2} />}><DeliveriesPage /></LazyPage>} />
            <Route path="deliveries/new" element={<LazyPage fallback={<FormSkeleton fields={5} hasTable tableColumns={5} />}><NewDeliveryPage /></LazyPage>} />
            <Route path="deliveries/:id" element={<LazyPage fallback={<DetailSkeleton />}><DeliveryDetailPage /></LazyPage>} />
            <Route path="inbound" element={<Navigate to="/app/receiving" replace />} />
            <Route path="receiving" element={<LazyPage fallback={<TableSkeleton columns={6} filters={2} />}><InboundReceivingPage /></LazyPage>} />
            <Route path="receiving/new" element={<LazyPage fallback={<FormSkeleton fields={4} hasTable tableColumns={5} />}><NewInboundReceivingPage /></LazyPage>} />
            <Route path="receiving/:id" element={<LazyPage fallback={<DetailSkeleton />}><InboundReceivingDetailPage /></LazyPage>} />
            <Route path="qc" element={<LazyPage><InboundQcPage /></LazyPage>} />
            <Route path="qc/new" element={<LazyPage fallback={<FormSkeleton fields={4} hasTable tableColumns={5} />}><NewQcInspectionPage /></LazyPage>} />
            <Route path="qc/:id" element={<LazyPage fallback={<DetailSkeleton />}><QcInspectionDetailPage /></LazyPage>} />
            <Route path="putaway" element={<LazyPage><InboundPutawayPage /></LazyPage>} />
            <Route path="supplier-return" element={<LazyPage><SupplierReturnPage /></LazyPage>} />
            {/* Redirect URL lama /app/inbound/* ke path flat */}
            <Route path="inbound/receiving" element={<Navigate to="/app/receiving" replace />} />
            <Route path="inbound/receiving/new" element={<Navigate to="/app/receiving/new" replace />} />
            <Route path="inbound/receiving/:id" element={<RedirectTo to="/app/receiving/:id" />} />
            <Route path="inbound/qc" element={<Navigate to="/app/qc" replace />} />
            <Route path="inbound/qc/new" element={<Navigate to="/app/qc/new" replace />} />
            <Route path="inbound/qc/:id" element={<RedirectTo to="/app/qc/:id" />} />
            <Route path="inbound/putaway" element={<Navigate to="/app/putaway" replace />} />
            <Route path="inbound/supplier-return" element={<Navigate to="/app/supplier-return" replace />} />
            <Route path="outbound" element={<Navigate to="/app/sales-orders" replace />} />
            <Route path="outbound/picking" element={<LazyPage><OutboundPickingPage /></LazyPage>} />
            <Route path="outbound/packing" element={<LazyPage><OutboundPackingPage /></LazyPage>} />
            <Route path="outbound/customer-return" element={<LazyPage><CustomerReturnPage /></LazyPage>} />
            <Route path="report/stock-aging" element={<LazyPage><StockAgingReportPage /></LazyPage>} />
            <Route path="report/batch-traceability" element={<LazyPage><BatchTraceabilityReportPage /></LazyPage>} />
            <Route path="report/inventory-valuation" element={<LazyPage><InventoryValuationReportPage /></LazyPage>} />
            <Route path="report/receiving" element={<LazyPage><ReceivingReportPage /></LazyPage>} />
            <Route path="report/delivery-performance" element={<LazyPage><DeliveryPerformanceReportPage /></LazyPage>} />
          </Route>

          <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
      </TooltipProvider>
      <Toaster />
    </SessionProvider>
  );
}
