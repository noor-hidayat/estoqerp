// IndexedDB cache untuk master data — agar lookup barcode bisa dilakukan
// offline tanpa hit server. Database ini diisi otomatis saat halaman scan
// memuat data dari React Query, dan dibaca saat tiap scan.

import type { BarcodeFormat, BatchFormat, ItemGroup, Item } from "@/types";

const DB_NAME = "estoq-master";
const DB_VERSION = 3;

const STORES = {
  items: "items",
  itemGroups: "itemGroups",
  barcodeFormats: "barcodeFormats",
  batchFormats: "batchFormats",
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
        s.createIndex("itemGroupId", "itemGroupId", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.itemGroups)) {
        const s = db.createObjectStore(STORES.itemGroups, { keyPath: "id" });
        s.createIndex("code", "code", { unique: false });
      }
      if (db.objectStoreNames.contains("categories")) {
        db.deleteObjectStore("categories");
      }
      if (!db.objectStoreNames.contains(STORES.barcodeFormats)) {
        db.createObjectStore(STORES.barcodeFormats, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.batchFormats)) {
        db.createObjectStore(STORES.batchFormats, { keyPath: "id" });
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
  itemGroups: ItemGroup[];
  barcodeFormats: BarcodeFormat[];
  batchFormats?: BatchFormat[];
}) {
  const db = await openDb();
  try {
    await Promise.all([
      clearStore(db, STORES.items).then(() => putAll(db, STORES.items, opts.items)),
      clearStore(db, STORES.itemGroups).then(() => putAll(db, STORES.itemGroups, opts.itemGroups)),
      clearStore(db, STORES.barcodeFormats).then(() => putAll(db, STORES.barcodeFormats, opts.barcodeFormats)),
      clearStore(db, STORES.batchFormats).then(() => putAll(db, STORES.batchFormats, opts.batchFormats ?? [])),
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
