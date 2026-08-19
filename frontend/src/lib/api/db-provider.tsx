"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api/client";
import { useSession } from "@/lib/session";
import { ShellLoader } from "@/components/ui/loader";
import type { DB } from "@/lib/mock/store";

export type TableKey = Exclude<keyof DB, "seq">;

type RowOf<K extends TableKey> = DB[K] extends Array<infer U> ? U : never;

interface DataContextValue {
  db: DB;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  insert: <K extends TableKey>(
    table: K,
    row: RowOf<K>
  ) => Promise<string | null>;
  update: <K extends TableKey>(
    table: K,
    id: string,
    patch: Partial<RowOf<K>>
  ) => Promise<string | null>;
  remove: <K extends TableKey>(
    table: K,
    id: string
  ) => Promise<string | null>;
}

const DataContext = createContext<DataContextValue | null>(null);

export const EMPTY_DB: DB = {
  users: [],
  roles: [],
  rolePermissions: [],
  branchAccesses: [],
  userSettings: [],
  branches: [],
  warehouses: [],
  locations: [],
  itemGroups: [],
  items: [],
  stockBalances: [],
  barcodeFormats: [],
  projects: [],
  scanSessions: [],
  scanRecords: [],
  opnameEntries: [],
  seq: 0,
};

async function fetchAll(): Promise<DB> {
  return api.get<DB>("/full");
}

export function DBProvider({ children }: { children: ReactNode }) {
  const { user, loading: sessionLoading } = useSession();
  const [db, setDb] = useState<DB | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dbRef = useRef<DB | null>(null);

  const commit = useCallback((next: DB) => {
    dbRef.current = next;
    setDb(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchAll();
      dbRef.current = next;
      setDb(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data");
    }
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    let cancelled = false;

    void (async () => {
      if (!user) {
        dbRef.current = EMPTY_DB;
        setDb(EMPTY_DB);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const next = await fetchAll();
        if (cancelled) return;
        dbRef.current = next;
        setDb(next);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Gagal memuat data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, sessionLoading]);

  const insert = useCallback(
    async <K extends TableKey>(table: K, row: RowOf<K>) => {
      const current = dbRef.current;
      if (!current) return "Data belum dimuat.";
      commit({
        ...current,
        [table]: [...current[table], row],
      } as DB);
      try {
        await api.post(`/${table}`, row);
        return null;
      } catch (e) {
        void refresh();
        return e instanceof Error ? e.message : "Gagal menyimpan data";
      }
    },
    [commit, refresh]
  );

  const update = useCallback(
    async <K extends TableKey>(table: K, id: string, patch: Partial<RowOf<K>>) => {
      const current = dbRef.current;
      if (!current) return "Data belum dimuat.";
      commit({
        ...current,
        [table]: current[table].map((r) =>
          (r as { id: string }).id === id ? { ...r, ...patch } : r
        ),
      } as DB);
      try {
        await api.patch(`/${table}/${id}`, patch);
        return null;
      } catch (e) {
        void refresh();
        return e instanceof Error ? e.message : "Gagal menyimpan data";
      }
    },
    [commit, refresh]
  );

  const remove = useCallback(
    async <K extends TableKey>(table: K, id: string) => {
      const current = dbRef.current;
      if (!current) return "Data belum dimuat.";
      commit({
        ...current,
        [table]: current[table].filter(
          (r) => (r as { id: string }).id !== id
        ),
      } as DB);
      try {
        await api.del(`/${table}/${id}`);
        return null;
      } catch (e) {
        void refresh();
        return e instanceof Error ? e.message : "Gagal menghapus data";
      }
    },
    [commit, refresh]
  );

  if (sessionLoading) return <ShellLoader />;
  if (user && (loading || (!db && !error))) return <ShellLoader />;
  if (user && !db && error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <button
          onClick={() => void refresh()}
          className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  const value: DataContextValue = {
    db: db ?? EMPTY_DB,
    loading,
    error,
    refresh,
    insert,
    update,
    remove,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DBProvider");
  return ctx;
}

export function useDB(): DB {
  return useData().db;
}
