import type {
  BarcodeFormat,
  BarcodeSegment,
  BatchFormat,
  BatchParseResult,
  ItemGroup,
  Item,
  SegmentField,
} from "@/types";
import { parseBatchNumber } from "@/lib/batch/parser";

export const SEGMENT_FIELD_LABELS: Record<SegmentField, string> = {
  ITEM_CODE: "Kode Item",
  ITEM_GROUP: "Item Group",
  DATE: "Tanggal",
  SEQUENCE: "No. Urut",
  BARCODE_ID: "Barcode",
  BATCH: "Batch",
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

  if (sorted[sorted.length - 1].end !== barcodeLength) {
    errors.push(
      `Format menutupi ${sorted[sorted.length - 1].end} digit tetapi panjang barcode ${barcodeLength} digit. Segmen harus menutupi seluruh panjang barcode.`
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
  itemGroupCode?: string;
  /** Nomor batch hasil ekstraksi segmen BATCH (jika format punya segmen BATCH). */
  batchNumber?: string;
  /** Hasil parse nomor batch via format batch yang ditunjuk segmen BATCH. */
  batch?: BatchParseResult | null;
  matched: boolean;
}

export interface ParseContext {
  items: Item[];
  itemGroups: ItemGroup[];
  batchFormats: BatchFormat[];
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
    ITEM_GROUP: "",
    DATE: "",
    SEQUENCE: "",
    BARCODE_ID: "",
    BATCH: "",
    CUSTOM: "",
  };

  for (const seg of sortSegments(format.segments)) {
    values[seg.field] = extractSegment(raw, seg);
  }

  // Segmen BATCH wajib menunjuk format batch (batasan desain) — format tanpa
  // ikatan dianggap tidak valid dan dilewati.
  const batchSeg = sortSegments(format.segments).find((s) => s.field === "BATCH");
  let batchNumber: string | undefined;
  let batch: BatchParseResult | null = null;
  if (batchSeg) {
    if (!batchSeg.batchFormatId) return null;
    batchNumber = values.BATCH;
    const batchFormat = ctx.batchFormats.find(
      (f) => f.id === batchSeg.batchFormatId
    );
    if (batchFormat) {
      batch = parseBatchNumber(batchNumber, [batchFormat]);
    }
  }

  let itemId: string | undefined;
  let item: Item | undefined;

  const itemCode = values.ITEM_CODE;
  if (itemCode) {
    item = ctx.items.find(
      (i) => i.code.toLowerCase() === itemCode.toLowerCase()
    );
    if (item) itemId = item.id;
  }

  const itemGroupCode = values.ITEM_GROUP || undefined;
  if (!item && itemGroupCode) {
    const itemGroup = ctx.itemGroups.find(
      (c) => c.code.toLowerCase() === itemGroupCode.toLowerCase()
    );
    if (itemGroup) {
      const candidates = ctx.items.filter(
        (i) => i.itemGroupId === itemGroup.id
      );
      if (candidates.length === 1) {
        item = candidates[0];
        itemId = item.id;
      }
    }
  }

  // Fallback terakhir: item terkode lewat alternative code di batch number.
  if (!item && batch?.alternativeCode) {
    item = ctx.items.find(
      (i) =>
        i.alternativeCode &&
        i.alternativeCode.toLowerCase() === batch.alternativeCode!.toLowerCase()
    );
    if (item) itemId = item.id;
  }

  return {
    formatId: format.id,
    formatName: format.name,
    values,
    raw,
    itemId,
    item,
    itemGroupCode,
    batchNumber,
    batch,
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
    values: { ITEM_CODE: "", ITEM_GROUP: "", DATE: "", SEQUENCE: "", BARCODE_ID: "", BATCH: "", CUSTOM: "" },
    raw: trimmed,
    batchNumber: undefined,
    batch: null,
    matched: false,
  };
}
