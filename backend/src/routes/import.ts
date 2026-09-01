import { Router, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";
import { nextRowId } from "../lib/id";
import { checkPermission } from "../middleware/rbac";

export interface ImportPayload {
  mode?: "skip" | "update";
  rows: Record<string, unknown>[];
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

type RowError = { row: number; message: string };

const importRouter = Router();

// Whitelist dataset yang boleh di-import. Pemetaan ini menjelaskan struktur
// kolom spreadsheet → kolom DB + aturan validasi + resolusi foreign key.
type DatasetId = "branches" | "warehouses" | "locations" | "itemGroups" | "items" | "stockBalances";

const DATASET_MENU: Record<DatasetId, string> = {
  branches: "inventory",
  warehouses: "inventory",
  locations: "inventory",
  itemGroups: "master",
  items: "master",
  stockBalances: "inventory",
};

function isDataset(value: string): value is DatasetId {
  return value in DATASET_MENU;
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function asInt(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

// ----- Dataset processors -----

async function importBranches(
  rows: Record<string, unknown>[],
  mode: "skip" | "update"
): Promise<{ result: ImportResult; affected: Array<{ id: string; row: Record<string, unknown> }> }> {
  const errors: RowError[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const affected: Array<{ id: string; row: Record<string, unknown> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = asString(r.code);
    const name = asString(r.name);
    const city = asString(r.city) ?? "";
    if (!code) { errors.push({ row: i + 1, message: "Kolom 'code' wajib diisi." }); continue; }
    if (!name) { errors.push({ row: i + 1, message: "Kolom 'name' wajib diisi." }); continue; }

    const [existing] = await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(sql`lower(${schema.branches.code}) = lower(${code})`)
      .limit(1);

    if (existing) {
      if (mode === "update") {
        await db
          .update(schema.branches)
          .set({ code, name, city })
          .where(eq(schema.branches.id, existing.id));
        updated += 1;
        affected.push({ id: existing.id, row: { code, name, city } });
      } else {
        skipped += 1;
      }
      continue;
    }

    // id: br-YYMM-0001, ...
    const newId = await nextRowId(db, schema.branches, "br");
    await db.insert(schema.branches).values({ id: newId, code, name, city });
    inserted += 1;
    affected.push({ id: newId, row: { code, name, city } });
  }

  return { result: { inserted, updated, skipped, errors }, affected };
}

async function importWarehouses(
  rows: Record<string, unknown>[],
  mode: "skip" | "update"
): Promise<{ result: ImportResult; affected: Array<{ id: string; row: Record<string, unknown> }> }> {
  const errors: RowError[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const affected: Array<{ id: string; row: Record<string, unknown> }> = [];

  // Cache branch by code (case-insensitive) agar tidak query berulang.
  const branchRows = await db.select().from(schema.branches);
  const branchByCode = new Map<string, { id: string }>();
  for (const b of branchRows) branchByCode.set(b.code.toLowerCase(), { id: b.id });

  const allWh = await db.select({ id: schema.warehouses.id }).from(schema.warehouses);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = asString(r.code);
    const name = asString(r.name);
    const branchCode = asString(r.branchCode) ?? asString(r.branch_code);
    if (!code) { errors.push({ row: i + 1, message: "Kolom 'code' wajib diisi." }); continue; }
    if (!name) { errors.push({ row: i + 1, message: "Kolom 'name' wajib diisi." }); continue; }
    if (!branchCode) { errors.push({ row: i + 1, message: "Kolom 'branchCode' wajib diisi (kode cabang)." }); continue; }

    const branch = branchByCode.get(branchCode.toLowerCase());
    if (!branch) { errors.push({ row: i + 1, message: `Cabang '${branchCode}' tidak ditemukan. Impor cabang terlebih dahulu.` }); continue; }

    const [existing] = await db
      .select({ id: schema.warehouses.id })
      .from(schema.warehouses)
      .where(sql`lower(${schema.warehouses.code}) = lower(${code}) AND ${schema.warehouses.branchId} = ${branch.id}`)
      .limit(1);

    if (existing) {
      if (mode === "update") {
        await db
          .update(schema.warehouses)
          .set({ code, name, branchId: branch.id })
          .where(eq(schema.warehouses.id, existing.id));
        updated += 1;
        affected.push({ id: existing.id, row: { code, name, branchId: branch.id } });
      } else {
        skipped += 1;
      }
      continue;
    }

    const newId = await nextRowId(db, schema.warehouses, "wh");
    await db.insert(schema.warehouses).values({ id: newId, code, name, branchId: branch.id });
    inserted += 1;
    affected.push({ id: newId, row: { code, name, branchId: branch.id } });
  }

  return { result: { inserted, updated, skipped, errors }, affected };
}

async function importLocations(
  rows: Record<string, unknown>[],
  mode: "skip" | "update"
): Promise<{ result: ImportResult; affected: Array<{ id: string; row: Record<string, unknown> }> }> {
  const errors: RowError[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const affected: Array<{ id: string; row: Record<string, unknown> }> = [];

  // Cache: warehouse by code (case-insensitive) + branch by code.
  const whRows = await db.select().from(schema.warehouses);
  const branchByCode = new Map<string, string>();
  const branchRows = await db.select().from(schema.branches);
  for (const b of branchRows) branchByCode.set(b.code.toLowerCase(), b.id);

  const whByCode = new Map<string, { id: string; branchId: string; code: string }>();
  for (const w of whRows) whByCode.set(w.code.toLowerCase(), { id: w.id, branchId: w.branchId, code: w.code });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = asString(r.code);
    const name = asString(r.name);
    const whCode = asString(r.warehouseCode) ?? asString(r.warehouse_code);
    const branchCode = asString(r.branchCode) ?? asString(r.branch_code);
    if (!code) { errors.push({ row: i + 1, message: "Kolom 'code' wajib diisi." }); continue; }
    if (!name) { errors.push({ row: i + 1, message: "Kolom 'name' wajib diisi." }); continue; }
    if (!whCode) { errors.push({ row: i + 1, message: "Kolom 'warehouseCode' wajib diisi." }); continue; }

    const wh = whByCode.get(whCode.toLowerCase());
    if (!wh) { errors.push({ row: i + 1, message: `Gudang '${whCode}' tidak ditemukan. Impor gudang terlebih dahulu.` }); continue; }
    if (branchCode) {
      // Pastikan warehouse ada di branch yang dimaksud (jika keduanya diisi).
      const branchId = branchByCode.get(branchCode.toLowerCase());
      if (!branchId) { errors.push({ row: i + 1, message: `Cabang '${branchCode}' tidak ditemukan.` }); continue; }
      if (wh.branchId !== branchId) {
        errors.push({ row: i + 1, message: `Gudang '${whCode}' bukan milik cabang '${branchCode}'.` });
        continue;
      }
    }

    const [existing] = await db
      .select({ id: schema.locations.id })
      .from(schema.locations)
      .where(sql`lower(${schema.locations.code}) = lower(${code}) AND ${schema.locations.warehouseId} = ${wh.id}`)
      .limit(1);

    if (existing) {
      if (mode === "update") {
        await db
          .update(schema.locations)
          .set({ code, name, warehouseId: wh.id })
          .where(eq(schema.locations.id, existing.id));
        updated += 1;
        affected.push({ id: existing.id, row: { code, name, warehouseId: wh.id } });
      } else {
        skipped += 1;
      }
      continue;
    }

    const newId = await nextRowId(db, schema.locations, "loc");
    await db.insert(schema.locations).values({ id: newId, code, name, warehouseId: wh.id });
    inserted += 1;
    affected.push({ id: newId, row: { code, name, warehouseId: wh.id } });
  }

  return { result: { inserted, updated, skipped, errors }, affected };
}

async function importItemGroups(
  rows: Record<string, unknown>[],
  mode: "skip" | "update"
): Promise<{ result: ImportResult; affected: Array<{ id: string; row: Record<string, unknown> }> }> {
  const errors: RowError[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const affected: Array<{ id: string; row: Record<string, unknown> }> = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = asString(r.code);
    const name = asString(r.name);
    if (!code) { errors.push({ row: i + 1, message: "Kolom 'code' wajib diisi." }); continue; }
    if (!name) { errors.push({ row: i + 1, message: "Kolom 'name' wajib diisi." }); continue; }

    const [existing] = await db
      .select({ id: schema.itemGroups.id })
      .from(schema.itemGroups)
      .where(sql`lower(${schema.itemGroups.code}) = lower(${code})`)
      .limit(1);

    if (existing) {
      if (mode === "update") {
        await db.update(schema.itemGroups).set({ code, name }).where(eq(schema.itemGroups.id, existing.id));
        updated += 1;
        affected.push({ id: existing.id, row: { code, name } });
      } else {
        skipped += 1;
      }
      continue;
    }

    const newId = await nextRowId(db, schema.itemGroups, "igr");
    await db.insert(schema.itemGroups).values({ id: newId, code, name });
    inserted += 1;
    affected.push({ id: newId, row: { code, name } });
  }

  return { result: { inserted, updated, skipped, errors }, affected };
}

async function importItems(
  rows: Record<string, unknown>[],
  mode: "skip" | "update"
): Promise<{ result: ImportResult; affected: Array<{ id: string; row: Record<string, unknown> }> }> {
  const errors: RowError[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const affected: Array<{ id: string; row: Record<string, unknown> }> = [];

  const igRows = await db.select().from(schema.itemGroups);
  const igByCode = new Map<string, string>();
  for (const c of igRows) igByCode.set(c.code.toLowerCase(), c.id);

  const uomRows = await db.select().from(schema.uom);
  const uomByCode = new Map<string, string>();
  for (const u of uomRows) {
    uomByCode.set(u.code.toLowerCase(), u.id);
    uomByCode.set(u.name.toLowerCase(), u.id);
  }

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const code = asString(r.code);
    const name = asString(r.name);
    const itemGroupCode = asString(r.itemGroupCode) ?? asString(r.item_group_code);
    const hue = asInt(r.hue, 200);
    const uomCode = asString(r.uomCode) ?? asString(r.uom_code) ?? asString(r.unit) ?? null;
    const uomId = uomCode ? uomByCode.get(uomCode.toLowerCase()) ?? null : null;
    const standardCostRaw = asString(r.standardCost) ?? asString(r.standard_cost) ?? asString(r.standardPrice) ?? null;
    const standardCost = standardCostRaw != null && standardCostRaw !== "" ? String(Number(standardCostRaw)) : null;

    if (!code) { errors.push({ row: i + 1, message: "Kolom 'code' wajib diisi." }); continue; }
    if (!name) { errors.push({ row: i + 1, message: "Kolom 'name' wajib diisi." }); continue; }
    if (!itemGroupCode) { errors.push({ row: i + 1, message: "Kolom 'itemGroupCode' wajib diisi." }); continue; }

    const itemGroupId = igByCode.get(itemGroupCode.toLowerCase());
    if (!itemGroupId) {
      errors.push({ row: i + 1, message: `Grup item '${itemGroupCode}' tidak ditemukan. Impor grup item terlebih dahulu.` });
      continue;
    }
    if (uomCode && !uomId) {
      errors.push({ row: i + 1, message: `UOM '${uomCode}' tidak ditemukan. Impor UOM terlebih dahulu.` });
      continue;
    }

    const [existing] = await db
      .select({ id: schema.items.id })
      .from(schema.items)
      .where(sql`lower(${schema.items.code}) = lower(${code})`)
      .limit(1);

    if (existing) {
      if (mode === "update") {
        await db
          .update(schema.items)
          .set({ code, name, itemGroupId, hue, uomId, standardCost })
          .where(eq(schema.items.id, existing.id));
        updated += 1;
        affected.push({ id: existing.id, row: { code, name, itemGroupId, hue, uomId, standardCost } });
      } else {
        skipped += 1;
      }
      continue;
    }

    const newId = await nextRowId(db, schema.items, "itm");
    await db.insert(schema.items).values({ id: newId, code, name, itemGroupId, hue, uomId, standardCost });
    inserted += 1;
    affected.push({ id: newId, row: { code, name, itemGroupId, hue, uomId, standardCost } });
  }

  return { result: { inserted, updated, skipped, errors }, affected };
}

async function importStockBalances(
  rows: Record<string, unknown>[],
  mode: "skip" | "update"
): Promise<{ result: ImportResult; affected: Array<{ id: string; row: Record<string, unknown> }> }> {
  const errors: RowError[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const affected: Array<{ id: string; row: Record<string, unknown> }> = [];

  // Cache warehouse & item by code (case-insensitive) agar tidak query berulang.
  const whRows = await db.select({ id: schema.warehouses.id, code: schema.warehouses.code }).from(schema.warehouses);
  const whByCode = new Map<string, string>();
  for (const w of whRows) {
    whByCode.set(w.code.toLowerCase(), w.id);
  }

  const itemRows = await db.select({ id: schema.items.id, code: schema.items.code }).from(schema.items);
  const itemByCode = new Map<string, { id: string }>();
  for (const it of itemRows) itemByCode.set(it.code.toLowerCase(), { id: it.id });

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const warehouseCode = asString(r.warehouseCode) ?? asString(r.warehouse_code);
    const itemCode = asString(r.itemCode) ?? asString(r.item_code);
    const closingQty = asInt(r.qty ?? r.closingQty ?? r.closing_qty, 0);
    const openingQty = asInt(r.openingQty ?? r.opening_qty, 0);
    const inQty = asInt(r.inQty ?? r.in_qty, 0);
    const outQty = asInt(r.outQty ?? r.out_qty, 0);
    const balanceDateRaw = asString(r.balanceDate) ?? asString(r.balance_date);

    if (!warehouseCode) { errors.push({ row: i + 1, message: "Kolom 'warehouseCode' wajib diisi." }); continue; }
    if (!itemCode) { errors.push({ row: i + 1, message: "Kolom 'itemCode' wajib diisi." }); continue; }

    const warehouseId = whByCode.get(warehouseCode.toLowerCase());
    if (!warehouseId) {
      errors.push({ row: i + 1, message: `Gudang '${warehouseCode}' tidak ditemukan. Impor gudang terlebih dahulu.` });
      continue;
    }

    const itemMatch = itemByCode.get(itemCode.toLowerCase());
    if (!itemMatch) {
      errors.push({ row: i + 1, message: `Item '${itemCode}' tidak ditemukan. Impor item terlebih dahulu.` });
      continue;
    }
    const itemId = itemMatch.id;

    const balanceDate = balanceDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(balanceDateRaw)
      ? balanceDateRaw
      : sql`CURRENT_DATE`;

    const [existing] = await db
      .select({ id: schema.stockBalances.id })
      .from(schema.stockBalances)
      .where(
        sql`${schema.stockBalances.warehouseId} = ${warehouseId} AND ${schema.stockBalances.itemId} = ${itemId}`
      )
      .limit(1);

    if (existing) {
      if (mode === "update") {
        await db
          .update(schema.stockBalances)
          .set({
            balanceDate,
            openingQty,
            inQty,
            outQty,
            closingQty,
            updatedAt: new Date(),
          })
          .where(eq(schema.stockBalances.id, existing.id));
        updated += 1;
        affected.push({ id: existing.id, row: { warehouseId, itemId, closingQty } });
      } else {
        skipped += 1;
      }
      continue;
    }

    const newId = await nextRowId(db, schema.stockBalances, "sb");
    await db.insert(schema.stockBalances).values({
      id: newId,
      balanceDate,
      warehouseId,
      itemId,
      openingQty,
      inQty,
      outQty,
      closingQty,
    });
    inserted += 1;
    affected.push({ id: newId, row: { warehouseId, itemId, closingQty } });
  }

  return { result: { inserted, updated, skipped, errors }, affected };
}

// ----- Routes -----

importRouter.post("/:dataset", async (req: Request, res: Response) => {
  const dataset = String(req.params.dataset ?? "");
  if (!isDataset(dataset)) {
    res.status(404).json({ error: `Dataset '${dataset}' tidak didukung. Pilihan: branches, warehouses, locations, itemGroups, items, stockBalances.` });
    return;
  }
  if (!(await checkPermission(req, res, DATASET_MENU[dataset], "create"))) {
    return;
  }

  const body = req.body as ImportPayload | undefined;
  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  if (rows.length === 0) {
    res.status(400).json({ error: "Tidak ada baris untuk diimpor." });
    return;
  }
  const mode: "skip" | "update" = body?.mode === "update" ? "update" : "skip";

  try {
    let result: ImportResult;
    switch (dataset) {
      case "branches":   ({ result } = await importBranches(rows, mode)); break;
      case "warehouses": ({ result } = await importWarehouses(rows, mode)); break;
      case "locations":  ({ result } = await importLocations(rows, mode)); break;
      case "itemGroups": ({ result } = await importItemGroups(rows, mode)); break;
      case "items":      ({ result } = await importItems(rows, mode)); break;
      case "stockBalances": ({ result } = await importStockBalances(rows, mode)); break;
    }
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal mengimpor data.";
    res.status(500).json({ error: message });
  }
});

export { importRouter };