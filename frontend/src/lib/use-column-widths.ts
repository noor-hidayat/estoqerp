"use client";

import { useMemo, useState } from "react";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";

export const COLUMN_WIDTH_MENU = "settings.columnWidth";

const STEP = 0.25;

export const DEFAULT_COLUMN_WIDTHS: Record<string, Record<string, number>> = {
  warehouses: { 0: 0.5, 1: 1, 2: 5.5, 3: 1.5, 4: 1, 5: 0.5 },
  users: { 0: 0.5, 1: 2, 2: 3, 3: 2, 4: 1, 5: 1, 6: 0.5 },
  "reports-project": { 0: 0.5, 1: 1, 2: 3.5, 3: 1.5, 4: 0.5, 5: 1, 6: 1, 7: 1 },
  locations: { 0: 0.5, 1: 1, 2: 4, 3: 2, 4: 2, 5: 0.5 },
  categories: { 0: 0.5, 1: 1.5, 2: 5.5, 3: 2, 4: 0.5 },
  branches: { 0: 0.5, 1: 1, 2: 5, 3: 1.5, 4: 1.5, 5: 0.5 },
  "reports-history": { 0: 0.5, 1: 1.5, 2: 1, 3: 2, 4: 2, 5: 1, 6: 1, 7: 1 },
  "variance-review": { 0: 0.5, 1: 1.5, 2: 3, 3: 2, 4: 1.5, 5: 1.5 },
  "reports-variance": { 0: 0.5, 1: 2, 2: 2, 3: 2, 4: 0.5, 5: 1, 6: 1, 7: 1 },
  items: { 0: 0.5, 1: 1, 2: 3.5, 3: 1.5, 4: 0.5, 5: 1.5, 6: 1, 7: 0.5 },
  "reports-summary": { 0: 0.5, 1: 2.5, 2: 3, 3: 1, 4: 2, 5: 1 },
  "barcode-formats": { 0: 0.5, 1: 2, 2: 3.5, 3: 1, 4: 1.5, 5: 1, 6: 0.5 },
  opname: { 0: 0.5, 1: 1.5, 2: 3.5, 3: 2.5, 4: 1.5, 5: 0.5 },
  "stock-balance": { 0: 0.5, 1: 1, 2: 3.5, 3: 1, 4: 2.5, 5: 0.5, 6: 1 },
  roles: { 0: 0.5, 1: 4, 2: 1, 3: 1, 4: 1, 5: 1.5, 6: 0.5, 7: 0.5 },
  "scan-sessions": { 0: 0.5, 1: 1.5, 2: 1.5, 3: 1, 4: 1, 5: 0.5, 6: 1.75, 7: 1.75, 8: 0.5 },
  "session-records": { 0: 0.5, 1: 2, 2: 3.5, 3: 1, 4: 1, 5: 2 },
  "project-variance": { 0: 0.5, 1: 3, 2: 1.5, 3: 1.5, 4: 1.5, 5: 2 },
};

function defaultWidths(count: number): number[] {
  const widths = Array.from({ length: count }, () => 1);
  let total = widths.reduce((a, b) => a + b, 0);
  let i = 0;
  while (total < 10) {
    widths[i % count] += 1;
    total += 1;
    i += 1;
  }
  return widths;
}

function snap(v: number): number {
  return Math.round(v / STEP) * STEP;
}

function parseWidths(value: unknown, count: number): number[] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, number>;
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const v = Number(raw[String(i)]);
    if (!Number.isFinite(v)) return null;
    out.push(Math.max(0, Math.min(10, snap(v))));
    sum += out[i];
  }
  if (sum !== 10) return null;
  return out;
}

export function useColumnWidths(storageKey: string, count: number) {
  const { user, isSystem, permissions } = useSession();
  const localKey = `columnWidth:${storageKey}`;
  const builtin = useMemo(
    () => parseWidths(DEFAULT_COLUMN_WIDTHS[storageKey], count),
    [storageKey, count]
  );

  const [widths, setWidths] = useState<number[]>(
    () => builtin ?? defaultWidths(count)
  );

  const canEdit = user
    ? can(isSystem, permissions, COLUMN_WIDTH_MENU, "update") ||
      can(isSystem, permissions, COLUMN_WIDTH_MENU, "create")
    : false;

  const save = (next: number[]) => {
    setWidths(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(localKey, JSON.stringify(next));
    }
  };

  return {
    widths,
    canEdit,
    save,
    settingKey: localKey,
  };
}
