import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
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
  Receiving,
  Delivery, DeliveryLine,
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
  return useQuery({
    queryKey: ["branches"],
    queryFn: () => api.get<Branch[]>("/branches"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useWarehouse(id?: string) {
  return useResourceOne<Warehouse>("warehouses", id);
}

export function useWarehouses(branchId?: string) {
  const params = branchId ? { branchId } : undefined;
  return useQuery({
    queryKey: ["warehouses", params],
    queryFn: () => api.get<Warehouse[]>(`/warehouses${qs(params ?? {})}`),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useAllWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: () => api.get<Warehouse[]>("/warehouses"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useSubWarehouses(parentId?: string) {
  return useQuery({
    queryKey: ["warehouses", { parentId }],
    queryFn: () => api.get<Warehouse[]>(`/warehouses${qs(parentId ? { parentId } : { parentId: "null" })}`),
    enabled: !!parentId,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useTopWarehouses(branchId?: string) {
  const params: Record<string, unknown> = { parentId: "null" };
  if (branchId) params.branchId = branchId;
  return useQuery({
    queryKey: ["warehouses", params],
    queryFn: () => api.get<Warehouse[]>(`/warehouses${qs(params)}`),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
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
  return useQuery({
    queryKey: ["itemGroups"],
    queryFn: () => api.get<ItemGroup[]>("/itemGroups"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
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
  const qsParams = params as Record<string, unknown> | undefined;
  return useQuery({
    queryKey: ["items", qsParams],
    queryFn: () => api.get<Item[]>(`/items${qs(qsParams ?? {})}`),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
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
  balanceDate: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
};

export function useStockBalanceLedger(params?: {
  query?: string;
  warehouseId?: string;
  itemId?: string;
  from?: string;
  to?: string;
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
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: ["stock-balances/summary", params],
    queryFn: () =>
      api.get<StockBalanceSummary>(`/stock-balances/summary${qs(params ?? {})}`),
  });
}

export function useBarcodeFormats() {
  return useQuery({
    queryKey: ["barcodeFormats"],
    queryFn: () => api.get<BarcodeFormat[]>("/barcodeFormats"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useBatchFormats() {
  return useQuery({
    queryKey: ["batchFormats"],
    queryFn: () => api.get<BatchFormat[]>("/batchFormats"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useMovementTypes() {
  return useQuery({
    queryKey: ["movementTypes"],
    queryFn: () => api.get<MovementType[]>("/movementTypes"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useUoms() {
  return useQuery({
    queryKey: ["uom"],
    queryFn: () => api.get<Uom[]>("/uom"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useUom(id?: string) {
  return useResourceOne<Uom>("uom", id);
}

export function useDepartments() {
  return useQuery({
    queryKey: ["departments"],
    queryFn: () => api.get<import("@/types").Department[]>("/departments"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useDepartment(id?: string) {
  return useResourceOne<import("@/types").Department>("departments", id);
}

export function useTaxCategories() {
  return useQuery({
    queryKey: ["taxCategories"],
    queryFn: () => api.get<import("@/types").TaxCategory[]>("/taxCategories"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useTaxCategory(id?: string) {
  return useResourceOne<import("@/types").TaxCategory>("taxCategories", id);
}

export function usePriceLists() {
  return useQuery({
    queryKey: ["priceLists"],
    queryFn: () => api.get<import("@/types").PriceList[]>("/priceLists"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
export function usePriceList(id?: string) {
  return useResourceOne<import("@/types").PriceList>("priceLists", id);
}
export function usePriceListLines(priceListId?: string) {
  return useQuery({
    queryKey: ["priceListLines", priceListId],
    queryFn: () => api.get<import("@/types").PriceListLine[]>(`/priceListLines${qs(priceListId ? { priceListId } : {})}`),
    enabled: !!priceListId,
  });
}
export function usePriceListLinesByItem(itemId?: string) {
  return useQuery({
    queryKey: ["priceListLines", "item", itemId],
    queryFn: () => api.get<import("@/types").PriceListLine[]>(`/priceListLines${qs(itemId ? { itemId } : {})}`),
    enabled: !!itemId,
  });
}

export function useCompanySettings() {
  return useQuery({
    queryKey: ["companySettings"],
    queryFn: () => api.get<import("@/types").CompanySettings>("/company-settings"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: unknown) => api.put("/company-settings", patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companySettings"] }),
  });
}

export function useExchangeRate(from?: string, to?: string) {
  return useQuery({
    queryKey: ["exchangeRate", from, to],
    queryFn: () => api.get<{ from: string; to: string; rate: number; source: string; timestamp: string }>(`/exchange-rate${qs({ from: from!, to: to! })}`),
    enabled: !!from && !!to && from !== to,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    retry: 1,
  });
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

// ---- Supply Chain: Purchase Requests (PR) ----

export function usePurchaseRequests(params?: Record<string, unknown>) {
  return useResourceList<import("@/types").PurchaseRequest>("purchase-requests", params);
}

export function usePurchaseRequest(id?: string) {
  return useResourceOne<import("@/types").PurchaseRequest>("purchase-requests", id);
}

export function useCreatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<{ id: string }>("/purchase-requests", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); },
  });
}

export function useUpdatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/purchase-requests/${id}`, patch),
    onSuccess: (_d, { id }) => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); qc.invalidateQueries({ queryKey: ["purchase-requests", id] }); },
  });
}

export function useRemovePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/purchase-requests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); },
  });
}

export function usePostPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-requests/${id}/post`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); qc.invalidateQueries({ queryKey: ["purchase-requests", id] }); },
  });
}

export function useApprovePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-requests/${id}/approve`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); qc.invalidateQueries({ queryKey: ["purchase-requests", id] }); },
  });
}

export function useRejectPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-requests/${id}/reject`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); qc.invalidateQueries({ queryKey: ["purchase-requests", id] }); },
  });
}

export function useCancelPurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-requests/${id}/cancel`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); qc.invalidateQueries({ queryKey: ["purchase-requests", id] }); },
  });
}

export function useCreatePOFromPR() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ id: string; documentNo: string }>(`/purchase-requests/${id}/create-po`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["purchase-requests"] }); qc.invalidateQueries({ queryKey: ["purchase-orders"] }); },
  });
}

// ---- Supply Chain: Material Requests (MR) ----

export function useMaterialRequests(params?: Record<string, unknown>) {
  return useResourceList<import("@/types").MaterialRequest>("material-requests", params);
}

export function useMaterialRequest(id?: string) {
  return useResourceOne<import("@/types").MaterialRequest>("material-requests", id);
}

export function useCreateMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<{ id: string }>("/material-requests", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["material-requests"] }); },
  });
}

export function useUpdateMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/material-requests/${id}`, patch),
    onSuccess: (_d, { id }) => { qc.invalidateQueries({ queryKey: ["material-requests"] }); qc.invalidateQueries({ queryKey: ["material-requests", id] }); },
  });
}

export function useRemoveMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/material-requests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["material-requests"] }); },
  });
}

export function usePostMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/material-requests/${id}/post`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["material-requests"] }); qc.invalidateQueries({ queryKey: ["material-requests", id] }); },
  });
}

export function useApproveMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/material-requests/${id}/approve`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["material-requests"] }); qc.invalidateQueries({ queryKey: ["material-requests", id] }); },
  });
}

export function useRejectMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/material-requests/${id}/reject`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["material-requests"] }); qc.invalidateQueries({ queryKey: ["material-requests", id] }); },
  });
}

export function useCancelMaterialRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/material-requests/${id}/cancel`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["material-requests"] }); qc.invalidateQueries({ queryKey: ["material-requests", id] }); },
  });
}

// ---- Supply Chain: Purchase Orders ----

export function usePurchaseOrders(params?: Record<string, unknown>) {
  return useResourceList<PurchaseOrder>("purchase-orders", params);
}

export function usePurchaseOrder(id?: string) {
  return useResourceOne<PurchaseOrder>("purchase-orders", id);
}

export function useItemLastPrice(itemId?: string) {
  return useQuery({
    queryKey: ["purchase-orders", "last-price", itemId],
    queryFn: () => api.get<{ itemId: string; unitPrice: string | null }>(`/purchase-orders/last-price${qs({ itemId: itemId! })}`),
    enabled: !!itemId,
    staleTime: 60_000,
  });
}

export function useLastPurchasePrices(itemIds: string[]) {
  const key = [...itemIds].sort().join(",");
  return useQuery({
    queryKey: ["purchase-orders", "last-price", "batch", key],
    queryFn: () => api.get<Record<string, string | null>>(`/purchase-orders/last-price${qs({ itemIds: key })}`),
    enabled: itemIds.length > 0,
    staleTime: 60_000,
  });
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

export function useApprovePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/approve`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      qc.invalidateQueries({ queryKey: ["purchase-orders", id] });
    },
  });
}

export function useRejectPurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/purchase-orders/${id}/reject`, {}),
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

// ---- Supply Chain: Receivings (tahap awal inbound, bukan GR) ----

export function useReceivings(params?: Record<string, unknown>) {
  return useResourceList<Receiving>("receivings", params);
}

export function useReceiving(id?: string) {
  return useResourceOne<Receiving>("receivings", id);
}

export function useCreateReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api.post<{ id: string }>("/receivings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receivings"] });
    },
  });
}

export function useUpdateReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) =>
      api.patch(`/receivings/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["receivings"] });
      qc.invalidateQueries({ queryKey: ["receivings", id] });
    },
  });
}

export function useRemoveReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/receivings/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["receivings"] });
    },
  });
}

export function usePostReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/receivings/${id}/post`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["receivings"] });
      qc.invalidateQueries({ queryKey: ["receivings", id] });
    },
  });
}

