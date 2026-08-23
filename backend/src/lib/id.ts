import { desc, sql } from "drizzle-orm";
import type { AnyPgColumn, AnyPgTable } from "drizzle-orm/pg-core";

// Format id global: {prefix}-{YYMM}-{SERIAL4}  contoh: itm-2608-0001
// Serial reset setiap bulan (YYMM dari tanggal pembuatan), 4 digit per tabel.

export function yymmOf(date: Date | string = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${String(d.getFullYear()).slice(-2)}${String(
    d.getMonth() + 1
  ).padStart(2, "0")}`;
}

export interface IdExecutor {
  select: (fields: Record<string, AnyPgColumn>) => any;
  execute: (q: any) => Promise<unknown>;
}

/**
 * Id serial berikutnya untuk sebuah tabel, dihitung dari id terakhir yang
 * cocok dengan prefix + bulan berjalan. Opsional kunci tabel (dipakai dalam
 * transaksi agar aman dari balapan antar request).
 */
export async function nextRowId(
  exec: IdExecutor,
  table: AnyPgTable,
  prefix: string,
  date: Date | string = new Date(),
  opts: { lock?: boolean } = {}
): Promise<string> {
  const idCol = (table as unknown as { id: AnyPgColumn }).id;
  if (opts.lock) {
    await exec.execute(sql`LOCK TABLE ${table} IN EXCLUSIVE MODE`);
  }
  const base = `${prefix}-${yymmOf(date)}-`;
  const rows = (await exec
    .select({ id: idCol })
    .from(table)
    .where(sql`${idCol} LIKE ${base + "%"}`)
    .orderBy(desc(idCol))
    .limit(1)) as { id: string }[];
  const last = rows[0]?.id;
  const n = last ? (Number(String(last).split("-").pop()) || 0) + 1 : 1;
  return `${base}${String(n).padStart(4, "0")}`;
}

/** Counter in-memory untuk seed (bukan DB) — format sama dengan nextRowId. */
export function nextSeedId(
  counters: Map<string, number>,
  prefix: string,
  date: Date | string = new Date()
): string {
  const key = `${prefix}-${yymmOf(date)}`;
  const n = (counters.get(key) ?? 0) + 1;
  counters.set(key, n);
  return `${key}-${String(n).padStart(4, "0")}`;
}