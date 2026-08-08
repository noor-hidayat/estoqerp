import type {
  BarcodeFormat,
  BarcodeSegment,
  Category,
  Item,
  SegmentField,
} from "@/types";

export const SEGMENT_FIELD_LABELS: Record<SegmentField, string> = {
  ITEM_CODE: "Kode Item",
  CATEGORY: "Kategori",
  DATE: "Tanggal",
  SEQUENCE: "No. Urut",
  BARCODE_ID: "Barcode",
  CUSTOM: "Kustom",
};

export function segmentLength(seg: Pick<BarcodeSegment, "start" | "end">) {
  return Math.max(0, seg.end - seg.start + 1);
}

export function sortSegments(segments: BarcodeSegment[]): BarcodeSegment[] {
  return [...segments].sort((a, b) => a.start - b.start);
}

export function validateSegments(
  barcodeLength: number,
  segments: BarcodeSegment[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const sorted = sortSegments(segments);

  if (sorted.length === 0) {
    return { valid: false, errors: ["Format harus memiliki minimal 1 segmen."] };
  }

  let cursor = 1;
  for (const seg of sorted) {
    if (seg.start < 1 || seg.end < seg.start) {
      errors.push(`Segmen tidak valid (${seg.start}-${seg.end}).`);
      continue;
    }
    if (seg.start < cursor) {
      errors.push(
        `Segmen tumpang tindih di posisi ${seg.start} (segmen sebelumnya berakhir di ${cursor - 1}).`
      );
    }
    if (seg.end > barcodeLength) {
      errors.push(
        `Segmen ${seg.start}-${seg.end} melebihi panjang barcode (${barcodeLength}).`
      );
    }
    cursor = Math.max(cursor, seg.end + 1);
  }

  if (sorted[sorted.length - 1].end > barcodeLength) {
    errors.push(
      `Format menutupi ${sorted[sorted.length - 1].end} digit tetapi panjang barcode hanya ${barcodeLength} digit.`
    );
  }

  return { valid: errors.length === 0, errors };
}

export interface ParsedResult {
  formatId: string;
  formatName: string;
  values: Record<SegmentField, string>;
  raw: string;
  itemId?: string;
  item?: Item;
  categoryCode?: string;
  matched: boolean;
}

export interface ParseContext {
  items: Item[];
  categories: Category[];
}

function extractSegment(raw: string, seg: BarcodeSegment): string {
  if (seg.start < 1 || seg.end > raw.length) return "";
  return raw.slice(seg.start - 1, seg.end).trim();
}

export function parseWithFormat(
  raw: string,
  format: BarcodeFormat,
  ctx: ParseContext
): ParsedResult | null {
  const result = validateSegments(raw.length, format.segments);
  if (!result.valid) return null;

  const values: Record<SegmentField, string> = {
    ITEM_CODE: "",
    CATEGORY: "",
    DATE: "",
    SEQUENCE: "",
    BARCODE_ID: "",
    CUSTOM: "",
  };

  for (const seg of sortSegments(format.segments)) {
    values[seg.field] = extractSegment(raw, seg);
  }

  let itemId: string | undefined;
  let item: Item | undefined;

  const barcodeId = values.BARCODE_ID;
  if (barcodeId) {
    item = ctx.items.find(
      (i) => i.barcodeId?.toLowerCase() === barcodeId.toLowerCase()
    );
    if (item) itemId = item.id;
  }

  if (!item) {
    const itemCode = values.ITEM_CODE;
    if (itemCode) {
      item = ctx.items.find(
        (i) => i.code.toLowerCase() === itemCode.toLowerCase()
      );
      if (item) itemId = item.id;
    }
  }

  const categoryCode = values.CATEGORY || undefined;
  if (!item && categoryCode) {
    const category = ctx.categories.find(
      (c) => c.code.toLowerCase() === categoryCode.toLowerCase()
    );
    if (category) {
      const candidates = ctx.items.filter(
        (i) => i.categoryId === category.id
      );
      if (candidates.length === 1) {
        item = candidates[0];
        itemId = item.id;
      }
    }
  }

  return {
    formatId: format.id,
    formatName: format.name,
    values,
    raw,
    itemId,
    item,
    categoryCode,
    matched: true,
  };
}

export function parseBarcode(
  raw: string,
  formats: BarcodeFormat[],
  ctx: ParseContext
): ParsedResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const active = formats.filter((f) => f.isActive);
  const candidateOrder = [...active].sort((a, b) => b.segments.length - a.segments.length);

  for (const format of candidateOrder) {
    const parsed = parseWithFormat(trimmed, format, ctx);
    if (parsed) return parsed;
  }

  return {
    formatId: "",
    formatName: "",
    values: { ITEM_CODE: "", CATEGORY: "", DATE: "", SEQUENCE: "", BARCODE_ID: "", CUSTOM: "" },
    raw: trimmed,
    matched: false,
  };
}
