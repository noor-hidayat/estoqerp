// @ts-nocheck
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import { db } from "../db/pool";
import * as schema from "../db/schema";

const MAX_ITEMS = 150;
const MAX_SESSIONS = 30;
const MAX_RECORDS = 40;
const MAX_ENTRIES = 40;
const MAX_PROJECTS = 60;

export interface AiScope {
  branchIds: string[];
  warehouseIds: string[];
  isAdmin: boolean;
}

function pickIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const set = new Set(ids);
  return rows.filter((r) => set.has(r.id));
}

/** Ringkasan data read-only seluruh aplikasi, di-scope per akses user.
 *  Sengaja kompak (agregat + sample) agar muat di kuota free tier. */
export async function buildDataContext(scope: AiScope): Promise<string> {
  const s = schema;
  const { branchIds, warehouseIds, isAdmin } = scope;

  const hasWh = warehouseIds.length > 0;
  const hasBr = branchIds.length > 0;

  const branches = hasBr ? pickIds(await db.select().from(s.branches), branchIds) : await db.select().from(s.branches);
  const warehouses = hasWh ? pickIds(await db.select().from(s.warehouses), warehouseIds) : await db.select().from(s.warehouses);
  const locations = await db
    .select()
    .from(s.locations)
    .then((all) =>
      hasWh
        ? all.filter((l) => warehouseIds.includes(l.warehouseId))
        : all
    );
  const itemGroups = await db.select().from(s.itemGroups);
  const items = await db.select().from(s.items).then((all) => all.slice(0, MAX_ITEMS));
  const uomsAll = await db.select().from(s.uom);
  const uomById = new Map(uomsAll.map((u) => [u.id, u]));
  const barcodeFormats = await db.select().from(s.barcodeFormats).limit(20);
  const users = await db
    .select({ id: s.users.id, name: s.users.name, role: s.users.role })
    .from(s.users);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const locById = new Map(locations.map((l) => [l.id, l]));
  const igById = new Map(itemGroups.map((c) => [c.id, c]));

  // ---- stock balances: agregat per gudang + top item ----
  const sbs = await db
    .select({
      warehouseId: s.stockBalances.warehouseId,
      itemId: s.stockBalances.itemId,
      openingQty: s.stockBalances.openingQty,
      inQty: s.stockBalances.inQty,
      outQty: s.stockBalances.outQty,
      closingQty: s.stockBalances.closingQty,
      balanceDate: s.stockBalances.balanceDate,
    })
    .from(s.stockBalances)
    .then((all) => (hasWh ? all.filter((r) => warehouseIds.includes(r.warehouseId)) : all));

  const whTotals = new Map<string, { opening: number; inQty: number; outQty: number; closing: number; items: number }>();
  for (const r of sbs) {
    const t = whTotals.get(r.warehouseId) ?? { opening: 0, inQty: 0, outQty: 0, closing: 0, items: 0 };
    t.opening += r.openingQty;
    t.inQty += r.inQty;
    t.outQty += r.outQty;
    t.closing += r.closingQty;
    t.items += 1;
    whTotals.set(r.warehouseId, t);
  }
  const stockSummary = [...whTotals.entries()]
    .map(([whId, t]) => ({
      gudang: whById.get(whId)?.name ?? whId,
      jumlahBarang: t.items,
      saldoAwal: t.opening,
      masuk: t.inQty,
      keluar: t.outQty,
      saldoAkhir: t.closing,
    }))
    .sort((a, b) => b.saldoAkhir - a.saldoAkhir);

  const itemClosing = new Map<string, number>();
  for (const r of sbs) {
    itemClosing.set(r.itemId, (itemClosing.get(r.itemId) ?? 0) + r.closingQty);
  }
  const topItems = [...itemClosing.entries()]
    .map(([itemId, qty]) => ({ barang: itemById.get(itemId)?.name ?? itemId, kode: itemById.get(itemId)?.code, qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 30);

  // ---- projects opname (4 tabel) ----
  const projects = await db
    .select({
      id: s.opnameProjects.id,
      name: s.opnameProjects.name,
      mode: s.opnameProjects.mode,
      status: s.opnameProjects.status,
      createdAt: s.opnameProjects.createdAt,
    })
    .from(s.opnameProjects)
    .then((all) =>
      all
        .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0))
        .slice(0, MAX_PROJECTS)
    );

  // Scope proyek: harus punya minimal 1 opname_warehouse di scope user.
  let projectIds = projects.map((p) => p.id);
  if (!isAdmin && (hasBr || hasWh)) {
    const whOfBranches = hasBr
      ? (await db.select({ id: s.warehouses.id }).from(s.warehouses).where(inArray(s.warehouses.branchId, branchIds))).map((w) => w.id)
      : [];
    const scopeWhIds = [...new Set([...warehouseIds, ...whOfBranches])];
    if (scopeWhIds.length === 0) {
      projectIds = [];
    } else {
      const scoped = await db
        .selectDistinct({ opnameId: s.opnameWarehouses.opnameId })
        .from(s.opnameWarehouses)
        .where(inArray(s.opnameWarehouses.warehouseId, scopeWhIds));
      projectIds = scoped.map((r) => r.opnameId);
    }
    projects.splice(0, projects.length, ...projects.filter((p) => projectIds.includes(p.id)));
  }

  const projectById = new Map(projects.map((p) => [p.id, p]));
  projectIds = projects.map((p) => p.id);

  // warehouse peserta per proyek (untuk nama gudang/cabang).
  const opWhAll = projectIds.length > 0
    ? await db
        .select({
          opnameId: s.opnameWarehouses.opnameId,
          warehouseId: s.opnameWarehouses.warehouseId,
        })
        .from(s.opnameWarehouses)
        .where(inArray(s.opnameWarehouses.opnameId, projectIds))
    : [];
  const whIdsOfProjects = [...new Set(opWhAll.map((r) => r.warehouseId))];
  const whOfProjects = whIdsOfProjects.length > 0
    ? await db.select().from(s.warehouses).where(inArray(s.warehouses.id, whIdsOfProjects))
    : [];
  const whOfProjectsById = new Map(whOfProjects.map((w) => [w.id, w]));
  const projectWhIds = new Map<string, string[]>();
  const projectWhNames = new Map<string, string[]>();
  for (const r of opWhAll) {
    const idList = projectWhIds.get(r.opnameId) ?? [];
    if (!idList.includes(r.warehouseId)) idList.push(r.warehouseId);
    projectWhIds.set(r.opnameId, idList);
    const nameList = projectWhNames.get(r.opnameId) ?? [];
    const name = whOfProjectsById.get(r.warehouseId)?.name ?? r.warehouseId;
    if (!nameList.includes(name)) nameList.push(name);
    projectWhNames.set(r.opnameId, nameList);
  }

  const projectSummary = projects.map((p) => ({
    nama: p.name,
    gudang: projectWhNames.get(p.id) ?? [],
    mode: p.mode,
    status: p.status,
  }));

  // ---- header scan & detail scan ----
  const sessions = await db
    .select({
      id: s.opnameScans.id,
      opnameId: s.opnameScans.opnameId,
      scannedBy: s.opnameScans.scannedBy,
      startedAt: s.opnameScans.startedAt,
      status: s.opnameScans.status,
    })
    .from(s.opnameScans)
    .then((all) =>
      all
        .filter((r) => (projectIds.length === 0 ? false : projectIds.includes(r.opnameId)))
        .sort((a, b) => (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0))
        .slice(0, MAX_SESSIONS)
    );

  const records = await db
    .select({
      opnameId: s.opnameScanDetails.opnameId,
      itemId: s.opnameScanDetails.itemId,
      quantity: s.opnameScanDetails.quantity,
      scannedAt: s.opnameScanDetails.scannedAt,
    })
    .from(s.opnameScanDetails)
    .then((all) => {
      const filtered = projectIds.length === 0 ? [] : all.filter((r) => projectIds.includes(r.opnameId));
      return filtered
        .sort((a, b) => (b.scannedAt?.getTime() ?? 0) - (a.scannedAt?.getTime() ?? 0))
        .slice(0, MAX_RECORDS);
    });
  const totalScanQty =
    Number(
      (await db
        .select({ qty: sql<number>`COALESCE(SUM(${s.opnameScanDetails.quantity}), 0)` })
        .from(s.opnameScanDetails)
        .where(
          projectIds.length > 0 ? inArray(s.opnameScanDetails.opnameId, projectIds) : sql`FALSE`
        ))[0]?.qty ?? 0
    );

  // ---- statistik progres per proyek (agregat, bukan sample) ----
  const { scanned, sessions: sessStats, entries: entrStats } = await progressStats(projectIds);

  const whItemCount = new Map<string, number>();
  for (const r of sbs) {
    whItemCount.set(r.warehouseId, (whItemCount.get(r.warehouseId) ?? 0) + 1);
  }

  const progressRows = toProgressRows(
    projects.map((p) => ({ id: p.id, name: p.name, status: p.status, mode: p.mode })),
    projectWhIds,
    whItemCount,
    scanned,
    sessStats,
    entrStats
  );

  const sections: string[] = [];
  const push = (title: string, body: unknown) => {
    sections.push(`## ${title}\n${JSON.stringify(body)}`);
  };

  push("ringkasan_umum", {
    cabang: branches.length,
    gudang: warehouses.length,
    lokasi: locations.length,
    grupItem: itemGroups.length,
    totalBarangDiMaster: items.length,
    barcodeFormat: barcodeFormats.length,
    totalSaldoRecord: sbs.length,
    totalProyek: projects.length,
    totalSesiScan: sessions.length,
    totalQtyScan: totalScanQty,
  });
  push("cabang", branches);
  push("gudang", warehouses);
  push("lokasi", locations);
  push("grup_item", itemGroups);
  push("barang_master", items.map((i) => ({
    id: i.id,
    kode: i.code,
    nama: i.name,
    satuan: i.uomId ? (uomById.get(i.uomId)?.name ?? null) : null,
    grupItem: igById.get(i.itemGroupId)?.name ?? null,
  })));
  push("barcode_formats", barcodeFormats.map((b) => ({
    nama: b.name,
    deskripsi: b.description,
    aktif: b.isActive,
  })));
  push("ringkasan_stok_per_gudang", stockSummary);
  push("barang_dengan_saldo_terbanyak", topItems);
  push("proyek_opname", projectSummary);
  push("progres_proyek", progressRows);
  push("sesi_scan_terbaru", sessions.map((r) => ({
    id: r.id,
    proyek: projectById.get(r.opnameId)?.name ?? r.opnameId,
    operator: users.find((u) => u.id === r.scannedBy)?.name ?? null,
    mulai: r.startedAt,
    status: r.status,
  })));
  push("hasil_scan_terbaru", records.map((r) => ({
    proyek: projectById.get(r.opnameId)?.name ?? r.opnameId,
    barang: itemById.get(r.itemId ?? "")?.name ?? r.itemId,
    qty: r.quantity,
    waktu: r.scannedAt,
  })));
  push("pengguna", users.map((u) => ({ nama: u.name, role: u.role })));

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Statistik progres proyek (agregat DB)
// ---------------------------------------------------------------------------

interface ScannedStat {
  projectId: string;
  barangTerscan: number;
  qtyScan: number;
}

interface EntryStat {
  projectId: string;
  barangDiisi: number;
  qtyHitung: number;
}

async function progressStats(projectIds: string[]) {
  const where = projectIds.length > 0
    ? inArray(schema.opnameScanDetails.opnameId, projectIds)
    : sql`FALSE`;
  const [scanned, sessions] = await Promise.all([
    db
      .select({
        projectId: schema.opnameScanDetails.opnameId,
        barangTerscan: sql<number>`COUNT(DISTINCT ${schema.opnameScanDetails.itemId})`,
        qtyScan: sql<number>`COALESCE(SUM(${schema.opnameScanDetails.quantity}), 0)`,
      })
      .from(schema.opnameScanDetails)
      .where(where)
      .groupBy(schema.opnameScanDetails.opnameId),
    db
      .select({
        projectId: schema.opnameScans.opnameId,
        jumlahSesi: sql<number>`COUNT(*)`,
      })
      .from(schema.opnameScans)
      .where(projectIds.length > 0 ? inArray(schema.opnameScans.opnameId, projectIds) : sql`FALSE`)
      .groupBy(schema.opnameScans.opnameId),
  ]);
  const entries = scanned.map((r) => ({
    projectId: r.projectId,
    barangDiisi: Number(r.barangTerscan),
    qtyHitung: Number(r.qtyScan),
  }));
  return {
    scanned: new Map<string, ScannedStat>(
      scanned.map((r) => [r.projectId, { projectId: r.projectId, barangTerscan: Number(r.barangTerscan), qtyScan: Number(r.qtyScan) }])
    ),
    sessions: new Map<string, number>(sessions.map((r) => [r.projectId, Number(r.jumlahSesi)])),
    entries: new Map<string, EntryStat>(
      entries.map((r) => [r.projectId, { projectId: r.projectId, barangDiisi: r.barangDiisi, qtyHitung: r.qtyHitung }])
    ),
  };
}

function toProgressRows(
  projs: { id: string; name: string; status: string; mode: string }[],
  projectWhIds: Map<string, string[]>,
  whItemCount: Map<string, number>,
  scanned: Map<string, ScannedStat>,
  sessions: Map<string, number>,
  entries: Map<string, EntryStat>
) {
  return projs.map((p) => {
    const whIds = projectWhIds.get(p.id) ?? [];
    const total = whIds.reduce((sum, whId) => sum + (whItemCount.get(whId) ?? 0), 0);
    const sc = scanned.get(p.id);
    const ent = entries.get(p.id);
    const terscan = sc?.barangTerscan ?? 0;
    return {
      nama: p.name,
      status: p.status,
      mode: p.mode,
      totalBarangGudang: total,
      barangTerscan: terscan,
      qtyScan: sc?.qtyScan ?? 0,
      jumlahSesi: sessions.get(p.id) ?? 0,
      persenProgress: total > 0 ? Math.round((terscan / total) * 100) : null,
      entri: ent
        ? { barangDiisi: ent.barangDiisi, qtyHitung: ent.qtyHitung }
        : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Deteksi pertanyaan non-data & pencarian entitas spesifik (targeted lookup)
// ---------------------------------------------------------------------------

const DATA_KEYWORDS = [
  "stok", "stock", "barang", "item", "gudang", "warehouse", "cabang", "branch",
  "proyek", "project", "opname", "scan", "sesi", "laporan", "report", "selisih",
  "qty", "jumlah", "total", "kategori", "grup", "barcode", "rak", "lokasi", "saldo",
  "masuk", "keluar", "persediaan", "inventory", "analisis", "analisa", "data",
  "hitung", "berapa", "banyak", "ringkasan", "summary", "terbanyak", "terbesar",
  "user", "pengguna", "akun", "role", "harga", "pemasok", "supplier", "mutasi",
  "riwayat", "history", "entri", "entry", "deadline", "status", "progress", "progres",
];

/** True bila pertanyaan menyentuh data aplikasi (stok/opname/laporan/dll). */
export function isDataRelated(text: string): boolean {
  const t = text.toLowerCase();
  return DATA_KEYWORDS.some((k) => t.includes(k));
}

const LOOKUP_STOP = new Set([
  "yang", "dengan", "untuk", "dari", "pada", "adalah", "berapa", "total",
  "semua", "data", "kamu", "saya", "stok", "stock", "saldo", "barang", "item",
  "gudang", "warehouse", "cabang", "branch", "proyek", "project", "opname",
  "scan", "selisih", "qty", "jumlah", "pcs", "unit", "di", "dan", "atau",
  "serta", "per", "tolong", "mohon", "coba", "lihat", "cek", "kasih", "info",
  "informasi", "tampilkan", "tunjukkan", "besar", "kecil", "banyak", "sedikit",
  "hitung", "berikan", "bisa", "mau", "ingin", "tentang", "dgn", "utk",
  "progress", "progres", "gimana", "bagaimana",
]);

function lookupTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !LOOKUP_STOP.has(w));
}

/** Cari entitas spesifik yang disebut user (nama item/gudang/cabang/proyek/
 *  grup item) via pencocokan nama (ILIKE). Hasil kompak melengkapi snapshot. */
export async function lookupEntities(q: string, scope: AiScope): Promise<string> {
  const tokens = lookupTokens(q);
  if (tokens.length === 0) return "";
  const match = (col: AnyColumn) => or(...tokens.map((t) => ilike(col, `%${t}%`)));

  const [itemsM, whM, brM, projM, igM] = await Promise.all([
    db.select().from(schema.items).where(match(schema.items.name)).limit(25),
    db.select().from(schema.warehouses).where(match(schema.warehouses.name)).limit(10),
    db.select().from(schema.branches).where(match(schema.branches.name)).limit(10),
    db.select().from(schema.opnameProjects).where(match(schema.opnameProjects.name)).limit(10),
    db.select().from(schema.itemGroups).where(match(schema.itemGroups.name)).limit(10),
  ]);

  const sections: string[] = [];
  const push = (title: string, body: unknown) =>
    sections.push(`## ${title}\n${JSON.stringify(body)}`);

  const uomsAll = await db.select().from(schema.uom);
  const uomById = new Map(uomsAll.map((u) => [u.id, u]));

  if (itemsM.length > 0) {
    push("barang_terkait", itemsM.map((i) => ({ kode: i.code, nama: i.name, satuan: i.uomId ? (uomById.get(i.uomId)?.name ?? null) : null })));
  }
  if (whM.length > 0) {
    push("gudang_terkait", whM.map((w) => ({ kode: w.code, nama: w.name })));
  }
  if (brM.length > 0) {
    push("cabang_terkait", brM.map((b) => ({ kode: b.code, nama: b.name, kota: b.city })));
  }
  if (igM.length > 0) {
    const counts = await db
      .select({
        itemGroupId: schema.items.itemGroupId,
        cnt: sql<number>`COUNT(*)`,
      })
      .from(schema.items)
      .where(inArray(schema.items.itemGroupId, igM.map((c) => c.id)))
      .groupBy(schema.items.itemGroupId);
    push("grup_item_terkait", igM.map((c) => ({
      kode: c.code,
      nama: c.name,
      jumlahBarang: Number(counts.find((x) => x.itemGroupId === c.id)?.cnt ?? 0),
    })));
  }

  // ---- stok untuk item/gudang/cabang yang cocok ----
  const scopeWh = scope.warehouseIds;
  const hasWh = scopeWh.length > 0;
  const whOfBranches = brM.length > 0
    ? await db
        .select()
        .from(schema.warehouses)
        .where(or(...brM.map((b) => eq(schema.warehouses.branchId, b.id))))
        .limit(30)
    : [];
  const targetWhIds = Array.from(new Set([...whM.map((w) => w.id), ...whOfBranches.map((w) => w.id)]));
  const itemIds = itemsM.map((i) => i.id);

  type StockRow = typeof schema.stockBalances.$inferSelect;
  let stockRows: StockRow[] = [];
  if (itemIds.length > 0 || targetWhIds.length > 0) {
    const conds: SQL[] = [];
    if (itemIds.length > 0) conds.push(inArray(schema.stockBalances.itemId, itemIds));
    if (targetWhIds.length > 0) conds.push(inArray(schema.stockBalances.warehouseId, targetWhIds));
    else if (hasWh) conds.push(inArray(schema.stockBalances.warehouseId, scopeWh));
    stockRows = await db
      .select()
      .from(schema.stockBalances)
      .where(conds.length === 1 ? conds[0] : and(...conds))
      .limit(60);
  }

  if (stockRows.length > 0) {
    const itemNameById = new Map(itemsM.map((i) => [i.id, i.name]));
    const whNameById = new Map([...whM, ...whOfBranches].map((w) => [w.id, w.name]));
    const missingItems = stockRows.map((r) => r.itemId).filter((id) => !itemNameById.has(id));
    const missingWhs = stockRows.map((r) => r.warehouseId).filter((id) => !whNameById.has(id));
    const [extraItems, extraWhs] = await Promise.all([
      missingItems.length > 0
        ? db.select().from(schema.items).where(inArray(schema.items.id, missingItems))
        : Promise.resolve([] as typeof schema.items.$inferSelect[]),
      missingWhs.length > 0
        ? db.select().from(schema.warehouses).where(inArray(schema.warehouses.id, missingWhs))
        : Promise.resolve([] as typeof schema.warehouses.$inferSelect[]),
    ]);
    for (const i of extraItems) itemNameById.set(i.id, i.name);
    for (const w of extraWhs) whNameById.set(w.id, w.name);
    push("stok_terkait", stockRows.map((r) => ({
      barang: itemNameById.get(r.itemId) ?? r.itemId,
      gudang: whNameById.get(r.warehouseId) ?? r.warehouseId,
      saldoAwal: r.openingQty,
      masuk: r.inQty,
      keluar: r.outQty,
      saldoAkhir: r.closingQty,
    })));
  }

  // ---- proyek yang cocok: scan & progres terbaru ----
  if (projM.length > 0) {
    let matched = projM;
    if (!scope.isAdmin) {
      const scopeWhIds = Array.from(new Set([...scope.warehouseIds]));
      const brWhIds = scope.branchIds.length > 0
        ? (await db.select({ id: schema.warehouses.id }).from(schema.warehouses).where(inArray(schema.warehouses.branchId, scope.branchIds))).map((w) => w.id)
        : [];
      const allScopeWh = [...new Set([...scopeWhIds, ...brWhIds])];
      if (allScopeWh.length === 0) {
        matched = [];
      } else {
        const scoped = await db
          .selectDistinct({ opnameId: schema.opnameWarehouses.opnameId })
          .from(schema.opnameWarehouses)
          .where(inArray(schema.opnameWarehouses.warehouseId, allScopeWh));
        const scopedIds = new Set(scoped.map((r) => r.opnameId));
        matched = projM.filter((p) => scopedIds.has(p.id));
      }
    }
    if (matched.length > 0) {
      const pIds = matched.map((p) => p.id);
      const [opWhs, scans, details, stats] = await Promise.all([
        db
          .select({
            opnameId: schema.opnameWarehouses.opnameId,
            warehouseId: schema.opnameWarehouses.warehouseId,
          })
          .from(schema.opnameWarehouses)
          .where(inArray(schema.opnameWarehouses.opnameId, pIds)),
        db
          .select({
            id: schema.opnameScans.id,
            opnameId: schema.opnameScans.opnameId,
          })
          .from(schema.opnameScans)
          .where(inArray(schema.opnameScans.opnameId, pIds))
          .limit(200),
        db
          .select({
            opnameId: schema.opnameScanDetails.opnameId,
            itemId: schema.opnameScanDetails.itemId,
            quantity: schema.opnameScanDetails.quantity,
            scannedAt: schema.opnameScanDetails.scannedAt,
          })
          .from(schema.opnameScanDetails)
          .where(inArray(schema.opnameScanDetails.opnameId, pIds))
          .limit(15),
        progressStats(pIds),
      ]);
      const whIdsOfMatched = [...new Set(opWhs.map((r) => r.warehouseId))];
      const expCounts = whIdsOfMatched.length > 0
        ? await db
            .select({
              warehouseId: schema.stockBalances.warehouseId,
              cnt: sql<number>`COUNT(DISTINCT ${schema.stockBalances.itemId})`,
            })
            .from(schema.stockBalances)
            .where(inArray(schema.stockBalances.warehouseId, whIdsOfMatched))
            .groupBy(schema.stockBalances.warehouseId)
        : [];
      const itemName = new Map(itemsM.map((i) => [i.id, i.name]));
      push("proyek_terkait", matched.map((p) => ({
        nama: p.name,
        status: p.status,
        mode: p.mode,
        jumlahSesiScan: scans.filter((x) => x.opnameId === p.id).length,
      })));
      const projectWhIds = new Map<string, string[]>();
      for (const r of opWhs) {
        const list = projectWhIds.get(r.opnameId) ?? [];
        if (!list.includes(r.warehouseId)) list.push(r.warehouseId);
        projectWhIds.set(r.opnameId, list);
      }
      const whItemCount = new Map(expCounts.map((r) => [r.warehouseId, Number(r.cnt)]));
      push("progres_proyek_terkait", toProgressRows(
        matched.map((p) => ({ id: p.id, name: p.name, status: p.status, mode: p.mode })),
        projectWhIds,
        whItemCount,
        stats.scanned,
        stats.sessions,
        stats.entries
      ));
      if (details.length > 0) {
        push("scan_proyek_terkait", details.map((r) => ({
          proyek: matched.find((p) => p.id === r.opnameId)?.name ?? r.opnameId,
          barang: itemName.get(r.itemId ?? "") ?? r.itemId,
          qty: r.quantity,
        })));
      }
    }
  }

  return sections.join("\n\n");
}