export function useSubmitReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/receivings/${id}/submit`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["receivings"] });
      qc.invalidateQueries({ queryKey: ["receivings", id] });
    },
  });
}

export function useQcReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines, qcNotes }: { id: string; lines: Array<{ id: string; qtyRejected: string | number; rejectReason?: string | null }>; qcNotes?: string | null }) =>
      api.post(`/receivings/${id}/qc`, { lines, qcNotes }),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["receivings"] });
      qc.invalidateQueries({ queryKey: ["receivings", id] });
    },
  });
}

export function useCancelReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/receivings/${id}/cancel`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["receivings"] });
      qc.invalidateQueries({ queryKey: ["receivings", id] });
    },
  });
}

// ---- QC Inspections (history, document No QC-...) ----
export function useQcInspections(params?: Record<string, unknown>) {
  return useResourceList<import("@/types").QcInspection>("qc-inspections", params);
}
export function useQcInspection(id?: string) {
  return useResourceOne<import("@/types").QcInspection>("qc-inspections", id);
}
export function useCreateQcInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<{ id: string; documentNo: string }>("/qc-inspections", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-inspections"] }); qc.invalidateQueries({ queryKey: ["receivings"] }); },
  });
}
export function useUpdateQcInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/qc-inspections/${id}`, patch),
    onSuccess: (_d, { id }) => { qc.invalidateQueries({ queryKey: ["qc-inspections"] }); qc.invalidateQueries({ queryKey: ["qc-inspections", id] }); },
  });
}
export function useSubmitQcInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/qc-inspections/${id}/submit`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["qc-inspections"] }); qc.invalidateQueries({ queryKey: ["qc-inspections", id] }); qc.invalidateQueries({ queryKey: ["receivings"] }); },
  });
}
export function useCancelQcInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/qc-inspections/${id}/cancel`, {}),
    onSuccess: (_d, id) => { qc.invalidateQueries({ queryKey: ["qc-inspections"] }); qc.invalidateQueries({ queryKey: ["qc-inspections", id] }); },
  });
}
export function useRemoveQcInspection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/qc-inspections/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-inspections"] }); },
  });
}
export function useQcParameters() {
  return useResourceList<import("@/types").QcParameter>("qc-parameters");
}
export function useCreateQcParameter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post("/qc-parameters", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-parameters"] }); },
  });
}
export function useUpdateQcParameter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/qc-parameters/${id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-parameters"] }); },
  });
}
export function useDeleteQcParameter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/qc-parameters/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["qc-parameters"] }); },
  });
}

// ---- Supply Chain: Deliveries (outbound from SO) ----

export function useDeliveries(params?: Record<string, unknown>) {
  return useResourceList<Delivery>("deliveries", params);
}

export function useDelivery(id?: string) {
  return useResourceOne<Delivery>("deliveries", id);
}

export function useCreateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post<{ id: string }>("/deliveries", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deliveries"] }); },
  });
}

export function useUpdateDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/deliveries/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["deliveries", id] });
    },
  });
}

export function useRemoveDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/deliveries/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["deliveries"] }); },
  });
}

export function usePostDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/deliveries/${id}/post`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["deliveries", id] });
    },
  });
}

