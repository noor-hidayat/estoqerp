import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import type { WidgetConfig, WidgetInstance, WidgetLayout } from "@/components/dashboard/types";

export interface DashboardSummary {
  id: string;
  name: string;
  ownerId: string | null;
  branchId: string | null;
  workspaceId: string | null;
  isGlobal: boolean;
  createdAt: string;
}

export interface DashboardDetail extends DashboardSummary {
  widgets: WidgetInstance[];
}

const ACTIVE_KEY = "dashboard.activeId";

export function useDashboards(workspaceId?: string | null) {
  const qc = useQueryClient();
  // workspaceId === undefined = belum siap (tunggu workspaces), null = siap tapi tanpa filter (fetch all)
  const enabled = workspaceId !== undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["dashboards", workspaceId ?? "all"],
    queryFn: () => {
      const qs = workspaceId ? `?workspaceId=${workspaceId}` : "";
      return api.get<DashboardSummary[]>(`/dashboards${qs}`);
    },
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const create = useMutation({
    mutationFn: (body: { name: string; isGlobal?: boolean }) =>
      api.post<{ id: string }>("/dashboards", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboards"] }),
  });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.put(`/dashboards/${id}`, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboards"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/dashboards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboards"] }),
  });

  return {
    dashboards: data ?? [],
    isLoading,
    create,
    update,
    remove,
  };
}

export function useDashboard(id?: string) {
  return useQuery({
    queryKey: ["dashboard", id],
    enabled: !!id,
    queryFn: () => api.get<DashboardDetail>(`/dashboards/${id}`),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

/** Id dashboard aktif — tersimpan per browser (localStorage), bukan global. */
export function useActiveDashboardId(dashboards: DashboardSummary[], workspaceId?: string | null) {
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_KEY);
  });

  useEffect(() => {
    if (!dashboards.length) return;
    const exists = dashboards.some((d) => d.id === activeId);
    if (!exists) {
      const def =
        (workspaceId ? dashboards.find((d) => d.workspaceId === workspaceId) : null) ??
        dashboards.find((d) => d.workspaceId) ??
        dashboards[0];
      setActiveIdState(def.id);
    } else if (workspaceId) {
      // Jika ada dashboard spesifik workspace dan active masih global-ish, prefer spesifik
      const hasSpecific = dashboards.some((d) => d.workspaceId === workspaceId);
      const active = dashboards.find((d) => d.id === activeId);
      const activeIsGlobal = active ? !active.workspaceId || active.isGlobal : false;
      if (hasSpecific && activeIsGlobal) {
        const specific = dashboards.find((d) => d.workspaceId === workspaceId)!;
        setActiveIdState(specific.id);
      }
    }
  }, [dashboards, activeId, workspaceId]);

  const setActiveId = (id: string) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveIdState(id);
  };

  return { activeId, setActiveId };
}

export function useDashboardTemplates(workspaceId?: string | null) {
  return useQuery({
    queryKey: ["dashboard-templates", workspaceId ?? "all"],
    queryFn: () => {
      const qs = workspaceId ? `?workspaceId=${workspaceId}` : "";
      return api.get<import("@/components/dashboard/widget-registry").WidgetTemplate[]>(`/dashboard-templates${qs}`);
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export interface DashboardWidgetsData {
  widgets: {
    id: string;
    type: string;
    layout: WidgetLayout;
    title: string;
    templateId: string | null;
    rows: import("@/components/dashboard/types").WidgetRow[];
    error: string | null;
    config: WidgetConfig;
    percentChange?: number | null;
    periodLabel?: string | null;
    previousValue?: number | null;
  }[];
}

export function useDashboardWidgetsData(dashboardId?: string) {
  return useQuery({
    queryKey: ["dashboard-widgets-data", dashboardId],
    enabled: !!dashboardId,
    queryFn: () => api.get<DashboardWidgetsData>(`/dashboards/${dashboardId}/widgets/data`),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

// ---- Widget-level mutations ----

export function useWidgetMutations(dashboardId: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dashboard", dashboardId] });
    qc.invalidateQueries({ queryKey: ["dashboard-widgets-data", dashboardId] });
  };

  const addWidget = useMutation({
    mutationFn: (body: { type: string; config: WidgetConfig; layout: WidgetLayout } | { templateId: string; title?: string; layout: WidgetLayout }) =>
      api.post<WidgetInstance>(`/dashboards/${dashboardId}/widgets`, body as unknown as Record<string, unknown>),
    onSuccess: invalidate,
  });

  const updateWidget = useMutation({
    mutationFn: ({
      widgetId,
      patch,
    }: {
      widgetId: string;
      patch: { type?: string; config?: WidgetConfig } | { templateId: string; title?: string };
    }) => api.put(`/dashboards/${dashboardId}/widgets/${widgetId}`, patch as unknown as Record<string, unknown>),
    onSuccess: invalidate,
  });

  const deleteWidget = useMutation({
    mutationFn: (widgetId: string) =>
      api.del(`/dashboards/${dashboardId}/widgets/${widgetId}`),
    onSuccess: invalidate,
  });

  const saveLayout = useMutation({
    mutationFn: (widgets: { id: string; layout: WidgetLayout }[]) =>
      api.patch(`/dashboards/${dashboardId}/layout`, { widgets }),
    onSuccess: invalidate,
  });

  return { addWidget, updateWidget, deleteWidget, saveLayout };
}