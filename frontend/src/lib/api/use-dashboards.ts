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
  const { data, isLoading } = useQuery({
    queryKey: ["dashboards", workspaceId ?? "all"],
    queryFn: () => {
      const qs = workspaceId ? `?workspaceId=${workspaceId}` : "";
      return api.get<DashboardSummary[]>(`/dashboards${qs}`);
    },
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
  });
}

/** Id dashboard aktif — tersimpan per browser (localStorage), bukan global. */
export function useActiveDashboardId(dashboards: DashboardSummary[]) {
  const [activeId, setActiveIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACTIVE_KEY);
  });

  useEffect(() => {
    if (!dashboards.length) return;
    const exists = dashboards.some((d) => d.id === activeId);
    if (!exists) {
      const def = dashboards.find((d) => d.isGlobal) ?? dashboards[0];
      setActiveIdState(def.id);
    }
  }, [dashboards, activeId]);

  const setActiveId = (id: string) => {
    localStorage.setItem(ACTIVE_KEY, id);
    setActiveIdState(id);
  };

  return { activeId, setActiveId };
}

// ---- Widget-level mutations ----

export function useWidgetMutations(dashboardId: string) {
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["dashboard", dashboardId] });

  const addWidget = useMutation({
    mutationFn: (body: { type: string; config: WidgetConfig; layout: WidgetLayout }) =>
      api.post<WidgetInstance>(`/dashboards/${dashboardId}/widgets`, body),
    onSuccess: invalidate,
  });

  const updateWidget = useMutation({
    mutationFn: ({
      widgetId,
      patch,
    }: {
      widgetId: string;
      patch: { type?: string; config?: WidgetConfig };
    }) => api.put(`/dashboards/${dashboardId}/widgets/${widgetId}`, patch),
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