export function useCancelDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/deliveries/${id}/cancel`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["deliveries", id] });
    },
  });
}

export function useCreateDeliveryFromSo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deliveryDate }: { id: string; deliveryDate: string }) =>
      api.post<{ id: string }>(`/sales-orders/${id}/create-delivery`, { deliveryDate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
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
  // cursor mode (Load More)
  cursor?: string;
  limit?: number;
}) {
  return usePaginatedList<StockMovementListRow>(
    "transactions",
    params as Record<string, unknown>
  );
}

export interface StockMovementCursorPage {
  rows: StockMovementListRow[];
  hasNext: boolean;
  nextCursor: string | null;
  limit: number;
}

export function useStockMovementsInfinite(params?: {
  query?: string;
  typeId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  sort?: string;
  dir?: "asc" | "desc";
  limit?: number;
}) {
  return useInfiniteQuery({
    queryKey: ["transactions-cursor", params],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const q = { ...params, cursor: pageParam, limit: params?.limit ?? 20 };
      const cleaned = Object.fromEntries(Object.entries(q).filter(([, v]) => v != null && v !== "")) as Record<string, unknown>;
      const res = await api.get<StockMovementCursorPage>(`/transactions${qs(cleaned)}`);
      return res;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasNext ? lastPage.nextCursor ?? undefined : undefined),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
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

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: () => api.get<import("@/types").Workspace[]>("/workspaces"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useWorkspaceAccesses(roleId?: string) {
  return useResourceList<import("@/types").WorkspaceAccess>("workspaceAccesses", roleId ? { roleId } : undefined);
}

// ---- Dashboard builder ----

export function useDashboardMeta() {
  return useQuery({
    queryKey: ["dashboardMeta"],
    queryFn: () => api.get<DashboardMeta>("/dashboards/meta"),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/** Eksekusi single widget (untuk builder preview & fallback). */
export function useWidgetQuery(config: WidgetConfig | undefined) {
  return useQuery({
    queryKey: ["widgetQuery", config],
    enabled: !!config && !!config.factTable && config.measures.length > 0,
    queryFn: () =>
      api.post<{ rows: WidgetRow[]; percentChange?: number | null; periodLabel?: string | null; previousValue?: number | null }>("/dashboards/widgets/query", config),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/** Batch query — 1 request untuk N widget (dashboard page). Jauh lebih efisien vs N x POST. */
export function useWidgetQueries(configs: WidgetConfig[] | undefined) {
  const enabled =
    !!configs &&
    configs.length > 0 &&
    configs.every((c) => !!c?.factTable && Array.isArray(c.measures) && c.measures.length > 0);
  // Stabilkan key: TanStack hash deep-equal, tapi stringify mencegah flicker jika referensi array baru.
  const key = configs ? JSON.stringify(configs) : "empty";
  return useQuery({
    queryKey: ["widgetQueries", key],
    enabled,
    queryFn: () =>
      api.post<{ results: { rows: WidgetRow[]; error: string | null; percentChange?: number | null; periodLabel?: string | null; previousValue?: number | null }[] }>(
        "/dashboards/widgets/query-batch",
        { queries: configs }
      ),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}


export function useCreateOpnameProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      deadline?: string | null;
      cutOffDate: string;
      cutOffTime: string;
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
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; deadline?: string | null; cutOffDate?: string | null; cutOffTime?: string | null; status?: string } }) =>
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

export interface OpnameCount {
  id: string;
  documentNo?: string | null;
  projectId: string;
  warehouseId: string;
  postingDate?: string | null;
  postingTime?: string | null;
  cutOffDate?: string | null;
  cutOffTime?: string | null;
  notes?: string | null;
  status: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  projectName?: string;
  warehouseName?: string;
  auditor?: string;
}

export function useOpnameCounts() {
  return useQuery({
    queryKey: ["opnameCounts"],
    queryFn: () => api.get<OpnameCount[]>("/opname-counts"),
  });
}

export function useOpnameCount(id?: string) {
  return useQuery({
    queryKey: ["opnameCounts", id],
    queryFn: () => api.get<OpnameCount & { details: { itemId: string; qty: string; batch?: string | null; uomId?: string | null; warehouseId: string }[] }>(`/opname-counts/${id}`),
    enabled: !!id,
  });
}

export function useCreateOpnameCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      projectId: string;
      warehouseId: string;
      postingDate?: string | null;
      postingTime?: string | null;
      cutOffDate?: string | null;
      cutOffTime?: string | null;
      notes?: string | null;
      details: { itemId: string; qty: number | string; batch?: string | null; uomId?: string | null }[];
    }) => api.post<{ id: string }>("/opname-counts", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opnameCounts"] });
    },
  });
}

export function useUpdateOpnameCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/opname-counts/${id}`, patch),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["opnameCounts"] });
      qc.invalidateQueries({ queryKey: ["opnameCounts", id] });
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

