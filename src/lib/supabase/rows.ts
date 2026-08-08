import type { DB } from "@/lib/mock/store";

export type TableKey = Exclude<keyof DB, "seq">;

export const TABLE_MAP: Record<TableKey, string> = {
  users: "profiles",
  branches: "branches",
  warehouses: "warehouses",
  locations: "locations",
  categories: "categories",
  items: "items",
  barcodeFormats: "barcode_formats",
  projects: "projects",
  scanSessions: "scan_sessions",
  scanRecords: "scan_records",
  opnameEntries: "opname_entries",
};

export function camelizeRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return out as T;
}

export function snakeCaseRow<T extends Record<string, unknown>>(
  row: T
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase())] = v;
  }
  return out;
}

export const EMPTY_DB: DB = {
  users: [],
  branches: [],
  warehouses: [],
  locations: [],
  categories: [],
  items: [],
  barcodeFormats: [],
  projects: [],
  scanSessions: [],
  scanRecords: [],
  opnameEntries: [],
  seq: 0,
};
