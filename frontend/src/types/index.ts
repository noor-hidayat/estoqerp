export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  avatarHue: number;
  createdAt?: string;
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  active: boolean;
  createdAt?: string;
}

export interface RolePermission {
  id: string;
  roleId: string;
  menu: string;
  action: string;
}

export interface BranchAccess {
  id: string;
  roleId: string;
  entityType: "BRANCH" | "WAREHOUSE";
  entityId: string;
}

export interface UserSetting {
  id: string;
  userId: string;
  key: string;
  value: unknown;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  city: string;
  createdAt?: string;
}

export interface Warehouse {
  id: string;
  branchId: string;
  code: string;
  name: string;
  createdAt?: string;
}

export interface Location {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  createdAt?: string;
}

export interface ItemGroup {
  id: string;
  code: string;
  name: string;
  createdAt?: string;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  itemGroupId: string;
  hue: number;
  uomId?: string;
  alternativeCode?: string;
  uomQty?: number;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface StockBalance {
  id: string;
  warehouseId: string;
  itemId: string;
  balanceDate: string;
  openingQty: number;
  inQty: number;
  outQty: number;
  closingQty: number;
}

export type SegmentField =
  | "ITEM_CODE"
  | "ITEM_GROUP"
  | "DATE"
  | "SEQUENCE"
  | "BARCODE_ID"
  | "BATCH"
  | "CUSTOM";

export interface BarcodeSegment {
  id: string;
  field: SegmentField;
  start: number;
  end: number;
  label?: string;
  /** Wajib untuk field BATCH — menunjuk format batch yang dipakai memparse nomor batch. */
  batchFormatId?: string;
}

export interface BarcodeFormat {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  qtyPerFormat: boolean;
  uniqueBarcode?: boolean;
  segments: BarcodeSegment[];
  createdAt?: string;
  updatedAt?: string;
}

export type BatchSegmentField =
  | "DATE"
  | "SHIFT"
  | "SEQUENCE"
  | "ALTERNATIVE_CODE"
  | "CUSTOM";
export type BatchSegmentMode = "POSITION" | "DELIMITER";
export type BatchDateFormat = "YYMMDD" | "DDMMYY" | "YYYYMMDD" | "YYYY-MM-DD";

export interface BatchSegment {
  id: string;
  field: BatchSegmentField;
  mode: BatchSegmentMode;
  start?: number;
  end?: number;
  delimiter?: string;
  index?: number;
  dateFormat?: BatchDateFormat;
  label?: string;
}

export interface BatchFormat {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  segments: BatchSegment[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BatchParseResult {
  formatId: string;
  formatName: string;
  values: Record<string, string>;
  productionDate: string | null;
  shift: string | null;
  alternativeCode: string | null;
  meta: Record<string, string>;
  matched: boolean;
}

export type OpnameMode = "COMPARE" | "SCRATCH";

export type ProjectStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "APPROVED"
  | "CANCELLED";

export type OpnameWhStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type OpnameScanStatus = "DRAFT" | "POSTED" | "CANCELED";

export interface OpnameProject {
  id: string;
  name: string;
  mode: OpnameMode;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  opnameDate?: string;
  createdBy?: string;
  description?: string;
}

export interface OpnameProjectListItem extends OpnameProject {
  jumlahGudang: number;
  progress: { counted: number; total: number; pct: number };
  warehouses: {
    id: string;
    warehouseId: string;
    warehouseName: string;
    status: OpnameWhStatus;
    pct?: number;
    countedLokasi?: number;
    totalLokasi?: number;
  }[];
}

export interface OpnameWarehouse {
  id: string;
  opnameId: string;
  warehouseId: string;
  status: OpnameWhStatus;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  warehouseName?: string;
  branchName?: string;
  totalLokasi?: number;
  countedLokasi?: number;
  pct?: number;
}

export interface OpnameProjectDetail {
  parent: OpnameProject;
  warehouses: OpnameWarehouse[];
  summary: {
    jumlahGudang: number;
    totalLokasi: number;
    countedLokasi: number;
    pct: number;
    status: ProjectStatus;
  };
}

export interface OpnameScan {
  id: string;
  opnameId: string;
  scannedBy?: string;
  status: OpnameScanStatus;
  startedAt: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  barcodes?: number;
  qty?: number;
  itemCount?: number;
  warehouses?: string[];
  locations?: string[];
  lastItemId?: string | null;
  lastItemName?: string;
  lastItemUnit?: string;
}

export interface OpnameScanDetailsResponse {
  scans: OpnameScan[];
  totalBarcodes: number;
  totalQty: number;
  itemCount: number;
}

export type ScanSource = "SCANNER" | "CAMERA" | "MANUAL";

export interface OpnameScanDetail {
  id: string;
  scanId: string;
  opnameId: string;
  warehouseId: string;
  locationId?: string;
  itemId: string;
  barcode: string;
  batch?: string;
  batchId?: string;
  parsed: Record<string, string>;
  quantity: number;
  qtyMode: "AUTO" | "MANUAL";
  source: ScanSource;
  scannedAt: string;
  itemCode?: string;
  itemName?: string;
  warehouseName?: string;
  locationCode?: string;
}

export interface OpnameStats {
  projectId: string;
  progress: { total: number; counted: number; pct: number };
  progressByWh: Record<string, { total: number; counted: number; pct: number }>;
  variance: {
    itemId: string;
    itemCode: string;
    itemName: string;
    unit: string;
    warehouseId: string;
    warehouseName: string;
    systemQty: number;
    countedQty: number;
    diff: number;
  }[];
}

export interface MovementType {
  id: string;
  code: string;
  name: string;
  kind: "RECEIPT" | "ISSUE" | "TRANSFER" | "OTHER" | string;
  series: string;
  builtin: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Uom {
  id: string;
  code: string;
  name: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type MovementStatus = "DRAFT" | "POSTED" | "CANCELED";

export interface StockMovement {
  id: string;
  typeId: string;
  movementDate: string;
  status: MovementStatus;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementListRow extends StockMovement {
  typeCode?: string;
  typeName?: string;
  createdByName?: string;
  detailCount: number;
  totalQty: number;
}

export interface StockMovementDetailRow {
  id: string;
  movementId: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  unit?: string;
  fromWarehouseId?: string;
  fromWarehouseCode?: string;
  fromWarehouseName?: string;
  toWarehouseId?: string;
  toWarehouseCode?: string;
  toWarehouseName?: string;
  qty: number;
  uomId?: string;
  uomCode?: string;
  uomName?: string;
  batchId?: string;
  batchNumber?: string;
  barcode?: string | null;
  serialNumber?: string | null;
  createdAt: string;
}

export interface ScanHistoryRow {
  id: string;
  movementId: string;
  movementDate: string;
  movementType?: string;
  movementStatus?: string;
  barcode: string;
  batchNumber?: string | null;
  itemCode?: string;
  itemName?: string;
  unit?: string;
  serialNumber?: string | null;
  qty: number;
  createdAt: string;
}

export interface StockMovementDetailFull extends StockMovementListRow {
  details: StockMovementDetailRow[];
}

export type StockLedgerRow = {
  id: string;
  transactionId: string;
  transactionType: string;
  transactionDate: string;
  itemId: string;
  itemCode?: string;
  itemName?: string;
  unit?: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  locationId?: string;
  locationName?: string;
  qtyIn: number;
  qtyOut: number;
  qtyBalance: number;
  referenceType?: string;
  referenceId?: string;
  batchId?: string;
  batchNumber?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
};

export type BatchStatus = "ACTIVE" | "EMPTY";

export interface Batch {
  id: string;
  itemId: string;
  batchNumber: string;
  status: BatchStatus;
  productionDate?: string | null;
  expiryDate?: string | null;
  shift?: string | null;
  meta?: Record<string, string>;
  notes?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockBatch {
  id: string;
  batchId: string;
  warehouseId: string;
  qty: number;
  updatedAt: string;
}

export interface StockBarcode {
  barcode: string;
  warehouseId: string;
  itemId: string;
  batchId: string | null;
  updatedAt: string;
}

export interface MovementInput {
  typeId: string;
  movementDate?: string | null;
  status: MovementStatus;
  referenceType?: string | null;
  referenceId?: string | null;
  description?: string | null;
  details: {
    itemId: string;
    fromWarehouseId?: string | null;
    toWarehouseId?: string | null;
    qty: number;
    uomId?: string | null;
    batchNumber?: string | null;
  }[];
}

// ---- Supply Chain ----

export type DocStatus = "DRAFT" | "POSTED" | "CANCELED";

/** Suppliers & Customers share an identical field shape. */
export interface Party {
  id: string;
  code: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  taxId?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type Supplier = Party;
export type Customer = Party;

export interface PurchaseOrderLine {
  id: string;
  purchaseOrderId?: string;
  itemId: string;
  uomId: string;
  /** Arrives as string from API; send as string or number. */
  qty: string;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
}

export interface PurchaseOrder {
  id: string;
  /** Equals the row id. */
  poNo: string | number;
  supplierId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  status: DocStatus;
  createdAt?: string;
  updatedAt?: string;
  lines?: PurchaseOrderLine[];
  /** Linked Goods Receipts (populated on detail fetch). */
  receipts?: GoodsReceipt[];
}

export interface SalesOrderLine {
  id: string;
  salesOrderId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
}

export interface SalesOrder {
  id: string;
  soNo: string | number;
  customerId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  status: DocStatus;
  createdAt?: string;
  updatedAt?: string;
  lines?: SalesOrderLine[];
}

export interface GoodsReceiptLine {
  id: string;
  goodsReceiptId?: string;
  purchaseOrderId?: string;
  itemId: string;
  uomId: string;
  qty: string;
  unitPrice?: string | null;
  batchNumber?: string | null;
  note?: string | null;
}

export interface GoodsReceipt {
  id: string;
  grNo: string | number;
  purchaseOrderId: string;
  warehouseId: string;
  receiptDate: string;
  notes?: string | null;
  status: DocStatus;
  createdAt?: string;
  updatedAt?: string;
  lines?: GoodsReceiptLine[];
}


