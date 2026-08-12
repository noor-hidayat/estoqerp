import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type {
  Branch, Warehouse, Location, Category, Item, StockBalance,
  BarcodeFormat, Project, ScanSession, ScanRecord, OpnameEntry,
  User, Role, RolePermission, BranchAccess,
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

function usePaginatedList<T>(table: string, params?: Record<string, unknown>) {
  return useQuery({
    queryKey: [table, params],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<T>>(`/${table}${qs(params ?? {})}`);
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

export function useBranches() {
  return useResourceList<Branch>("branches");
}

export function useWarehouses(branchId?: string) {
  return useResourceList<Warehouse>("warehouses", branchId ? { branchId } : undefined);
}

export function useAllWarehouses() {
  return useResourceList<Warehouse>("warehouses");
}

export function useLocations(warehouseId?: string) {
  return useResourceList<Location>("locations", warehouseId ? { warehouseId } : undefined);
}

export function useCategories() {
  return useResourceList<Category>("categories");
}

export function useItems(params?: { query?: string; categoryId?: string; page?: number; pageSize?: number }) {
  return usePaginatedList<Item>("items", params as Record<string, unknown>);
}

export function useItemsList(params?: { query?: string; categoryId?: string }) {
  return useResourceList<Item>("items", params as Record<string, unknown>);
}

export function useStockBalances(params?: { warehouseId?: string; itemId?: string }) {
  return useResourceList<StockBalance>("stockBalances", params as Record<string, unknown>);
}

export function useBarcodeFormats() {
  return useResourceList<BarcodeFormat>("barcodeFormats");
}

export function useProjects(params?: { branchId?: string }) {
  return useResourceList<Project>("projects", params as Record<string, unknown>);
}

export function useProject(id?: string) {
  return useResourceOne<Project>("projects", id);
}

export function useScanSessions(params?: { projectId?: string; status?: string }) {
  return useResourceList<ScanSession>("scanSessions", params as Record<string, unknown>);
}

export function useScanRecords(params?: { projectId?: string; sessionId?: string; source?: string; date?: string; page?: number; pageSize?: number }) {
  return usePaginatedList<ScanRecord>("scanRecords", params as Record<string, unknown>);
}

export function useOpnameEntries(projectId?: string) {
  return useResourceList<OpnameEntry>("opnameEntries", projectId ? { projectId } : undefined);
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
      projectProgressRows: { id: string; name: string; pct: number; warehouse: string }[];
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

export function useItemLookup(barcode: string | null, formatId?: string) {
  return useQuery({
    queryKey: ["item-lookup", barcode, formatId],
    queryFn: () => api.get<{
      found: boolean;
      matched?: boolean;
      detail?: string;
      item?: Item;
      category?: { id: string; code: string; name: string } | null;
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