export function useDocumentTypes() {
  return useQuery({
    queryKey: ["documentTypes"],
    queryFn: () => api.get<import("@/types").DocumentType[]>("/document-types"),
  });
}
export function useDocumentType(id?: string) {
  return useQuery({
    queryKey: ["documentTypes", id],
    queryFn: () => api.get<import("@/types").DocumentType & { series: import("@/types").DocumentSeries[] }>(`/document-types/${id}`),
    enabled: !!id,
  });
}
export function useDocumentSeries(params?: { documentTypeId?: string; documentTypeCode?: string }) {
  return useQuery({
    queryKey: ["documentSeries", params],
    queryFn: () => api.get<import("@/types").DocumentSeries[]>(`/document-series${qs(params ?? {})}`),
  });
}
export function useDocumentSeriesOne(id?: string) {
  return useQuery({
    queryKey: ["documentSeries", id],
    queryFn: () => api.get<import("@/types").DocumentSeries>(`/document-series/${id}`),
    enabled: !!id,
  });
}
export function useCreateDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post("/document-types", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentTypes"] }); qc.invalidateQueries({ queryKey: ["documentSeries"] }); },
  });
}
export function useUpdateDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/document-types/${id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentTypes"] }); },
  });
}
export function useRemoveDocumentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/document-types/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentTypes"] }); },
  });
}
export function useCreateDocumentSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post("/document-series", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentSeries"] }); },
  });
}
export function useUpdateDocumentSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.patch(`/document-series/${id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentSeries"] }); },
  });
}
export function useRemoveDocumentSeries() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/document-series/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documentSeries"] }); },
  });
}

// ---- Workflows (generic approval) ----
export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.get<import("@/types").Workflow[]>("/workflows"),
  });
}
export function useWorkflow(id?: string) {
  return useQuery({
    queryKey: ["workflows", id],
    queryFn: () => api.get<import("@/types").Workflow & { states: import("@/types").WorkflowState[]; transitions: import("@/types").WorkflowTransition[] }>(`/workflows/${id}`),
    enabled: !!id,
  });
}
export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => api.post("/workflows", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}
export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.put(`/workflows/${id}`, patch),
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["workflows"] }); qc.invalidateQueries({ queryKey: ["workflows", (v as any).id] }); },
  });
}
export function useRemoveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/workflows/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflows"] }),
  });
}
export function useSubmitWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/workflows/${id}/submit`, {}),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["workflows", id] });
    },
  });
}
export function useWorkflowStates(workflowId?: string) {
  return useQuery({
    queryKey: ["workflowStates", workflowId],
    queryFn: () => api.get<import("@/types").WorkflowState[]>(`/workflows/${workflowId}/states`),
    enabled: !!workflowId,
  });
}
export function useCreateWorkflowState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, body }: { workflowId: string; body: unknown }) => api.post(`/workflows/${workflowId}/states`, body),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["workflowStates", (v as any).workflowId] }),
  });
}
export function useUpdateWorkflowState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.put(`/workflow-states/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflowStates"] }),
  });
}
export function useRemoveWorkflowState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/workflow-states/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflowStates"] }),
  });
}
export function useWorkflowTransitions(workflowId?: string) {
  return useQuery({
    queryKey: ["workflowTransitions", workflowId],
    queryFn: () => api.get<import("@/types").WorkflowTransition[]>(`/workflows/${workflowId}/transitions`),
    enabled: !!workflowId,
  });
}
export function useCreateWorkflowTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, body }: { workflowId: string; body: unknown }) => api.post(`/workflows/${workflowId}/transitions`, body),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["workflowTransitions", (v as any).workflowId] }),
  });
}
export function useUpdateWorkflowTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: unknown }) => api.put(`/workflow-transitions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflowTransitions"] }),
  });
}
export function useRemoveWorkflowTransition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/workflow-transitions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workflowTransitions"] }),
  });
}

export function useUserSignature() {
  return useQuery({
    queryKey: ["userSignature", "me"],
    queryFn: () => api.get<{ id: string; signatureData: string; updatedAt: string } | null>("/user-signatures/me"),
  });
}
export function useUpsertUserSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (signatureData: string) => api.put("/user-signatures/me", { signatureData }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["userSignature", "me"] }),
  });
}
export function useDeleteUserSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.del("/user-signatures/me"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["userSignature", "me"] }),
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: { name?: string; email?: string; phone?: string | null; password?: string }) =>
      api.put<{ user: import("@/types").User }>("/auth/me", patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      // session will refresh on focus, but also invalidate user queries
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
