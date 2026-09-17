import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { useWorkspaces } from "@/lib/api/query";
import { WORKSPACES } from "@/components/layout/nav";

const ACTIVE_KEY = "workspace.activeId";

export function useActiveWorkspace() {
  const { access, isSystem } = useSession();
  const { data: workspaces = [], isLoading: wsLoading } = useWorkspaces();

  const accessible = useMemo(() => {
    if (isSystem) return workspaces;
    const ids = new Set(access.workspaceIds);
    // fallback to static WORKSPACES if API not yet loaded but access has ids
    if (workspaces.length === 0 && ids.size > 0) {
      return WORKSPACES.filter((w) => ids.has(w.id)) as unknown as typeof workspaces;
    }
    return workspaces.filter((w) => ids.has(w.id));
  }, [workspaces, access.workspaceIds, isSystem]);

  // undefined = belum siap (workspaces/access masih loading), null = siap tapi tidak ada workspace
  const [activeId, setActiveIdState] = useState<string | null | undefined>(() => {
    try {
      const v = localStorage.getItem(ACTIVE_KEY);
      return v ?? undefined;
    } catch {
      return undefined;
    }
  });

  useEffect(() => {
    if (wsLoading) return;
    if (accessible.length === 0) {
      // Tidak ada workspace accessible — tandai siap dengan null agar caller bisa fetch fallback "all"
      if (activeId === undefined) setActiveIdState(null);
      return;
    }
    const exists = accessible.some((w) => w.id === activeId);
    if (!exists) {
      const fallback = accessible[0]?.id ?? workspaces[0]?.id ?? null;
      if (fallback) {
        try {
          localStorage.setItem(ACTIVE_KEY, fallback);
        } catch {}
        setActiveIdState(fallback);
      } else if (activeId === undefined) {
        setActiveIdState(null);
      }
    }
  }, [accessible, activeId, workspaces, wsLoading]);

  const setActiveId = useCallback((id: string) => {
    try {
      localStorage.setItem(ACTIVE_KEY, id);
    } catch {}
    setActiveIdState(id);
    // also persist to user_settings for cross-device (fire-and-forget)
    // dynamic import to avoid cycle
    import("@/lib/api/client").then(({ api }) => {
      api.post("/userSettings", { key: "workspace.activeId", value: { workspaceId: id } }).catch(() => {});
    });
    // tiap pindah workspace langsung arahkan ke dashboard (bukan reload halaman saat ini)
    window.location.href = "/app";
  }, []);

  const active = useMemo(() => {
    if (activeId === undefined) return null;
    return accessible.find((w) => w.id === activeId) ?? accessible[0] ?? null;
  }, [accessible, activeId]);

  // activeId undefined = masih pending, jangan fetch dashboards dulu
  const resolvedId = activeId === undefined ? undefined : (active?.id ?? null);
  return { workspaces: accessible, allWorkspaces: workspaces, activeId: resolvedId, active, setActiveId };
}
