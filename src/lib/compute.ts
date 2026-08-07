import type {
  DB,
} from "@/lib/mock/store";
import type { OpnameMode, Project, ProjectStatus } from "@/types";

export const MODE_LABELS: Record<OpnameMode, string> = {
  COMPARE: "Bandingkan Stok Sistem",
  SCRATCH: "Hitung Ulang dari Nol",
};

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  DRAFT: "Draft",
  IN_PROGRESS: "Berlangsung",
  PENDING_APPROVAL: "Menunggu Approval",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  CANCELLED: "Dibatalkan",
};

export const STATUS_TONE: Record<
  ProjectStatus,
  "neutral" | "emerald" | "amber" | "red" | "blue" | "violet"
> = {
  DRAFT: "neutral",
  IN_PROGRESS: "amber",
  PENDING_APPROVAL: "blue",
  APPROVED: "emerald",
  REJECTED: "red",
  CANCELLED: "neutral",
};

export interface VarianceRow {
  itemId: string;
  systemQty: number;
  countedQty: number;
  diff: number;
}

export function projectCounted(db: DB, project: Project): VarianceRow[] {
  const warehouseId = project.warehouseId;
  const records = db.scanRecords.filter((r) => r.projectId === project.id);
  const byItem = new Map<string, number>();
  for (const r of records) {
    if (!r.itemId) continue;
    byItem.set(r.itemId, (byItem.get(r.itemId) ?? 0) + r.quantity);
  }

  const candidateIds = new Set<string>([
    ...db.items
      .filter((i) => (i.systemStock[warehouseId] ?? 0) > 0)
      .map((i) => i.id),
    ...byItem.keys(),
  ]);

  const rows: VarianceRow[] = [];
  for (const itemId of candidateIds) {
    const item = db.items.find((i) => i.id === itemId);
    if (!item) continue;
    const systemQty = item.systemStock[warehouseId] ?? 0;
    const countedQty = byItem.get(itemId) ?? 0;
    rows.push({
      itemId,
      systemQty,
      countedQty,
      diff: countedQty - systemQty,
    });
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  return rows;
}

export function projectProgress(db: DB, project: Project) {
  const rows = projectCounted(db, project);
  const total = rows.length;
  const counted = rows.filter((r) => r.countedQty > 0).length;
  const pct = total === 0 ? 0 : Math.round((counted / total) * 100);
  return { total, counted, pct };
}

export function completedProjects(db: DB, project: Project) {
  const records = db.scanRecords.filter((r) => r.projectId === project.id);
  const scannedItems = new Set(records.map((r) => r.itemId).filter(Boolean));
  return scannedItems.size;
}

export function isActiveProject(p: Project) {
  return p.status === "IN_PROGRESS" || p.status === "PENDING_APPROVAL";
}
