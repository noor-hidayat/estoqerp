export type Role = "ADMIN" | "STAFF" | "APPROVER";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchId?: string;
  warehouseId?: string;
  active: boolean;
  avatarHue: number;
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
  systemStock: Record<string, number>;
  price: number;
  hue: number;
}

export type SegmentField =
  | "ITEM_CODE"
  | "CATEGORY"
  | "DATE"
  | "SEQUENCE"
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
  segments: BarcodeSegment[];
  updatedAt: string;
}

export type OpnameMode = "COMPARE" | "SCRATCH";

export type ProjectStatus =
  | "DRAFT"
  | "IN_PROGRESS"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export interface Project {
  id: string;
  name: string;
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

export type ApprovalStatus = "APPROVED" | "REJECTED";

export interface Approval {
  id: string;
  projectId: string;
  approvedBy: string;
  status: ApprovalStatus;
  note?: string;
  at: string;
}
