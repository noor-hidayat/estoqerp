import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearTokens, getAccessToken, getTokens, setTokens, isLocalMode } from "@/lib/api/client";
import type { User } from "@/types";

// Development user untuk fase frontend-first (issue #3): user dianggap
// sudah login, tanpa halaman Login / JWT / session validation.
const DEV_USER: User = {
  id: "dev-user",
  name: "Developer",
  email: "dev@estoq.local",
  role: "role_sys_admin",
  active: true,
  avatarHue: 210,
};

export const ROLE_LABELS: Record<string, string> = {
  role_sys_admin: "Administrator",
  role_admin: "Admin",
  role_staff: "Warehouse Staff",
};

export interface SessionAccess {
  branchIds: string[];
  warehouseIds: string[];
  workspaceIds: string[];
}

interface SessionValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (roles: string[]) => boolean;
  isSystem: boolean;
  permissions: { menu: string; action: string }[];
  access: SessionAccess;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

interface MeResponse extends User {
  isSystem: boolean;
  permissions: { menu: string; action: string }[];
  access: { branchIds: string[]; warehouseIds: string[]; workspaceIds: string[] };
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSystem, setIsSystem] = useState(false);
  const [permissions, setPermissions] = useState<{ menu: string; action: string }[]>([]);
  const [access, setAccess] = useState<SessionAccess>({ branchIds: [], warehouseIds: [], workspaceIds: [] });

  useEffect(() => {
    let disposed = false;

    // Mode lokal: langsung pakai dev user — tanpa token, tanpa /auth/me.
    if (isLocalMode()) {
      setUser(DEV_USER);
      setIsSystem(true);
      setPermissions([]);
      setAccess({ branchIds: [], warehouseIds: [], workspaceIds: [] });
      setLoading(false);
      return () => {
        disposed = true;
        void disposed;
      };
    }

    const applyMe = (me: MeResponse) => {
      setUser(me);
      setIsSystem(me.isSystem ?? false);
      setPermissions(me.permissions ?? []);
      setAccess(me.access ?? { branchIds: [], warehouseIds: [], workspaceIds: [] });
    };

    const initializeSession = async () => {
      const accessToken = getAccessToken();
      if (!accessToken) {
        if (!disposed) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      try {
        const me = await api.get<MeResponse>("/auth/me");
        if (!disposed) applyMe(me);
      } catch (e) {
        console.warn("Session init error", e);
        clearTokens();
        if (!disposed) setUser(null);
      } finally {
        if (!disposed) setLoading(false);
      }
    };

    void initializeSession();

    // Permission role bisa berubah kapan pun di Role Management — sinkronkan
    // kembali (menu sidebar, tombol, dll) saat jendela difokuskan ulang.
    const onFocus = () => {
      if (getAccessToken() && !disposed) {
        void api
          .get<MeResponse>("/auth/me")
          .then((me) => {
            if (!disposed) applyMe(me);
          })
          .catch(() => {
            // abaikan — sesi tetap berjalan, hanya tidak di-refresh
          });
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      disposed = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Mode lokal: login selalu "berhasil" sebagai dev user.
    if (isLocalMode()) {
      void email;
      void password;
      setUser(DEV_USER);
      setIsSystem(true);
      return { error: null };
    }
    try {
      const data = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);

      // Fetch full session (permissions, isSystem, access) so sidebar is
      // immediately populated instead of empty on first login.
      try {
        const me = await api.get<MeResponse>("/auth/me");
        setIsSystem(me.isSystem ?? false);
        setPermissions(me.permissions ?? []);
        setAccess(me.access ?? { branchIds: [], warehouseIds: [], workspaceIds: [] });
      } catch {
        // If /auth/me fails right after login, ignore — the worst case is
        // the same old behaviour (empty sidebar until refresh).
      }

      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Login gagal." };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      const tokens = getTokens();
      if (tokens?.refresh) {
        await api.post("/auth/logout", { refreshToken: tokens.refresh });
      }
    } catch {
      // abaikan — tetap logout di sisi klien
    }
    clearTokens();
    setUser(null);
    setIsSystem(false);
    setPermissions([]);
    setAccess({ branchIds: [], warehouseIds: [], workspaceIds: [] });
  }, []);

  const hasRole = useCallback(
    (roles: string[]) => {
      if (!user) return false;
      // Direct match (legacy) OR normalized match (SYS_ADMIN ↔ role_sys_admin) OR
      // SYS_ADMIN via isSystem flag (company settings etc. only check hasRole).
      if (roles.includes(user.role)) return true;
      const normUser = (() => {
        if (user.role === "SYS_ADMIN" || user.role === "role_sys_admin") return "role_sys_admin";
        if (user.role === "ADMIN" || user.role === "role_admin") return "role_admin";
        if (user.role === "STAFF" || user.role === "role_staff") return "role_staff";
        return user.role;
      })();
      if (roles.includes(normUser)) return true;
      // Map requested roles through same normalization
      const normRequested = roles.map((r) => {
        if (r === "SYS_ADMIN" || r === "role_sys_admin") return "role_sys_admin";
        if (r === "ADMIN" || r === "role_admin") return "role_admin";
        if (r === "STAFF" || r === "role_staff") return "role_staff";
        return r;
      });
      if (normRequested.includes(normUser)) return true;
      // SYS_ADMIN (isSystem) is allowed to pass any admin-level role guard
      if (isSystem && roles.some((r) => r === "role_sys_admin" || r === "SYS_ADMIN")) return true;
      return false;
    },
    [user, isSystem]
  );

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, hasRole, isSystem, permissions, access }),
    [user, loading, signIn, signOut, hasRole, isSystem, permissions, access]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}