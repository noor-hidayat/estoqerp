import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  Branch, Warehouse, Location, ItemGroup, Item, StockBalance,
  BarcodeFormat,
  User, Role, RolePermission, BranchAccess,
  OpnameProject, OpnameProjectDetail, OpnameProjectListItem,
  OpnameWarehouse, OpnameScan, OpnameScanDetail, OpnameScanDetailsResponse, OpnameStats,
  MovementType, Uom, StockMovementListRow, StockMovementDetailFull,
  StockLedgerRow, MovementInput, Batch, StockBatch, StockBarcode, BatchFormat,
  ScanHistoryRow,
  Supplier, Customer, PurchaseOrder, PurchaseOrderLine,
  SalesOrder, SalesOrderLine, GoodsReceipt, GoodsReceiptLine,
} from "@/types";
import type { DashboardMeta, WidgetConfig, WidgetRow } from "@/components/dashboard/types";

function qs(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.append(k, String(v));
  return `?${sp.toString()}`;
}

interface PaginatedResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- Generic resource hooks ----

export function useResourceList<T>(table: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [table, params],
    queryFn: async () => {
      const res = await api.get<T[]>(`/${table}${qs(params ?? {})}`);
      return res;
    },
  });
}

function usePaginatedList<T, R extends PaginatedResponse<T> = PaginatedResponse<T>>(
  table: string,
  params?: Record<string, unknown>
) {
  return useQuery({
    queryKey: [table, params],
    queryFn: async () => {
      const res = await api.get<R>(`/${table}${qs(params ?? {})}`);
      return res;
    },
    placeholderData: (prev) => prev,
  });
}

function useResourceOne<T>(table: string, id: string | undefined) {
  return useQuery({
    queryKey: [table, id],
    queryFn: () => api.get<T>(`/${table}/${id}`),
    enabled: !!id,
  });
}

// ---- Mutations ----

export function useInsert<K extends string>(table: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (row: unknown) => api.post(`/${table}`, row),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table] }); },
  });
}

export function useUpdate<K extends string>(table: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/${table}/${id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table] }); },
  });
}

export function useRemove<K extends string>(table: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/${table}/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [table] }); },
  });
}

// ---- Specific table hooks ----

export function useBranch(id?: string) {
  return useResourceOne<Branch>("branches", id);
}

export function useBranches() {
  return useResourceList<Branch>("branches");
}

export function useWarehouse(id?: string) {
  return useResourceOne<Warehouse>("warehouses", id);
}

export function useWarehouses(branchId?: string) {
  return useResourceList<Warehouse>("warehouses", branchId ? { branchId } : undefined);
}

export function useAllWarehouses() {
  return useResourceList<Warehouse>("warehouses");
}

export function useLocation(id?: string) {
  return useResourceOne<Location>("locations", id);
}

export function useLocations(warehouseId?: string) {
  return useResourceList<Location>("locations", warehouseId ? { warehouseId } : undefined);
}

export function useItemGroup(id?: string) {
  return useResourceOne<ItemGroup>("itemGroups", id);
}

export function useItemGroups() {
  return useResourceList<ItemGroup>("itemGroups");
}

export interface ItemGroupCounts {
  counts: Record<string, number>;
}

export function useItemGroupCounts() {
  return useQuery({
    queryKey: ["item-group-counts"],
    queryFn: () => api.get<ItemGroupCounts>("/item-groups/counts"),
  });
}

export function useItem(id?: string) {
  return useResourceOne<Item>("items", id);
}

export function useItems(params?: { query?: string; itemGroupId?: string; page?: number; pageSize?: number }) {
  return usePaginatedList<Item>("items", params as Record<string, unknown>);
}

export function useItemsList(params?: { query?: string; itemGroupId?: string }) {
  return useResourceList<Item>("items", params as Record<string, unknown>);
}

export function useStockBalances(params?: { warehouseId?: string; itemId?: string }) {
  return useResourceList<StockBalance>("stockBalances", params as Record<string, unknown>);
}

export type StockBalanceLedgerRow = {
  id: string;
  warehouseId: string;
  itemId: string;
  code: string;
  name: string;
  itemGroup: string | null;
  warehouse: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
};

export function useStockBalanceLedger(params?: {
  query?: string;
  warehouseId?: string;
  itemId?: string;
  page?: number;
  pageSize?: number;
}) {
  return usePaginatedList<StockBalanceLedgerRow>(
    "stock-balances/ledger",
    params as Record<string, unknown>
  );
}

export interface StockBalanceSummary {
  totalItems: number;
  totalQty: number;
  totalRows: number;
}

export function useStockBalanceSummary(params?: {
  query?: string;
  warehouseId?: string;
  itemId?: string;
}) {
  return useQuery({
    queryKey: ["stock-balances/summary", params],
    queryFn: () =>
      api.get<StockBalanceSummary>(`/stock-balances/summary${qs(params ?? {})}`),
  });
}

