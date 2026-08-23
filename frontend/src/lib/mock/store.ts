import type {
  BarcodeFormat,
  BatchFormat,
  Branch,
  ItemGroup,
  Item,
  Location,
  OpnameEntry,
  Project,
  Role,
  RolePermission,
  BranchAccess,
  ScanRecord,
  ScanSession,
  StockBalance,
  User,
  UserSetting,
  Warehouse,
} from "@/types";

export interface DB {
  users: User[];
  roles: Role[];
  rolePermissions: RolePermission[];
  branchAccesses: BranchAccess[];
  userSettings: UserSetting[];
  branches: Branch[];
  warehouses: Warehouse[];
  locations: Location[];
  itemGroups: ItemGroup[];
  items: Item[];
  stockBalances: StockBalance[];
  barcodeFormats: BarcodeFormat[];
  batchFormats: BatchFormat[];
  projects: Project[];
  scanSessions: ScanSession[];
  scanRecords: ScanRecord[];
  opnameEntries: OpnameEntry[];
  seq: number;
}

// --- Pembuat ID yang mudah dibaca ---
// Tabel volume rendah/global: br_001, wh_001, itm_001, ...
export function nextSeqId(records: { id: string }[], prefix: string): string {
  const max = records.reduce((m, r) => {
    if (!r.id.startsWith(prefix + "_")) return m;
    const n = Number(r.id.slice(prefix.length + 1));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}_${String(max + 1).padStart(3, "0")}`;
}

// Tabel volume tinggi dengan periode bulanan: rec_yymm_0001, ses_yymm_0001
export function nextSerialId(
  records: { id: string }[],
  prefix: string,
  date = new Date()
): string {
  const yymm = `${String(date.getFullYear()).slice(-2)}${String(
    date.getMonth() + 1
  ).padStart(2, "0")}`;
  const key = `${prefix}_${yymm}_`;
  const max = records.reduce((m, r) => {
    if (!r.id.startsWith(key)) return m;
    const n = Number(r.id.slice(key.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${key}${String(max + 1).padStart(4, "0")}`;
}

// Segmen barcode (unik lokal dalam satu format): seg_01, seg_02, ...
export function nextSegId(segments: { id: string }[]): string {
  return `seg_${String(segments.length + 1).padStart(2, "0")}`;
}

// ID project: 1, 2, 3, ... (berurutan dari 1)
export function nextProjectId(records: { id: string }[]): string {
  const max = records.reduce((m, r) => {
    const n = Number(r.id);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}
