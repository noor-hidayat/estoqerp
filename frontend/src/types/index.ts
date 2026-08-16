export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  avatarHue: number;
}

export interface Role {
  id: string;
  name: string;
  isSystem: boolean;
  active: boolean;
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
}

export interface Warehouse {
  id: string;
  branchId: string;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
}

export interface Category {
  id: string;
  code: string;
  name: string;
}

export interface Item {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryId: string;
  price: number;
  hue: number;
  barcodeId?: string;
  qty?: number;
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
  | "CATEGORY"
  | "DATE"
  | "SEQUENCE"
  | "BARCODE_ID"
  | "CUSTOM";

export interface BarcodeSegment {
  id: string;
  field: SegmentField;
  start: number;
  end: number;
  label?: string;
}

export interface BarcodeFormat {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  qtyPerFormat: boolean;
  uniqueBarcode?: boolean;
  segments: BarcodeSegment[];
  updatedAt: string;
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


