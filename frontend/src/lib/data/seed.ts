// Development seed data — dijalankan OTOMATIS saat LocalStorage kosong,
// dan TIDAK PERNAH overwrite data user (cek per-koleksi: hanya isi bila kosong).
//
// Minimal issue #3: Branch, Warehouse, Warehouse Location, Item Group, UOM,
// Item, Supplier, Customer, Tax Category, Price List, Payment Terms,
// plus master lain yang dipakai frontend (departments, movement types,
// document types+series, barcode/batch formats, QC parameters, company).

import { readCollection, writeCollection, readValue, writeValue } from "./storage";

const SEED_VERSION = 1;
const SEED_META_KEY = "seedMeta";

function seedIfEmpty<T>(collection: string, rows: T[]): boolean {
  const existing = readCollection<T>(collection);
  if (existing.length > 0) return false;
  writeCollection(collection, rows);
  return true;
}

const now = () => new Date().toISOString();

export function ensureSeed(): { seeded: boolean; collections: string[] } {
  const meta = readValue<{ version: number }>(SEED_META_KEY, { version: 0 });
  const done: string[] = [];
  const put = (c: string, rows: unknown[]) => {
    if (seedIfEmpty(c, rows)) done.push(c);
  };

  put("branches", [
    { id: "br-jkt", code: "JKT", name: "Jakarta", city: "Jakarta", isActive: true, createdAt: now() },
    { id: "br-bdg", code: "BDG", name: "Bandung", city: "Bandung", isActive: true, createdAt: now() },
  ]);

  put("warehouses", [
    { id: "wh-utama", branchId: "br-jkt", parentId: null, code: "WH-01", name: "Gudang Utama", description: "Gudang simpan utama", isActive: true, createdAt: now() },
    { id: "wh-retur", branchId: "br-jkt", parentId: null, code: "WH-02", name: "Gudang Retur", description: "Gudang barang retur/QC", isActive: true, createdAt: now() },
    { id: "wh-bdg", branchId: "br-bdg", parentId: null, code: "WH-BDG", name: "Gudang Bandung", description: null, isActive: true, createdAt: now() },
  ]);

  put("locations", [
    { id: "loc-a1", warehouseId: "wh-utama", code: "A-01", name: "Rak A-01", isActive: true, createdAt: now() },
    { id: "loc-a2", warehouseId: "wh-utama", code: "A-02", name: "Rak A-02", isActive: true, createdAt: now() },
    { id: "loc-b1", warehouseId: "wh-retur", code: "B-01", name: "Rak B-01", isActive: true, createdAt: now() },
    { id: "loc-c1", warehouseId: "wh-bdg", code: "C-01", name: "Rak C-01", isActive: true, createdAt: now() },
  ]);

  put("itemGroups", [
    { id: "ig-elk", code: "ELK", name: "Elektronik", isActive: true, createdAt: now() },
    { id: "ig-atk", code: "ATK", name: "ATK", isActive: true, createdAt: now() },
    { id: "ig-pck", code: "PCK", name: "Packaging", isActive: true, createdAt: now() },
  ]);

  put("uom", [
    { id: "uom-pcs", code: "PCS", name: "Pieces", isActive: true, createdAt: now(), updatedAt: now() },
    { id: "uom-box", code: "BOX", name: "Box", isActive: true, createdAt: now(), updatedAt: now() },
    { id: "uom-kg", code: "KG", name: "Kilogram", isActive: true, createdAt: now(), updatedAt: now() },
    { id: "uom-ltr", code: "LTR", name: "Liter", isActive: true, createdAt: now(), updatedAt: now() },
  ]);

  put("items", [
    { id: "it-laptop", code: "ITM-001", name: "Laptop 14 inch", itemGroupId: "ig-elk", hue: 210, uomId: "uom-pcs", valuationRate: 8500000, isActive: true, createdAt: now() },
    { id: "it-mouse", code: "ITM-002", name: "Mouse Wireless", itemGroupId: "ig-elk", hue: 200, uomId: "uom-pcs", valuationRate: 150000, isActive: true, createdAt: now() },
    { id: "it-kertas", code: "ITM-003", name: "Kertas A4 80gsm", itemGroupId: "ig-atk", hue: 120, uomId: "uom-box", valuationRate: 55000, isActive: true, createdAt: now() },
    { id: "it-tinta", code: "ITM-004", name: "Tinta Printer Black", itemGroupId: "ig-atk", hue: 0, uomId: "uom-pcs", valuationRate: 120000, isActive: true, createdAt: now() },
    { id: "it-kardus", code: "ITM-005", name: "Kardus Packing", itemGroupId: "ig-pck", hue: 40, uomId: "uom-pcs", valuationRate: 8000, isActive: true, createdAt: now() },
    { id: "it-bubble", code: "ITM-006", name: "Bubble Wrap Roll", itemGroupId: "ig-pck", hue: 180, uomId: "uom-pcs", valuationRate: 25000, isActive: true, createdAt: now() },
    { id: "it-keyboard", code: "ITM-007", name: "Keyboard USB", itemGroupId: "ig-elk", hue: 220, uomId: "uom-pcs", valuationRate: 200000, isActive: true, createdAt: now() },
    { id: "it-spidol", code: "ITM-008", name: "Spidol Whiteboard", itemGroupId: "ig-atk", hue: 300, uomId: "uom-pcs", valuationRate: 12000, isActive: true, createdAt: now() },
  ]);

  put("suppliers", [
    { id: "sup-1", code: "SUP-001", name: "PT Maju Jaya Abadi", contactPerson: "Budi", phone: "021-5550101", email: "sales@majujaya.id", address: "Jl. Merdeka No. 10, Jakarta", isActive: true, createdAt: now() },
    { id: "sup-2", code: "SUP-002", name: "CV Berkah Supply", contactPerson: "Sari", phone: "022-5550102", email: "info@berkahsupply.id", address: "Jl. Asia Afrika No. 5, Bandung", isActive: true, createdAt: now() },
    { id: "sup-3", code: "SUP-003", name: "PT Sinar Elektronik", contactPerson: "Andi", phone: "021-5550103", email: "order@sinarelektronik.id", address: "Jl. Gajah Mada No. 88, Jakarta", isActive: true, createdAt: now() },
  ]);

  put("customers", [
    { id: "cus-1", code: "CUS-001", name: "Toko Barokah", contactPerson: "Haji Umar", phone: "021-5550201", email: "tokobarokah@mail.id", address: "Jl. Pasar Baru No. 3, Jakarta", isActive: true, createdAt: now() },
    { id: "cus-2", code: "CUS-002", name: "PT Sejahtera Retail", contactPerson: "Dewi", phone: "022-5550202", email: "purchasing@sejahtera.id", address: "Jl. Riau No. 12, Bandung", isActive: true, createdAt: now() },
  ]);

  put("departments", [
    { id: "dept-ops", code: "OPS", name: "Operasional", isActive: true, createdAt: now(), updatedAt: now() },
    { id: "dept-pur", code: "PUR", name: "Purchasing", isActive: true, createdAt: now(), updatedAt: now() },
    { id: "dept-wh", code: "WH", name: "Warehouse", isActive: true, createdAt: now(), updatedAt: now() },
  ]);

  put("taxCategories", [
    { id: "tax-ppn", code: "PPN", name: "PPN 11%", percentage: 11, description: "Pajak Pertambahan Nilai", isActive: true, createdAt: now() },
    { id: "tax-0", code: "NON", name: "Non Pajak", percentage: 0, description: null, isActive: true, createdAt: now() },
    { id: "tax-pph", code: "PPH23", name: "PPh 23 2%", percentage: 2, description: null, isActive: true, createdAt: now() },
  ]);

  put("priceLists", [
    { id: "pl-beli", code: "PL-BELI-01", name: "Price List Pembelian", description: null, type: "PURCHASE", currency: "IDR", isActive: true, createdAt: now() },
    { id: "pl-jual", code: "PL-JUAL-01", name: "Price List Penjualan", description: null, type: "SALES", currency: "IDR", isActive: true, createdAt: now() },
  ]);

  put("priceListLines", [
    { id: "pll-1", priceListId: "pl-beli", itemId: "it-laptop", type: "PURCHASE", unitPrice: 8500000, currency: "IDR", minQty: 1, createdAt: now() },
    { id: "pll-2", priceListId: "pl-beli", itemId: "it-mouse", type: "PURCHASE", unitPrice: 150000, currency: "IDR", minQty: 1, createdAt: now() },
    { id: "pll-3", priceListId: "pl-jual", itemId: "it-laptop", type: "SALES", unitPrice: 9500000, currency: "IDR", minQty: 1, createdAt: now() },
  ]);

  put("paymentTerms", [
    { id: "pt-cod", code: "COD", name: "Cash On Delivery", days: 0, isActive: true, createdAt: now() },
    { id: "pt-14", code: "NET14", name: "Net 14 Hari", days: 14, isActive: true, createdAt: now() },
    { id: "pt-30", code: "NET30", name: "Net 30 Hari", days: 30, isActive: true, createdAt: now() },
  ]);

  put("movementTypes", [
    { id: "mt-in", code: "STOCK-IN", name: "Stock In", kind: "RECEIPT", series: "TRX", builtin: true, createdAt: now(), updatedAt: now() },
    { id: "mt-out", code: "STOCK-OUT", name: "Stock Out", kind: "ISSUE", series: "TRX", builtin: true, createdAt: now(), updatedAt: now() },
    { id: "mt-trf", code: "TRANSFER", name: "Stock Transfer", kind: "TRANSFER", series: "TRX", builtin: true, createdAt: now(), updatedAt: now() },
    { id: "mt-adj", code: "ADJUSTMENT", name: "Stock Adjustment", kind: "OTHER", series: "TRX", builtin: true, createdAt: now(), updatedAt: now() },
  ]);

  put("documentTypes", [
    { id: "dt-po", publicId: "dt-po", name: "Purchase Order", description: "Dokumen PO", isActive: true, createdAt: now() },
    { id: "dt-pr", publicId: "dt-pr", name: "Purchase Request", description: null, isActive: true, createdAt: now() },
    { id: "dt-grn", publicId: "dt-grn", name: "Goods Receipt", description: null, isActive: true, createdAt: now() },
    { id: "dt-rcv", publicId: "dt-rcv", name: "Receiving", description: null, isActive: true, createdAt: now() },
  ]);

  put("documentSeries", [
    { id: "ds-po", publicId: "ds-po", documentTypeId: "dt-po", typeName: "Purchase Order", name: "PO default", prefix: "PO", format: "{PREFIX}/YYYY/MM/NNNN", padding: 4, resetPolicy: "MONTHLY", isDefault: true, branchSpecific: false, isActive: true, createdAt: now(), nextNumber: 1 },
    { id: "ds-pr", publicId: "ds-pr", documentTypeId: "dt-pr", typeName: "Purchase Request", name: "PR default", prefix: "PR", format: "{PREFIX}/YYYY/MM/NNNN", padding: 4, resetPolicy: "MONTHLY", isDefault: true, branchSpecific: false, isActive: true, createdAt: now(), nextNumber: 1 },
  ]);

  put("barcodeFormats", [
    { id: "bf-std", name: "Standard Item Barcode", description: "Kode item + sequence", isActive: true, qtyPerFormat: false, uniqueBarcode: true, segments: [{ id: "seg-1", field: "ITEM_CODE", start: 0, end: 7 }], createdAt: now() },
  ]);

  put("batchFormats", [
    { id: "bt-std", name: "Standard Batch", description: "Tanggal + sequence", isActive: true, segments: [{ id: "bseg-1", field: "DATE", mode: "POSITION", start: 0, end: 6, dateFormat: "YYMMDD" }], createdAt: now() },
  ]);

  put("qcParameters", [
    { id: "qc-rusak", code: "RUSAK", name: "Rusak", description: "Barang rusak fisik", isActive: true, createdAt: now() },
    { id: "qc-robek", code: "ROBEK", name: "Robek", description: "Kemasan robek", isActive: true, createdAt: now() },
    { id: "qc-expired", code: "EXPIRED", name: "Expired", description: "Kadaluarsa", isActive: true, createdAt: now() },
  ]);

  put("companySettings", [
    { id: "company-1", companyName: "Estoq ERP (Dev)", companyCode: "ESTOQ", country: "ID", baseCurrency: "IDR", timezone: "Asia/Jakarta", fiscalYear: "2026", updatedAt: now() },
  ]);

  put("roles", [
    { id: "role_sys_admin", name: "Administrator", isSystem: true, active: true, createdAt: now() },
  ]);

  put("users", [
    { id: "dev-user", name: "Developer", email: "dev@estoq.local", role: "role_sys_admin", active: true, avatarHue: 210, createdAt: now() },
  ]);

  put("workspaces", [
    { id: "wsp-warehouse", code: "warehouse", name: "Warehouse", description: "Stok, Ledger & Master", icon: "Warehouse", isActive: true, sortOrder: 1 },
    { id: "wsp-purchasing", code: "purchasing", name: "Purchasing", description: "Supplier, PO & GR", icon: "ShoppingCart", isActive: true, sortOrder: 2 },
    { id: "wsp-marketing", code: "marketing", name: "Marketing", description: "Customer & Sales Order", icon: "Megaphone", isActive: true, sortOrder: 3 },
    { id: "wsp-quality", code: "quality", name: "Quality", description: "QC Inspection & Quality Control", icon: "ClipboardCheck", isActive: true, sortOrder: 4 },
  ]);

  // Migrasi seed lama (hanya warehouse+purchasing): tambah workspace yang belum ada
  // tanpa overwrite data user. seedIfEmpty di atas tidak jalan bila koleksi sudah ada.
  {
    const existing = readCollection<{ id: string }>("workspaces");
    if (existing.length > 0) {
      const ids = new Set(existing.map((w) => w.id));
      const required = [
        { id: "wsp-warehouse", code: "warehouse", name: "Warehouse", description: "Stok, Ledger & Master", icon: "Warehouse", isActive: true, sortOrder: 1 },
        { id: "wsp-purchasing", code: "purchasing", name: "Purchasing", description: "Supplier, PO & GR", icon: "ShoppingCart", isActive: true, sortOrder: 2 },
        { id: "wsp-marketing", code: "marketing", name: "Marketing", description: "Customer & Sales Order", icon: "Megaphone", isActive: true, sortOrder: 3 },
        { id: "wsp-quality", code: "quality", name: "Quality", description: "QC Inspection & Quality Control", icon: "ClipboardCheck", isActive: true, sortOrder: 4 },
      ];
      const missing = required.filter((w) => !ids.has(w.id));
      if (missing.length > 0) {
        writeCollection("workspaces", [...(existing as unknown[]), ...missing]);
        done.push("workspaces:migrated");
      }
    }
  }

  if (meta.version < SEED_VERSION) {
    writeValue(SEED_META_KEY, { version: SEED_VERSION, seededAt: now() });
  }
  return { seeded: done.length > 0, collections: done };
}
