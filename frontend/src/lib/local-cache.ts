// IndexedDB cache untuk master data — agar lookup barcode bisa dilakukan
// offline tanpa hit server. Database ini diisi otomatis saat halaman scan
// memuat data dari React Query, dan dibaca saat tiap scan.

import type { BarcodeFormat, Category, Item } from "@/types";

const DB_NAME = "stockops-master";
const DB_VERSION = 1;

const STORES = {
  items: "items",
  categories: "categories",
  barcodeFormats: "barcodeFormats",
  meta: "meta",
} as const;

type StoreName = (typeof STORES)[keyof typeof STORES];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.items)) {
        const s = db.createObjectStore(STORES.items, { keyPath: "id" });
        s.createIndex("code", "code", { unique: false });
        s.createIndex("barcodeId", "barcodeId", { unique: false });
        s.createIndex("categoryId", "categoryId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.categories)) {
        const s = db.createObjectStore(STORES.categories, { keyPath: "id" });
        s.createIndex("code", "code", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.barcodeFormats)) {
        db.createObjectStore(STORES.barcodeFormats, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" });
      }
    };
  });
}

async function clearStore(db: IDBDatabase, store: StoreName) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function putAll<T>(db: IDBDatabase, store: StoreName, rows: T[]) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const s = tx.objectStore(store);
    for (const row of rows) s.put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
    db.close();
  });
}

export async function syncMasterCache(opts: {
  items: Item[];
  categories: Category[];
  barcodeFormats: BarcodeFormat[];
}) {
  const db = await openDb();
  try {
    await Promise.all([
      clearStore(db, STORES.items).then(() => putAll(db, STORES.items, opts.items)),
      clearStore(db, STORES.categories).then(() => putAll(db, STORES.categories, opts.categories)),
      clearStore(db, STORES.barcodeFormats).then(() => putAll(db, STORES.barcodeFormats, opts.barcodeFormats)),
    ]);
    await setMeta("lastSync", Date.now());
  } finally {
    db.close();
  }
}

export async function getMeta(key: string): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.meta, "readonly");
    const req = tx.objectStore(STORES.meta).get(key);
    req.onsuccess = () => {
      db.close();
      resolve(req.result?.value ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

export async function setMeta(key: string, value: unknown) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.meta, "readwrite");
    const req = tx.objectStore(STORES.meta).put({ key, value });
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}
