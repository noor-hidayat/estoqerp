"use client";

import * as XLSX from "xlsx";
import { api } from "@/lib/api/client";

export type DatasetId = "branches" | "warehouses" | "locations" | "categories" | "items" | "stockBalances";

export interface DatasetColumn {
  /** Key kolom di spreadsheet (header persis). */
  key: string;
  /** Label tampilan singkat. */
  label: string;
  /** true jika wajib diisi pada setiap baris. */
  required: boolean;
  /** Petunjuk kecil di header/hint saat upload. */
  hint?: string;
}

export interface DatasetDescriptor {
  id: DatasetId;
  label: string;
  description: string;
  /** Contoh baris pertama untuk template XLSX. */
  sample: Record<string, string | number>;
  /** Definisi kolom (urutan = urutan kolom template). */
  columns: DatasetColumn[];
}

export const DATASETS: DatasetDescriptor[] = [
  {
    id: "branches",
    label: "Cabang (Branches)",
    description: "Daftar cabang/plant. Wajib ada sebelum mengimpor gudang.",
    columns: [
      { key: "code", label: "Kode Cabang", required: true, hint: "Unik. Contoh: JKT, SBY" },
      { key: "name", label: "Nama Cabang", required: true, hint: "Contoh: Jakarta Pusat" },
      { key: "city", label: "Kota", required: false, hint: "Opsional" },
    ],
    sample: { code: "JKT", name: "Jakarta Pusat", city: "Jakarta" },
  },
  {
    id: "warehouses",
    label: "Gudang (Warehouses)",
    description: "Gudang di bawah cabang. Impor cabang dulu agar branchCode dikenali.",
    columns: [
      { key: "branchCode", label: "Kode Cabang", required: true, hint: "Harus ada di tabel Cabang" },
      { key: "code", label: "Kode Gudang", required: true, hint: "Unik per cabang. Contoh: WH-A" },
      { key: "name", label: "Nama Gudang", required: true },
    ],
    sample: { branchCode: "JKT", code: "WH-A", name: "Gudang A" },
  },
  {
    id: "locations",
    label: "Lokasi/Rak (Locations)",
    description: "Lokasi penyimpanan dalam gudang. Impor gudang dulu.",
    columns: [
      { key: "warehouseCode", label: "Kode Gudang", required: true, hint: "Harus ada di tabel Gudang" },
      { key: "branchCode", label: "Kode Cabang", required: false, hint: "Pemilik gudang (verifikasi tambahan)" },
      { key: "code", label: "Kode Lokasi", required: true, hint: "Unik per gudang. Contoh: R-01" },
      { key: "name", label: "Nama Lokasi", required: true },
    ],
    sample: { warehouseCode: "WH-A", branchCode: "JKT", code: "R-01", name: "Rak 01" },
  },
  {
    id: "categories",
    label: "Kategori (Categories)",
    description: "Kategori produk. Impor ini sebelum item.",
    columns: [
      { key: "code", label: "Kode Kategori", required: true, hint: "Unik. Contoh: FOOD" },
      { key: "name", label: "Nama Kategori", required: true },
    ],
    sample: { code: "FOOD", name: "Makanan" },
  },
  {
    id: "items",
    label: "Item (Produk)",
    description: "Master item/produk. Impor kategori dulu.",
    columns: [
      { key: "code", label: "Kode Item", required: true, hint: "Unik. Contoh: ITM-0001" },
      { key: "name", label: "Nama Item", required: true },
      { key: "unit", label: "Satuan", required: false, hint: "pcs/box/kg. Default: pcs" },
      { key: "categoryCode", label: "Kode Kategori", required: true, hint: "Harus ada di tabel Kategori" },
      { key: "price", label: "Harga", required: false, hint: "Angka, default 0" },
      { key: "qty", label: "Qty", required: false, hint: "Angka stok awal, opsional" },
      { key: "hue", label: "Hue Avatar", required: false, hint: "0-360, default 200" },
      { key: "barcodeId", label: "Barcode ID", required: false, hint: "String unik opsional" },
    ],
    sample: { code: "ITM-0001", name: "Indomie Goreng", unit: "pcs", categoryCode: "FOOD", price: 3500, qty: 10, hue: 30, barcodeId: "8991001234" },
  },
  {
    id: "stockBalances",
    label: "Stock (Stock Balances)",
    description: "Stok per item di setiap gudang. Impor gudang dan item dulu.",
    columns: [
      { key: "warehouseCode", label: "Kode Gudang", required: true, hint: "Harus ada di tabel Gudang" },
      { key: "itemCode", label: "Kode Item", required: true, hint: "Harus ada di tabel Item" },
      { key: "qty", label: "Qty Stok", required: true, hint: "Angka jumlah stok" },
    ],
    sample: { warehouseCode: "WH-A", itemCode: "ITM-0001", qty: 120 },
  },
];

export function getDataset(id: string): DatasetDescriptor | null {
  return DATASETS.find((d) => d.id === id) ?? null;
}

/** Unduh template XLSX untuk sebuah dataset. */
export function downloadTemplate(dataset: DatasetDescriptor) {
  const ws = XLSX.utils.json_to_sheet([dataset.sample]);
  // Set lebar kolom mengikuti label terpanjang.
  ws["!cols"] = dataset.columns.map((c) => ({ wch: Math.max(c.label.length, c.key.length) + 4 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, dataset.label.slice(0, 28).replace(/[:\\/?*[\]]/g, " "));
  XLSX.writeFile(wb, `template-${dataset.id}.xlsx`);
}

export type ImportMode = "skip" | "update";

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export async function importDataset(
  dataset: DatasetId,
  rows: Record<string, unknown>[],
  mode: ImportMode
): Promise<ImportResult> {
  return api.post<ImportResult>(`/import/${dataset}`, { mode, rows });
}

/** Parse file XLSX/CSV yang diunggah menjadi baris bertipe Record<string, unknown>. */
export function parseSpreadsheet(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file."));
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) { resolve([]); return; }
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        resolve(rows);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("File tidak valid."));
      }
    };
    reader.readAsArrayBuffer(file);
  });
}