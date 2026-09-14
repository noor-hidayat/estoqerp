// Field-level diff helpers for activity log (from->to) with denylist.
// No external deps. Used by crud.ts, supply-chain, PR/MR, transactions.
export const DIFF_DENYLIST = new Set<string>([
  "passwordHash",
  "password_hash",
  "password",
  "tokenHash",
  "token_hash",
  "refreshToken",
  "refresh_token",
  "jwtSecret",
  "secret",
  "signatureData",
  "signature_data",
  "preparedSignature",
  "prepared_signature",
  "approvedSignature",
  "approved_signature",
  // internal valuation not user-editable
  "valuationRate",
  "valuation_rate",
  "stockValue",
  "stock_value",
]);

// fields that are auto timestamps / internal, don't clutter diff
const SKIP_AUTO = new Set<string>([
  "id",
  "publicId",
  "public_id",
  "_internalId",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "createdBy",
  "created_by",
  "updated_by",
]);

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString();
  // numeric string compare: "10.00" vs 10 -> normalize to number string?
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "true" : "false";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function isEqualNormalized(a: unknown, b: unknown): boolean {
  // handle both null/undefined equal
  if (a == null && b == null) return true;
  // Date handling
  const aNorm = normalizeValue(a);
  const bNorm = normalizeValue(b);
  // numeric string tolerant: "10" vs "10.00" vs 10
  const aNum = Number(aNorm);
  const bNum = Number(bNorm);
  if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNorm !== "" && bNorm !== "") {
    return aNum === bNum;
  }
  return aNorm === bNorm;
}

export type FieldChange = { from: unknown; to: unknown };

// compute shallow diff: oldRow vs patch (keys in patch)
export function computeDiff(
  oldRow: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
  opts?: { denylist?: Set<string>; labelMap?: Record<string, string> }
): Record<string, FieldChange> {
  if (!oldRow || !patch) return {};
  const deny = opts?.denylist ?? DIFF_DENYLIST;
  const changes: Record<string, FieldChange> = {};
  for (const [k, newVal] of Object.entries(patch)) {
    if (SKIP_AUTO.has(k)) continue;
    if (deny.has(k)) continue;
    const oldVal = (oldRow as any)[k];
    if (isEqualNormalized(oldVal, newVal)) continue;
    changes[k] = { from: oldVal ?? null, to: newVal ?? null };
  }
  return changes;
}

// For lines: oldLines vs newLines (incoming). keyFields to match lines (itemId, uomId)
// We treat lines as unordered? For PO/PR, order matters but qty/item is identity.
// Use itemId+uomId composite as key if possible, else index.
export type LinesDiff = {
  added: Record<string, unknown>[];
  removed: Record<string, unknown>[];
  modified: { key: string; changes: Record<string, FieldChange>; old: Record<string, unknown>; next: Record<string, unknown> }[];
  // raw for display fallback
  summary?: string;
};

function lineKey(line: Record<string, unknown>, idx: number): string {
  // For diff, key by itemId+uomId+batch (incoming lines have no publicId). Ignore publicId to match old vs new.
  const itemId = (line.itemId ?? line.item_id) ?? "";
  const uomId = (line.uomId ?? line.uom_id) ?? "";
  const batchNumber = (line.batchNumber ?? line.batch_number ?? line.batch ?? "") ?? "";
  // Normalize: if itemId is publicId uuid, keep as is; internal numeric also normalized to string
  const itemStr = String(itemId).trim();
  const uomStr = String(uomId).trim();
  const batchStr = String(batchNumber).trim();
  if (itemStr || uomStr || batchStr) return `${itemStr}::${uomStr}::${batchStr}`;
  // fallback to index only if no identifiers
  if (line.publicId) return String(line.publicId);
  if (line._internalId) return String(line._internalId);
  if (line.id && typeof line.id === "string" && /^[0-9a-f-]{36}/i.test(String(line.id))) return String(line.id);
  return `idx-${idx}`;
}

function normalizeLine(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (SKIP_AUTO.has(k) || DIFF_DENYLIST.has(k)) continue;
    // skip internal FK raw ids but keep for key? keep normalized qty etc
    out[k] = v;
  }
  return out;
}