export function useBarcodeFormats() {
  return useResourceList<BarcodeFormat>("barcodeFormats");
}

export function useBatchFormats() {
  return useResourceList<BatchFormat>("batchFormats");
}

export function useMovementTypes() {
  return useResourceList<MovementType>("movementTypes");
}

export function useUoms() {
  return useResourceList<Uom>("uom");
}

export function useUom(id?: string) {
  return useResourceOne<Uom>("uom", id);
}

// ---- Supply Chain: Suppliers & Customers ----

export function useSuppliers(params?: Record<string, unknown>) {
  return useResourceList<Supplier>("suppliers", params);
}

export function useSupplier(id?: string) {
  return useResourceOne<Supplier>("suppliers", id);
}

export function useCustomers(params?: Record<string, unknown>) {
  return useResourceList<Customer>("customers", params);
}

export function useCustomer(id?: string) {
  return useResourceOne<Customer>("customers", id);
}

// ---- Supply Chain: Purchase Orders ----

export function usePurchaseOrders(params?: Record<string, unknown>) {
  return useResourceList<PurchaseOrder>("purchase-orders", params);
}

export function usePurchaseOrder(id?: string) {
  return useResourceOne<PurchaseOrder>("purchase-orders", id);
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api.post<{ id: string }>("/purchase-orders", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) =>
      api.patch(`/purchase-orders/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders", id] });
    },
  });
}

export function useRemovePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/purchase-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });
}

export function usePostPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/post`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders", id] });
    },
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/cancel`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders", id] });
    },
  });
}

export function useCreateReceiptFromPo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, receiptDate }: { id: string; receiptDate: string }) =>
      api.post<{ id: string }>(`/purchase-orders/${id}/create-receipt`, { receiptDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
    },
  });
}

// ---- Supply Chain: Sales Orders ----

export function useSalesOrders(params?: Record<string, unknown>) {
  return useResourceList<SalesOrder>("sales-orders", params);
}

export function useSalesOrder(id?: string) {
  return useResourceOne<SalesOrder>("sales-orders", id);
}

export function useCreateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api.post<{ id: string }>("/sales-orders", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
    },
  });
}

export function useUpdateSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) =>
      api.patch(`/sales-orders/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

export function useRemoveSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/sales-orders/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
    },
  });
}

export function usePostSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/post`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

export function useCancelSalesOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/sales-orders/${id}/cancel`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
      qc.invalidateQueries({ queryKey: ["sales-orders", id] });
    },
  });
}

// ---- Supply Chain: Goods Receipts ----

export function useGoodsReceipts(params?: Record<string, unknown>) {
  return useResourceList<GoodsReceipt>("goods-receipts", params);
}

export function useGoodsReceipt(id?: string) {
  return useResourceOne<GoodsReceipt>("goods-receipts", id);
}

export function useCreateGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api.post<{ id: string }>("/goods-receipts", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
    },
  });
}

export function useUpdateGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) =>
      api.patch(`/goods-receipts/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["goods-receipts", id] });
    },
  });
}

export function useRemoveGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/goods-receipts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
    },
  });
}

export function usePostGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/goods-receipts/${id}/post`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["goods-receipts", id] });
    },
  });
}

export function useCancelGoodsReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/goods-receipts/${id}/cancel`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["goods-receipts"] });
      qc.invalidateQueries({ queryKey: ["goods-receipts", id] });
    },
  });
}

export function useBatches(params?: { itemId?: string }) {
  return useResourceList<Batch>("batches", params as Record<string, unknown>);
}

export function useStockBatches(params?: { warehouseId?: string; batchId?: string }) {
  return useResourceList<StockBatch>(
    "stockBatches",
    params as Record<string, unknown>
  );
}

export function useStockBarcodes(params?: {
  warehouseId?: string;
  barcode?: string;
  itemId?: string;
  batchId?: string;
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  return useResourceList<StockBarcode>(
    "stockBarcodes",
    params as Record<string, unknown>
  );
}

export function useStockMovements(params?: {
  query?: string;
  typeId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  sort?: string;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}) {
  return usePaginatedList<StockMovementListRow>(
    "transactions",
    params as Record<string, unknown>
  );
}

export function useStockMovement(id?: string) {
  return useQuery({
    queryKey: ["transactions", id],
    queryFn: () => api.get<StockMovementDetailFull>(`/transactions/${id}`),
    enabled: !!id,
  });
}

export function useScanHistory(params?: {
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  return usePaginatedList<ScanHistoryRow>(
    "transactions/scan-history",
    params as Record<string, unknown>
  );
}

export function useStockLedger(params?: {
  query?: string;
  warehouseId?: string;
  itemId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  return usePaginatedList<StockLedgerRow>(
    "stock-ledger",
    params as Record<string, unknown>
  );
}

export function useCreateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MovementInput) => api.post("/transactions", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["stockBalances"] });
    },
  });
}

export function useUpdateMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MovementInput }) =>
      api.patch(`/transactions/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["stockBalances"] });
    },
  });
}

