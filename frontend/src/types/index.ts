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
  unit: string;
  itemGroupId: string;
  price: number;
  hue: number;
  barcodeId?: string;
  qty?: number;
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

export interface OpnameProject {
  id: string;
  name: string;
  createdAt: string;
  deadline?: string;
  createdBy: string;
}

export interface OpnameProjectDetail {
  parent: OpnameProject;
  children: {
    id: string;
    name: string;
    warehouseId: string;
    branchId: string;
    mode: OpnameMode;
    status: ProjectStatus;
    createdAt: string;
    totalLokasi: number;
    countedLokasi: number;
    pct: number;
    warehouseName: string;
    branchName: string;
  }[];
  summary: {
    jumlahGudang: number;
    totalLokasi: number;
    countedLokasi: number;
    pct: number;
    status: ProjectStatus;
  };
}

export interface Project {
  id: string;
  name: string;
  projectId?: string;
  branchId: string;
  warehouseId: string;
  mode: OpnameMode;
  status: ProjectStatus;
  createdAt: string;
  deadline?: string;
  createdBy: string;
}

export type ScanSessionStatus = "ACTIVE" | "CLOSED";

export interface ScanSession {
  id: string;
  projectId: string;
  locationId?: string;
  scannedBy: string;
  startedAt: string;
  endedAt?: string;
  status: ScanSessionStatus;
}

export type ScanSource = "SCANNER" | "CAMERA" | "MANUAL";

export interface ScanRecord {
  id: string;
  sessionId: string;
  projectId: string;
  barcode: string;
  itemId?: string;
  batchId?: string;
  parsed: Record<string, string>;
  quantity: number;
  qtyMode: "AUTO" | "MANUAL";
  source: ScanSource;
  locationId?: string;
  scannedAt: string;
}

export interface OpnameEntry {
  id: string;
  projectId: string;
  itemId: string;
  locationId?: string;
  systemQty: number;
  countedQty: number;
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


