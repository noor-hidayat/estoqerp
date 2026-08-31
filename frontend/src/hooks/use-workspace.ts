import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { useWorkspaces } from "@/lib/api/query";
import { WORKSPACES } from "@/components/app-shell/nav";

const ACTIVE_KEY = "workspace.activeId";

export function useActiveWorkspace() {
  const { access, isSystem } = useSession();
  const { data: workspaces = [] } = useWorkspaces();

  const accessible = useMemo(() => {
    if (isSystem) return workspaces;
    const ids = new Set(access.workspaceIds);
    // fallback to static WORKSPACES if API not yet loaded but access has ids
    if (workspaces.length === 0 && ids.size > 0) {
      return WORKSPACES.filter((w) => ids.has(w.id)) as unknown as typeof workspaces;
    }
    return workspaces.filter((w) => ids.has(w.id));
  }, [workspaces, access.workspaceIds, isSystem]);

  const [activeId, setActiveIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (accessible.length === 0) return;
    const exists = accessible.some((w) => w.id === activeId);
    if (!exists) {
      const fallback = accessible[0]?.id ?? workspaces[0]?.id ?? null;
      if (fallback) {
        try {
          localStorage.setItem(ACTIVE_KEY, fallback);
        } catch {}
        setActiveIdState(fallback);
      }
    }
  }, [accessible, activeId, workspaces]);

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
    // reload page to refresh sidebar, queries, and all workspace-scoped data
    window.location.reload();
  }, []);

  const active = useMemo(() => {
    return accessible.find((w) => w.id === activeId) ?? accessible[0] ?? null;
  }, [accessible, activeId]);

  return { workspaces: accessible, allWorkspaces: workspaces, activeId: active?.id ?? null, active, setActiveId };
}
