// GRN store — frontend-only (issue #5).
// Baca/tulis via storage adapter (@/lib/data/storage), tanpa backend/API.
// Koleksi "grnDocs" hanya dipakai modul GRN, tidak menyentuh koleksi lain.

import { useCallback, useEffect, useState } from "react";
import {
  readCollection,
  writeCollection,
  readValue,
  writeValue,
} from "@/lib/data/storage";
import type { GrnDoc } from "./grn-types";

const COLLECTION = "grnDocs";
const COUNTER_KEY = "grnDocCounter";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `grn-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Nomor dokumen lokal: GRN/YYYY/MM/XXXX (counter per bulan). */
export function nextGrnNo(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const key = `${y}/${m}`;
  const counters = readValue<Record<string, number>>(COUNTER_KEY, {});
  const next = (counters[key] ?? 0) + 1;
  writeValue(COUNTER_KEY, { ...counters, [key]: next });
  return `GRN/${y}/${m}/${String(next).padStart(4, "0")}`;
}

export function listGrns(): GrnDoc[] {
  const rows = readCollection<GrnDoc>(COLLECTION);
  return [...rows].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export function getGrn(idOrDocNo: string | undefined): GrnDoc | undefined {
  if (!idOrDocNo) return undefined;
  const rows = readCollection<GrnDoc>(COLLECTION);
  const key = decodeURIComponent(idOrDocNo);
  return rows.find((r) => r.id === key || r.documentNo === key);
}

export function saveGrn(doc: GrnDoc): GrnDoc {
  const rows = readCollection<GrnDoc>(COLLECTION);
  const idx = rows.findIndex((r) => r.id === doc.id);
  const next = idx === -1 ? [...rows, doc] : rows.map((r) => (r.id === doc.id ? doc : r));
  writeCollection(COLLECTION, next);
  return doc;
}

export function createGrnId(): string {
  return uid();
}

export function removeGrn(id: string): void {
  const rows = readCollection<GrnDoc>(COLLECTION);
  writeCollection(
    COLLECTION,
    rows.filter((r) => r.id !== id)
  );
}

/** Hook ringan agar list/detail re-render dari store lokal. */
export function useGrnDocs(): { docs: GrnDoc[]; refresh: () => void } {
  const [docs, setDocs] = useState<GrnDoc[]>(() => listGrns());
  const refresh = useCallback(() => setDocs(listGrns()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { docs, refresh };
}
