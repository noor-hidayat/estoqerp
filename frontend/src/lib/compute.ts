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
  APPROVED: "Final",
  CANCELLED: "Dibatalkan",
};

export const STATUS_TONE: Record<
  ProjectStatus,
  "neutral" | "emerald" | "amber" | "red" | "blue" | "violet"
> = {
  DRAFT: "neutral",
  IN_PROGRESS: "amber",
  APPROVED: "emerald",
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

  const stockQty = (itemId: string) =>
    db.stockBalances.find(
      (sb) => sb.itemId === itemId && sb.warehouseId === warehouseId
    )?.qty ?? 0;

  const candidateIds = new Set<string>([
    ...db.items
      .filter((i) => stockQty(i.id) > 0)
      .map((i) => i.id),
    ...byItem.keys(),
  ]);

  const rows: VarianceRow[] = [];
  for (const itemId of candidateIds) {
    const item = db.items.find((i) => i.id === itemId);
    if (!item) continue;
    const systemQty = stockQty(itemId);
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
  const locations = db.locations.filter(
    (l) => l.warehouseId === project.warehouseId
  );
  const total = locations.length;
  if (total === 0) return { total: 0, counted: 0, pct: 0 };

  const warehouseIds = new Set(locations.map((l) => l.id));
  const scannedIds = new Set(
    db.scanRecords
      .filter((r) => r.projectId === project.id && r.locationId)
      .map((r) => r.locationId)
      .filter((id): id is string => !!id && warehouseIds.has(id))
  );
  const counted = scannedIds.size;
  const pct = Math.round((counted / total) * 100);
  return { total, counted, pct };
}

export function completedProjects(db: DB, project: Project) {
  const records = db.scanRecords.filter((r) => r.projectId === project.id);
  const scannedItems = new Set(records.map((r) => r.itemId).filter(Boolean));
  return scannedItems.size;
}

export function isActiveProject(p: Project) {
  return p.status === "IN_PROGRESS";
}
