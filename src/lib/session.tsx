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
import { createClient } from "@/lib/supabase/client";
import { camelizeRow } from "@/lib/supabase/rows";
import type { Role, User } from "@/types";

export const ROLE_LABELS: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  ADMIN: "Admin",
  STAFF: "Staff Gudang",
};

interface SessionValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  hasRole: (roles: Role[]) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string): Promise<User | null> => {
    const sb = createClient();
    const { data, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error || !data) return null;
    return camelizeRow<User>(data);
  }, []);

  useEffect(() => {
    const sb = createClient();
    let disposed = false;

    const finalize = (nextUser: User | null) => {
      if (!disposed) {
        setUser(nextUser);
        setLoading(false);
      }
    };

    const initializeSession = async () => {
      try {
        const { data, error } = await sb.auth.getUser();
        if (disposed) return;

        if (error) {
          console.warn("Session init error", error.message);
          finalize(null);
          return;
        }

        if (data?.user) {
          try {
            const profile = await loadProfile(data.user.id);
            finalize(profile);
          } catch (profileError) {
            console.warn("Profile load failed", profileError);
            finalize(null);
          }
        } else {
          finalize(null);
        }
      } catch (authError) {
        console.warn("Auth initialization failed", authError);
        finalize(null);
      }
    };

    void initializeSession();

    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange(
      (_event: string, session: { user: { id: string } | null } | null) => {
        if (disposed) return;

        if (session?.user) {
          void loadProfile(session.user.id)
            .then((profile) => {
              finalize(profile);
            })
            .catch((profileError) => {
              console.warn("Profile sync failed", profileError);
              finalize(null);
            });
        } else {
          finalize(null);
        }
      }
    );

    return () => {
      disposed = true;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const sb = createClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  }, []);

  const signOut = useCallback(async () => {
    const sb = createClient();
    await sb.auth.signOut();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user]
  );

  const value = useMemo(
    () => ({ user, loading, signIn, signOut, hasRole }),
    [user, loading, signIn, signOut, hasRole]
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
