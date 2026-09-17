import { and, eq, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm/relations";
import type { NodePgTransaction } from "drizzle-orm/node-postgres/session";
import { db } from "../db/pool";
import * as schema from "../db/schema";

// Tx type for transactions
type Tx = NodePgTransaction<typeof schema, ExtractTablesWithRelations<typeof schema>>;
type Executor = Tx | typeof db;

/**
 * Tokens supported in format string:
 * {PREFIX} {YYYY} {YY} {MM} {DD} {YYMM} {MMYY} {SEQ} {SEQ:4} {SEQ:5} etc
 * Example formats:
 *  - "{PREFIX}-{YYMM}-{SEQ:4}" => "PO-2609-0001"
 *  - "{PREFIX}/{YYYY}/{MM}/{SEQ:4}" => "PO/2026/09/0001"
 *  - "{PREFIX}-{YYYY}-{SEQ:5}" => "PO-2026-00001"
 */
function formatDocumentNo(opts: {
  prefix: string;
  format: string;
  seq: number;
  padding: number;
  date: Date;
}): string {
  const d = opts.date;
  const YYYY = String(d.getFullYear());
  const YY = YYYY.slice(-2);
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const DD = String(d.getDate()).padStart(2, "0");
  const YYMM = `${YY}${MM}`;
  const MMYY = `${MM}${YY}`;
  const YYYYMM = `${YYYY}${MM}`;
  const DDMMYYYY = `${DD}${MM}${YYYY}`;

  let out = opts.format;
  // Replace SEQ tokens first: {SEQ} , {SEQ:4}, {SEQ:5}
  out = out.replace(/\{SEQ(?::(\d+))?\}/g, (_m, padStr) => {
    const pad = padStr ? Number(padStr) : opts.padding;
    return String(opts.seq).padStart(pad, "0");
  });
  // Legacy plain SEQ without braces? support "SEQ4" not needed
  out = out.replace(/\{PREFIX\}/g, opts.prefix);
  out = out.replace(/\{YYYY\}/g, YYYY);
  out = out.replace(/\{YY\}/g, YY);
  out = out.replace(/\{MM\}/g, MM);
  out = out.replace(/\{DD\}/g, DD);
  out = out.replace(/\{YYMM\}/g, YYMM);
  out = out.replace(/\{MMYY\}/g, MMYY);
  out = out.replace(/\{YYYYMM\}/g, YYYYMM);
  out = out.replace(/\{DDMMYYYY\}/g, DDMMYYYY);
  // Fallback simple tokens YYYY/YY/MM/DD without braces
  // (not replaced to keep explicit)
  return out;
}

function periodKeyOf(date: Date, resetPolicy: string): string {
  const YYYY = String(date.getFullYear());
  const YY = YYYY.slice(-2);
  const MM = String(date.getMonth() + 1).padStart(2, "0");
  const DD = String(date.getDate()).padStart(2, "0");
  if (resetPolicy === "DAILY") return `${YYYY}${MM}${DD}`;
  if (resetPolicy === "YEARLY") return `${YYYY}`;
  if (resetPolicy === "NEVER") return "GLOBAL";
  // default MONTHLY
  return `${YY}${MM}`; // e.g., 2609
}

/**
 * Generate next document number for a given document type / series.
 * - typeCode: code of documentTypes (e.g. "PO", "SO", "RCV", "GR", "DLV", "SMV", "SOC", "OPJ")
 * - opts.seriesId / seriesCode: pick specific series within type; if omitted uses default series (isDefault)
 * - opts.branchId: required if series.branchSpecific=true; otherwise ignored
 * - opts.date: used for periodKey (monthly reset) and tokens; defaults to now
 * - opts.lock: advisory lock if true (default true)
 */
export async function nextDocumentNo(
  exec: Executor,
  typeCode: string,
  opts: {
    seriesId?: number;
    seriesCode?: string;
    branchId?: number | null;
    date?: Date;
    lock?: boolean;
  } = {}
): Promise<{ documentNo: string; seriesId: number }> {
  const date = opts.date ?? new Date();

  // Map legacy type codes to names (code column removed, only name remains)
  const TYPE_CODE_TO_NAME: Record<string, string> = {
    PO: "Purchase Order",
    PR: "Purchase Request",
    MR: "Material Request",
    SO: "Sales Order",
    RCV: "Receiving",
    QC: "QC Inspection",
    GR: "Goods Receipt",
    DLV: "Delivery",
    SMV: "Stock Movement",
    SOC: "Stock Opname Count",
    OPJ: "Opname Project",
    RFQ: "Request for Quotation",
  };
  const typeName = TYPE_CODE_TO_NAME[typeCode] ?? typeCode;

  // 1. Resolve series
  let series:
    | typeof schema.documentSeries.$inferSelect
    | undefined;

  if (opts.seriesId) {
    const [row] = await (exec as Tx).select().from(schema.documentSeries).where(eq(schema.documentSeries.id, opts.seriesId)).limit(1);
    if (!row) {
      const [r2] = await db.select().from(schema.documentSeries).where(eq(schema.documentSeries.id, opts.seriesId)).limit(1);
      series = r2;
    } else series = row;
    if (!series) throw new Error(`Series id ${opts.seriesId} tidak ditemukan.`);
  } else if (opts.seriesCode) {
    // seriesCode now maps to name (code removed)
    const [row] = await (exec as Tx).select().from(schema.documentSeries).where(eq(schema.documentSeries.name, opts.seriesCode)).limit(1);
    if (!row) {
      const [r2] = await db.select().from(schema.documentSeries).where(eq(schema.documentSeries.name, opts.seriesCode)).limit(1);
      series = r2;
    } else series = row;
    if (!series) throw new Error(`Series ${opts.seriesCode} tidak ditemukan.`);
  } else {
    // find default series for type by name
    const [type] = await (exec as Tx).select().from(schema.documentTypes).where(eq(schema.documentTypes.name, typeName)).limit(1);
    let t = type;
    if (!t) {
      const [r2] = await db.select().from(schema.documentTypes).where(eq(schema.documentTypes.name, typeName)).limit(1);
      t = r2;
    }
    if (!t) throw new Error(`Document type ${typeCode} tidak ditemukan.`);
    const rows = await (exec as Tx).select().from(schema.documentSeries).where(eq(schema.documentSeries.documentTypeId, t.id));
    const list = rows.length ? rows : await db.select().from(schema.documentSeries).where(eq(schema.documentSeries.documentTypeId, t.id));
    if (list.length === 0) throw new Error(`Tidak ada series untuk type ${typeCode}.`);
    series = list.find((s) => s.isDefault) ?? list[0];
  }

  if (!series) throw new Error(`Series tidak ditemukan untuk type ${typeCode}`);
  if (!series.isActive) throw new Error(`Series ${series.name} tidak aktif.`);

  const branchId = series.branchSpecific ? (opts.branchId ?? null) : null;
  if (series.branchSpecific && !branchId) {
    // Not strictly required to throw — allow null but log
    // throw new Error(`Series ${series.name} butuh branchId.`);
  }

  const periodKey = periodKeyOf(date, series.resetPolicy);

  // Advisory lock per series+period+branch to avoid race (mirip id.ts)
  const lock = opts.lock !== false;
  if (lock) {
    const lockKey = `${series.publicId}-${periodKey}-${branchId ?? "GLOBAL"}`;
    // use hashtext to bigint like id.ts
    await (exec as Tx).execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey})::bigint)`);
  }

  // 2. Get or create sequence row
  const seqWhere =
    branchId === null
      ? and(eq(schema.documentSequences.seriesId, series.id), eq(schema.documentSequences.periodKey, periodKey), sql`${schema.documentSequences.branchId} IS NULL`)
      : and(eq(schema.documentSequences.seriesId, series.id), eq(schema.documentSequences.branchId, branchId!), eq(schema.documentSequences.periodKey, periodKey));

  let seqRow:
    | typeof schema.documentSequences.$inferSelect
    | undefined;
  const [existing] = await (exec as Tx).select().from(schema.documentSequences).where(seqWhere).limit(1);
  if (existing) seqRow = existing;
  else {
    // Try insert 0 then select
    try {
      const [ins] = await (exec as Tx)
        .insert(schema.documentSequences)
        .values({
          seriesId: series.id,
          branchId: branchId,
          periodKey,
          lastNumber: 0,
        })
        .returning();
      seqRow = ins;
    } catch (e: unknown) {
      // race: another tx inserted, select again
      const [retry] = await (exec as Tx).select().from(schema.documentSequences).where(seqWhere).limit(1);
      if (!retry) throw e;
      seqRow = retry;
    }
  }

  const nextNum = (seqRow.lastNumber ?? 0) + 1;
  await (exec as Tx)
    .update(schema.documentSequences)
    .set({ lastNumber: nextNum })
    .where(eq(schema.documentSequences.id, seqRow.id));

  const documentNo = formatDocumentNo({
    prefix: series.prefix,
    format: series.format,
    seq: nextNum,
    padding: series.padding,
    date,
  });

  return { documentNo, seriesId: series.id };
}

/** Preview without consuming sequence (for UI). */
export function previewDocumentNo(series: {
  prefix: string;
  format: string;
  padding: number;
}, seq: number, date: Date = new Date()): string {
  return formatDocumentNo({ prefix: series.prefix, format: series.format, seq, padding: series.padding, date });
}

export function getPeriodKey(date: Date, resetPolicy: string): string {
  return periodKeyOf(date, resetPolicy);
}