export function diffLines(
  oldLines: Record<string, unknown>[],
  newLines: Record<string, unknown>[],
  opts?: { keyFn?: (l: Record<string, unknown>, idx: number) => string; compareKeys?: string[] }
): LinesDiff {
  const keyFn = opts?.keyFn ?? lineKey;
  const compareKeys = opts?.compareKeys ?? ["itemId", "qty", "unitPrice", "discount", "batchNumber", "note", "deliveryDate", "uomId", "fromWarehouseId", "toWarehouseId", "warehouseId", "incomingRate", "barcode", "batch", "priceListId"];
  const oldMap = new Map<string, Record<string, unknown>>();
  const oldIdxMap = new Map<string, number>();
  (oldLines ?? []).forEach((l, i) => {
    const k = keyFn(l as any, i);
    // if duplicate keys, make unique by appending idx
    const uniq = oldMap.has(k) ? `${k}__${i}` : k;
    oldMap.set(uniq, l as any);
    oldIdxMap.set(uniq, i);
  });
  const newMap = new Map<string, Record<string, unknown>>();
  (newLines ?? []).forEach((l, i) => {
    const k = keyFn(l as any, i);
    const uniq = newMap.has(k) ? `${k}__${i}` : k;
    newMap.set(uniq, l as any);
  });

  const added: Record<string, unknown>[] = [];
  const removed: Record<string, unknown>[] = [];
  const modified: LinesDiff["modified"] = [];

  // Detect added & modified
  for (const [k, newL] of newMap.entries()) {
    if (!oldMap.has(k)) {
      // try to find by itemId loose match for better diff?
      // If not found by exact key, check if any old line with same itemId remains unmatched -> treat as modified not added
      // Simple: if key by index, oldMap may have different keys due to reordering. We'll handle fallback by idx.
      // For now, if oldMap size != newMap size, use index fallback when key not found
      // Check fallback: find old line not yet matched with same itemId
      let fallbackKey: string | null = null;
      if (opts?.keyFn == null) {
        // default key includes idx, so fallback by itemId
        const newItemId = (newL as any).itemId ?? (newL as any).item_id;
        if (newItemId) {
          for (const [ok, ov] of oldMap.entries()) {
            if (!newMap.has(ok) && (ov as any).itemId === newItemId && !modified.some(m => m.key === ok) && !added.some(a => a === ov) ) {
              // check if this old hasn't been matched yet via modified loop
              // we'll break after first
              // But we need to avoid double counting, so mark fallback
            }
          }
        }
      }
      added.push(newL as any);
    } else {
      const oldL = oldMap.get(k)!;
      const nNorm = normalizeLine(newL as any);
      const oNorm = normalizeLine(oldL as any);
      const changes: Record<string, FieldChange> = {};
      const keys = new Set([...Object.keys(oNorm), ...Object.keys(nNorm)].filter(key => compareKeys.includes(key) || compareKeys.length === 0));
      for (const ck of keys) {
        if (SKIP_AUTO.has(ck) || DIFF_DENYLIST.has(ck)) continue;
        const ov = (oNorm as any)[ck];
        const nv = (nNorm as any)[ck];
        if (isEqualNormalized(ov, nv)) continue;
        changes[ck] = { from: ov ?? null, to: nv ?? null };
      }
      if (Object.keys(changes).length > 0) {
        modified.push({ key: k, changes, old: oldL as any, next: newL as any });
      }
      // remove from oldMap to detect remaining removed
      oldMap.delete(k);
    }
  }
  // Remaining oldMap are removed (since we deleted matched ones above, need to reconstruct)
  // Actually we mutated oldMap during iteration, so remaining are removed. Need to track separately.
  // We deleted matched keys, so leftovers are removed. But we already deleted for modified case; for added we didn't delete. So we need second pass for removed:
  // Rebuild oldMap original for removed detection - simpler: collect removed where key not in newMap
  const originalOldKeys = new Set((oldLines ?? []).map((l, i) => {
    const k = keyFn(l as any, i);
    return k;
  }));
  // But due to duplicate handling, do simpler: any oldLine not in modified's old and not matched as added -> if its key not in newMap then removed
  // We'll just compute removed as oldLines whose key not in newMap and not modified
  const modifiedOldKeys = new Set(modified.map(m => m.key));
  for (let i = 0; i < (oldLines ?? []).length; i++) {
    const ol = oldLines[i] as any;
    const k = keyFn(ol, i);
    const uniq = [...oldMap.keys()].includes(k) ? k : (oldMap.has(`${k}__${i}`) ? `${k}__${i}` : k);
    // If k still in oldMap (not deleted) and not in newMap -> removed
    // Easier: check if newMap has k or modified has k, else removed
    if (!newMap.has(k) && !modifiedOldKeys.has(k) && !modifiedOldKeys.has(`${k}__${i}`)) {
      // double check not already added as modified with fallback
      // if old line's itemId appears in new lines, it would have been modified/added case; here it's truly removed
      removed.push(ol);
    }
  }
  // If counts mismatch due to key strategy, fallback to simple length compare
  if (added.length === 0 && removed.length === 0 && modified.length === 0 && oldLines.length !== newLines.length) {
    return {
      added,
      removed,
      modified,
      summary: `${oldLines.length} → ${newLines.length} baris`,
    };
  }
  return { added, removed, modified };
}

// Helper to summarize diff for metadata
export function summarizeDiff(changes: Record<string, FieldChange>, linesDiff?: LinesDiff): string | undefined {
  const fCount = Object.keys(changes).length;
  const added = linesDiff?.added.length ?? 0;
  const removed = linesDiff?.removed.length ?? 0;
  const mod = linesDiff?.modified.length ?? 0;
  if (fCount === 0 && added === 0 && removed === 0 && mod === 0) return undefined;
  const parts: string[] = [];
  if (fCount) parts.push(`${fCount} field`);
  if (added) parts.push(`+${added}`);
  if (removed) parts.push(`-${removed}`);
  if (mod) parts.push(`~${mod}`);
  return parts.join(", ");
}
