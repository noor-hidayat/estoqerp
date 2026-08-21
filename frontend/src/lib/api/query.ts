import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  Branch, Warehouse, Location, ItemGroup, Item, StockBalance,
  BarcodeFormat, Project, ProjectStatus, ScanSession, ScanRecord, OpnameEntry,
  User, Role, RolePermission, BranchAccess,
  OpnameProject, OpnameProjectDetail,
  MovementType, Uom, StockMovementListRow, StockMovementDetailFull,
  StockLedgerRow, MovementInput, Batch, StockBatch,
} from "@/types";

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

function useResourceList<T>(table: string, params?: Record<string, unknown>) {
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

export function useMovementTypes() {
  return useResourceList<MovementType>("movementTypes");
}

export function useUoms() {
  return useResourceList<Uom>("uom");
}

export function useUom(id?: string) {
  return useResourceOne<Uom>("uom", id);
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

export function useStockMovements(params?: {
  query?: string;
  typeId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
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

export function useProjects(params?: { branchId?: string; projectId?: string }) {
  return useResourceList<Project>("projects", params as Record<string, unknown>);
}

export function useProject(id?: string) {
  return useResourceOne<Project>("projects", id);
}

export function useScanSessions(params?: { projectId?: string; status?: string }) {
  return useResourceList<ScanSession>("scanSessions", params as Record<string, unknown>);
}

export function useScanRecords(params?: { projectId?: string; sessionId?: string; source?: string; date?: string; query?: string; page?: number; pageSize?: number }) {
  return usePaginatedList<ScanRecord>("scanRecords", params as Record<string, unknown>);
}

export interface ProjectSession {
  id: string;
  projectId: string;
  locationId: string | null;
  scannedBy: string | null;
  startedAt: string;
  endedAt: string | null;
  status: string;
  userName: string;
  locationCode: string;
  barcodes: number;
  qty: number;
  itemCount: number;
  lastItemId: string | null;
  lastItemName: string;
  lastItemUnit: string;
}

export interface ProjectSessionsResponse {
  sessions: ProjectSession[];
  totalBarcodes: number;
  totalQty: number;
  itemCount: number;
}

export function useProjectSessions(projectId?: string) {
  return useQuery({
    queryKey: ["project-sessions", projectId],
    queryFn: () => api.get<ProjectSessionsResponse>(`/projects/${projectId}/sessions`),
    enabled: !!projectId,
  });
}

export function useOpnameEntries(projectId?: string) {
  return useResourceList<OpnameEntry>("opnameEntries", projectId ? { projectId } : undefined);
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

// ---- Special endpoints ----

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<{
      active: number; final: number; totalScan: number; totalItems: number;
      progressPct: number; progressCounted: number; progressTotal: number;
      recentSessions: { id: string; code: string; product: string; qty: number; scannedBy: string; at: string }[];
      projectProgressRows: { id: string; name: string; pct: number; warehouse: string; counted: number; total: number; status: ProjectStatus }[];
      warehouseOpname: { warehouseId: string; warehouseName: string; projectName: string; systemQty: number; countedQty: number }[];
    }>("/dashboard"),
  });
}

export function useProjectStats(projectId?: string) {
  return useQuery({
    queryKey: ["project-stats", projectId],
    queryFn: () => api.get<{
      projectId: string;
      progress: { total: number; counted: number; pct: number };
      variance: { itemId: string; itemCode: string; itemName: string; unit: string; systemQty: number; countedQty: number; diff: number }[];
    }>(`/projects/${projectId}/stats`),
    enabled: !!projectId,
  });
}

export function useOpnameProjects() {
  return useQuery({
    queryKey: ["opnameProjects"],
    queryFn: () => api.get<(OpnameProject & {
      jumlahGudang: number;
      status: ProjectStatus;
      progress: { counted: number; total: number; pct: number };
      warehouses: { id: string; warehouseName: string; status: string }[];
    })[]>("/opname-projects"),
  });
}

export function useOpnameProjectDetail(id?: string) {
  return useQuery({
    queryKey: ["opnameProjects", id, "detail"],
    queryFn: () => api.get<OpnameProjectDetail>(`/opname-projects/${id}/detail`),
    enabled: !!id,
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
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; deadline?: string | null } }) =>
      api.patch(`/opname-projects/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opnameProjects"] });
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

export function useBarcodeCheck(projectId?: string, barcode?: string, excludeSessionId?: string) {
  return useQuery({
    queryKey: ["barcode-check", projectId, barcode, excludeSessionId],
    queryFn: () => api.get<{
      exists: boolean;
      record?: { sessionId: string; scannedBy: string; locationCode: string; scannedAt: string };
    }>(`/scan-records/check${qs({ projectId: projectId!, barcode: barcode!, excludeSessionId })}`),
    enabled: !!projectId && !!barcode,
    staleTime: 60_000,
  });
}
