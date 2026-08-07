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
import { createClient } from "@/lib/supabase/client";
import {
  camelizeRow,
  EMPTY_DB,
  snakeCaseRow,
  TABLE_MAP,
  type TableKey,
} from "@/lib/supabase/rows";
import { useSession } from "@/lib/session";
import { ShellLoader } from "@/components/ui/loader";
import type { DB } from "@/lib/mock/store";
import type { User } from "@/types";

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

async function fetchAll(): Promise<DB> {
  const sb = createClient();
  const [
    branches,
    warehouses,
    locations,
    categories,
    items,
    barcodeFormats,
    projects,
    scanSessions,
    scanRecords,
    opnameEntries,
    approvals,
    profiles,
  ] = await Promise.all([
    sb.from("branches").select("*"),
    sb.from("warehouses").select("*"),
    sb.from("locations").select("*"),
    sb.from("categories").select("*"),
    sb.from("items").select("*"),
    sb.from("barcode_formats").select("*"),
    sb.from("projects").select("*"),
    sb.from("scan_sessions").select("*"),
    sb.from("scan_records").select("*"),
    sb.from("opname_entries").select("*"),
    sb.from("approvals").select("*"),
    sb.from("profiles").select("*"),
  ]);

  const firstError = [
    branches,
    warehouses,
    locations,
    categories,
    items,
    barcodeFormats,
    projects,
    scanSessions,
    scanRecords,
    opnameEntries,
    approvals,
    profiles,
  ].find((r: { error: { message: string } | null }) => r.error);

  if (firstError?.error) {
    throw new Error(firstError.error.message);
  }

  return {
    users: (profiles.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow<User>(r)
    ),
    branches: (branches.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow(r)
    ),
    warehouses: (warehouses.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow(r)
    ),
    locations: (locations.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow(r)
    ),
    categories: (categories.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow(r)
    ),
    items: (items.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow(r)
    ),
    barcodeFormats: (barcodeFormats.data ?? []).map(
      (r: Record<string, unknown>) => camelizeRow(r)
    ),
    projects: (projects.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow(r)
    ),
    scanSessions: (scanSessions.data ?? []).map(
      (r: Record<string, unknown>) => camelizeRow(r)
    ),
    scanRecords: (scanRecords.data ?? []).map(
      (r: Record<string, unknown>) => camelizeRow(r)
    ),
    opnameEntries: (opnameEntries.data ?? []).map(
      (r: Record<string, unknown>) => camelizeRow(r)
    ),
    approvals: (approvals.data ?? []).map((r: Record<string, unknown>) =>
      camelizeRow(r)
    ),
    seq: 0,
  };
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
      const { error: writeError } = await createClient()
        .from(TABLE_MAP[table])
        .insert(snakeCaseRow(row as Record<string, unknown>));
      if (writeError) {
        void refresh();
        return writeError.message;
      }
      return null;
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
      const { error: writeError } = await createClient()
        .from(TABLE_MAP[table])
        .update(snakeCaseRow(patch as Record<string, unknown>))
        .eq("id", id);
      if (writeError) {
        void refresh();
        return writeError.message;
      }
      return null;
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
      const { error: writeError } = await createClient()
        .from(TABLE_MAP[table])
        .delete()
        .eq("id", id);
      if (writeError) {
        void refresh();
        return writeError.message;
      }
      return null;
    },
    [commit, refresh]
  );

  if (sessionLoading) return <ShellLoader />;
  if (user && (loading || (!db && !error))) return <ShellLoader />;
  if (user && !db && error) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center">
        <p className="text-sm text-zinc-600">{error}</p>
        <button
          onClick={() => void refresh()}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-zinc-50"
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
