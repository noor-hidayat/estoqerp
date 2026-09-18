// Putaway store — frontend-only (issue #7).
// Baca/tulis via storage adapter (@/lib/data/storage), tanpa backend/API.
// Koleksi "putawayDocs" hanya dipakai modul Putaway, tidak menyentuh koleksi lain.
// Pola disamakan dengan modul GRN (grn-store.ts).

import { useCallback, useEffect, useState } from "react";
import {
  readCollection,
  writeCollection,
  readValue,
  writeValue,
} from "@/lib/data/storage";
import type { PutawayDoc } from "./putaway-types";

const COLLECTION = "putawayDocs";
const COUNTER_KEY = "putawayDocCounter";

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `putaway-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Nomor dokumen lokal: PUTAWAY/YYYY/MM/XXXX (counter per bulan). */
export function nextPutawayNo(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const key = `${y}/${m}`;
  const counters = readValue<Record<string, number>>(COUNTER_KEY, {});
  const next = (counters[key] ?? 0) + 1;
  writeValue(COUNTER_KEY, { ...counters, [key]: next });
  return `PUTAWAY/${y}/${m}/${String(next).padStart(4, "0")}`;
}

export function listPutaways(): PutawayDoc[] {
  const rows = readCollection<PutawayDoc>(COLLECTION);
  return [...rows].sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));
}

export function getPutaway(idOrDocNo: string | undefined): PutawayDoc | undefined {
  if (!idOrDocNo) return undefined;
  const rows = readCollection<PutawayDoc>(COLLECTION);
  const key = decodeURIComponent(idOrDocNo);
  return rows.find((r) => r.id === key || r.documentNo === key);
}

export function savePutaway(doc: PutawayDoc): PutawayDoc {
  const rows = readCollection<PutawayDoc>(COLLECTION);
  const idx = rows.findIndex((r) => r.id === doc.id);
  const next = idx === -1 ? [...rows, doc] : rows.map((r) => (r.id === doc.id ? doc : r));
  writeCollection(COLLECTION, next);
  return doc;
}

export function createPutawayId(): string {
  return uid();
}

export function removePutaway(id: string): void {
  const rows = readCollection<PutawayDoc>(COLLECTION);
  writeCollection(
    COLLECTION,
    rows.filter((r) => r.id !== id)
  );
}

/** Hook ringan agar list/detail re-render dari store lokal. */
export function usePutawayDocs(): { docs: PutawayDoc[]; refresh: () => void } {
  const [docs, setDocs] = useState<PutawayDoc[]>(() => listPutaways());
  const refresh = useCallback(() => setDocs(listPutaways()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return { docs, refresh };
}