export function usePostMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/transactions/${id}/post`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["stockBalances"] });
    },
  });
}

export function useUnpostMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/transactions/${id}/unpost`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["stockBalances"] });
    },
  });
}

export function useAmendMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/transactions/${id}/amend`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
      qc.invalidateQueries({ queryKey: ["stockBalances"] });
    },
  });
}

export function useDeleteMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["stock-ledger"] });
    },
  });
}

export function useOpnameProjects() {
  return useQuery({
    queryKey: ["opnameProjects"],
    queryFn: () => api.get<OpnameProjectListItem[]>("/opname-projects"),
  });
}

export function useOpnameProject(id?: string) {
  return useQuery({
    queryKey: ["opnameProjects", id],
    queryFn: () => api.get<OpnameProject>(`/opname-projects/${id}`),
    enabled: !!id,
  });
}

export function useOpnameProjectDetail(id?: string) {
  return useQuery({
    queryKey: ["opnameProjects", id, "detail"],
    queryFn: () => api.get<OpnameProjectDetail>(`/opname-projects/${id}/detail`),
    enabled: !!id,
  });
}

export function useOpnameWarehouses(params?: { opnameId?: string }) {
  return useResourceList<OpnameWarehouse>("opnameWarehouses", params as Record<string, unknown>);
}

export function useOpnameScans(params?: { opnameId?: string; status?: string }) {
  return useResourceList<OpnameScan>("opnameScans", params as Record<string, unknown>);
}

export function useOpnameScanDetails(params?: { opnameId?: string; scanId?: string; source?: string; date?: string; query?: string; page?: number; pageSize?: number }) {
  return usePaginatedList<OpnameScanDetail>("opnameScanDetails", params as Record<string, unknown>);
}

export function useProjectScans(projectId?: string) {
  return useQuery({
    queryKey: ["opname-scans", projectId],
    queryFn: () => api.get<OpnameScanDetailsResponse>(`/opname-projects/${projectId}/scans`),
    enabled: !!projectId,
  });
}

export function useOpnameStats(projectId?: string) {
  return useQuery({
    queryKey: ["opname-stats", projectId],
    queryFn: () => api.get<OpnameStats>(`/opname-projects/${projectId}/stats`),
    enabled: !!projectId,
  });
}

export function useUser(id?: string) {
  return useResourceOne<User>("users", id);
}

export function useUsers() {
  return useResourceList<User>("users");
}

export function useRoles() {
  return useResourceList<Role>("roles");
}

export function useRolePermissions(roleId?: string) {
  return useResourceList<RolePermission>("rolePermissions", roleId ? { roleId } : undefined);
}

export function useBranchAccesses(roleId?: string) {
  return useResourceList<BranchAccess>("branchAccesses", roleId ? { roleId } : undefined);
}

// ---- Dashboard builder ----

export function useDashboardMeta() {
  return useQuery({
    queryKey: ["dashboardMeta"],
    queryFn: () => api.get<DashboardMeta>("/dashboards/meta"),
  });
}

/** Eksekusi query widget terhadap whitelist fact table (branch-scoped di server). */
export function useWidgetQuery(config: WidgetConfig | undefined) {
  return useQuery({
    queryKey: ["widgetQuery", config],
    enabled: !!config && !!config.factTable && config.measures.length > 0,
    queryFn: () =>
      api.post<{ rows: WidgetRow[] }>("/dashboards/widgets/query", config),
    staleTime: 30_000,
  });
}


export function useCreateOpnameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      deadline?: string | null;
      mode: "COMPARE" | "SCRATCH";
      warehouses: { warehouseId: string; branchId: string }[];
    }) => api.post("/opname-projects", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opnameProjects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateOpnameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; deadline?: string | null; status?: string } }) =>
      api.patch(`/opname-projects/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opnameProjects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteOpnameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/opname-projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opnameProjects"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useItemLookup(barcode: string | null, formatId?: string) {
  return useQuery({
    queryKey: ["item-lookup", barcode, formatId],
    queryFn: () => api.get<{
      found: boolean;
      matched?: boolean;
      detail?: string;
      item?: Item;
      itemGroup?: { id: string; code: string; name: string } | null;
      formatId?: string;
      formatName?: string;
      values?: Record<string, string>;
    }>(`/items/lookup${qs({ barcode: barcode!, formatId })}`),
    enabled: !!barcode && barcode.length > 0,
    staleTime: 600_000,
  });
}

export function useBarcodeCheck(opnameId?: string, barcode?: string, excludeScanId?: string) {
  return useQuery({
    queryKey: ["barcode-check", opnameId, barcode, excludeScanId],
    queryFn: () => api.get<{
      exists: boolean;
      record?: { scanId: string; scannedBy: string; locationCode: string; scannedAt: string };
    }>(`/opname-scan-details/check${qs({ opnameId: opnameId!, barcode: barcode!, excludeScanId })}`),
    enabled: !!opnameId && !!barcode,
    staleTime: 60_000,
  });
}
