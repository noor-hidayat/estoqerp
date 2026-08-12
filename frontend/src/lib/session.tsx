"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearTokens, getAccessToken, getTokens, setTokens } from "@/lib/api/client";
import type { User } from "@/types";

export const ROLE_LABELS: Record<string, string> = {
  role_sys_admin: "Administrator",
  role_admin: "Admin",
  role_staff: "Staff Gudang",
};

export interface SessionAccess {
  branchIds: string[];
  warehouseIds: string[];
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
  access: { branchIds: string[]; warehouseIds: string[] };
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSystem, setIsSystem] = useState(false);
  const [permissions, setPermissions] = useState<{ menu: string; action: string }[]>([]);
  const [access, setAccess] = useState<SessionAccess>({ branchIds: [], warehouseIds: [] });

  useEffect(() => {
    let disposed = false;

    const applyMe = (me: MeResponse) => {
      setUser(me);
      setIsSystem(me.isSystem ?? false);
      setPermissions(me.permissions ?? []);
      setAccess(me.access ?? { branchIds: [], warehouseIds: [] });
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
    try {
      const data = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
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
    setAccess({ branchIds: [], warehouseIds: [] });
  }, []);

  const hasRole = useCallback(
    (roles: string[]) => (user ? roles.includes(user.role) : false),
    [user]
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
