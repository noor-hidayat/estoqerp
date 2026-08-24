import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";

export interface DashboardLayout {
  order: string[];
  hidden: string[];
  spans?: Record<string, number>;
}

const LAYOUT_KEY = "dashboard.layout";

interface UserSettingRow {
  id: string;
  userId: string;
  key: string;
  value: DashboardLayout;
}

export function useDashboardLayout() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["userSettings", LAYOUT_KEY],
    queryFn: async () => {
      const rows = await api.get<UserSettingRow[]>("/userSettings");
      return rows.find((r) => r.key === LAYOUT_KEY) ?? null;
    },
  });

  const mutation = useMutation({
    mutationFn: async (layout: DashboardLayout) => {
      const existing = qc.getQueryData<UserSettingRow | null>([
        "userSettings",
        LAYOUT_KEY,
      ]);
      if (existing?.id) {
        await api.patch(`/userSettings/${existing.id}`, { value: layout });
      } else {
        await api.post("/userSettings", { key: LAYOUT_KEY, value: layout });
      }
    },
    onMutate: (layout) => {
      qc.setQueryData<UserSettingRow | null>(["userSettings", LAYOUT_KEY], {
        id: "optimistic",
        userId: "",
        key: LAYOUT_KEY,
        value: layout,
      } as UserSettingRow);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["userSettings", LAYOUT_KEY] });
    },
  });

  return {
    layout: data?.value ?? null,
    isLoading,
    save: (layout: DashboardLayout) => mutation.mutate(layout),
    isSaving: mutation.isPending,
  };
}
