import type {
  Approval,
  BarcodeFormat,
  Branch,
  Category,
  Item,
  Location,
  OpnameEntry,
  Project,
  ScanRecord,
  ScanSession,
  User,
  Warehouse,
} from "@/types";

export interface DB {
  users: User[];
  branches: Branch[];
  warehouses: Warehouse[];
  locations: Location[];
  categories: Category[];
  items: Item[];
  barcodeFormats: BarcodeFormat[];
  projects: Project[];
  scanSessions: ScanSession[];
  scanRecords: ScanRecord[];
  opnameEntries: OpnameEntry[];
  approvals: Approval[];
  seq: number;
}

export function newUid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
