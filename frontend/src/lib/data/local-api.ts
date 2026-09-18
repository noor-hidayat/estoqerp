// Local API router — pengganti Backend API selama fase frontend-first (issue #3).
//
// `api.get/post/patch/put/del` di `lib/api/client.ts` dialihkan ke sini saat
// `VITE_DATA_MODE=local` (default). Seluruh hooks di `lib/api/query.ts` TETAP
// dipakai tanpa perubahan — mereka tidak tahu data berasal dari LocalStorage
// atau backend (repository pattern §10: LocalStoragePurchaseOrderRepository
// hari ini, ApiPurchaseOrderRepository di masa depan).
//
// Konsep: Page -> hooks (query.ts) -> api (client.ts) -> handleLocalRequest
//          -> Repository (repositories.ts) -> StorageAdapter -> localStorage

import { repo, applyTransition, computeInventory } from "./repositories";
import { readCollection } from "./storage";
import { ensureSeed } from "./seed";
import { nextDocumentNo } from "./document-number";

export class LocalApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Row = Record<string, unknown> & { id: string };

/** "purchase-orders" -> "purchaseOrders", "items" -> "items". */
function toCollection(segment: string): string {
  if (segment.includes("-")) {
    const [head, ...rest] = segment.split("-");
    return head + rest.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
  }
  return segment;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function eq(a: unknown, b: string): boolean {
  if (a == null) return false;
  return String(a) === b;
}

const PAGINATION_KEYS = new Set(["page", "pageSize", "cursor", "limit", "sort", "dir", "query", "q", "search"]);

function applyFilters(rows: Row[], params: Record<string, string>): Row[] {
  let out = rows;
  const q = params.query ?? params.q ?? params.search;
  if (q) {
    const needle = q.toLowerCase();
    out = out.filter((r) =>
      ["code", "name", "documentNo", "supplierName", "customerName", "barcode", "batchNumber"].some((k) =>
        String(r[k] ?? "").toLowerCase().includes(needle)
      )
    );
  }
  for (const [k, v] of Object.entries(params)) {
    if (PAGINATION_KEYS.has(k) || v === undefined) continue;
    if (k === "from" || k === "to") continue; // rentang tanggal — diabaikan di mode lokal
    if (k === "typeId" && "typeId" in (rows[0] ?? {})) {
      out = out.filter((r) => eq(r.typeId, v));
      continue;
    }
    if (!(k in (rows[0] ?? {}))) continue; // param tak dikenal untuk koleksi ini — abaikan
    if (v === "null") {
      out = out.filter((r) => r[k] == null);
    } else {
      out = out.filter((r) => eq(r[k], v));
    }
  }
  return out;
}

function paginate(rows: Row[], params: Record<string, string>) {
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(params.pageSize ?? "20", 10) || 20));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), total, page, pageSize, totalPages };
}

function cursorPage(rows: Row[], params: Record<string, string>) {
  const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? "20", 10) || 20));
  const cursor = params.cursor;
  let start = 0;
  if (cursor) {
    const idx = rows.findIndex((r) => r.id === cursor);
    start = idx === -1 ? 0 : idx + 1;
  }
  const slice = rows.slice(start, start + limit);
  const hasNext = start + limit < rows.length;
  return { rows: slice, hasNext, nextCursor: hasNext ? String(slice[slice.length - 1]?.id ?? null) : null, limit };
}

function byIdOrDoc(rows: Row[], idOrNo: string): Row | undefined {
  const decoded = safeDecode(idOrNo);
  return (
    rows.find((r) => r.id === idOrNo || r.id === decoded) ??
    rows.find((r) => (r.documentNo as string) === idOrNo || (r.documentNo as string) === decoded)
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---- enrichment (nama/kode relasi agar UI tidak kosong) ----

function lookupMap<T extends { id: string }>(collection: string): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of readCollection<T>(collection)) m.set(r.id, r);
  return m;
}

function enrichTransactionList(rows: Row[]): Row[] {
  const types = lookupMap<{ id: string; code: string; name: string }>("movementTypes");
  return rows.map((m) => {
    const t = types.get(String(m.typeId ?? ""));
    const details = (m.details as Row[] | undefined) ?? [];
    return {
      ...m,
      typeCode: t?.code ?? String(m.typeId ?? ""),
      typeName: t?.name ?? String(m.typeId ?? ""),
      detailCount: details.length,
      totalQty: details.reduce((s, d) => s + num(d.qty), 0),
    };
  });
}

function enrichTransactionOne(m: Row): Row {
  const items = lookupMap<{ id: string; code: string; name: string; uomId?: string }>("items");
  const whs = lookupMap<{ id: string; code: string; name: string }>("warehouses");
  const uoms = lookupMap<{ id: string; code: string; name: string }>("uom");
  const types = lookupMap<{ id: string; code: string; name: string }>("movementTypes");
  const t = types.get(String(m.typeId ?? ""));
  const details: Row[] = ((m.details as Row[] | undefined) ?? []).map((d) => {
    const it = items.get(String(d.itemId ?? ""));
    const fw = whs.get(String(d.fromWarehouseId ?? ""));
    const tw = whs.get(String(d.toWarehouseId ?? ""));
    const u = uoms.get(String(d.uomId ?? it?.uomId ?? ""));
    return {
      ...d,
      itemCode: it?.code ?? "",
      itemName: it?.name ?? "",
      unit: u?.code ?? "",
      uomCode: u?.code ?? "",
      uomName: u?.name ?? "",
      fromWarehouseCode: fw?.code ?? "",
      fromWarehouseName: fw?.name ?? "",
      toWarehouseCode: tw?.code ?? "",
      toWarehouseName: tw?.name ?? "",
    };
  });
  return {
    ...m,
    typeCode: t?.code ?? "",
    typeName: t?.name ?? "",
    detailCount: details.length,
    totalQty: details.reduce((s, d) => s + num(d.qty), 0),
    details,
  };
}

function enrichBalanceRows(params: Record<string, string>) {
  const items = lookupMap<{ id: string; code: string; name: string; itemGroupId: string }>("items");
  const groups = lookupMap<{ id: string; name: string }>("itemGroups");
  const whs = lookupMap<{ id: string; code: string; name: string }>("warehouses");
  const balances = computeInventory({ warehouseId: params.warehouseId, itemId: params.itemId });
  return balances.map((b, i) => {
    const it = items.get(b.itemId);
    return {
      id: `${b.warehouseId}::${b.itemId}`,
      warehouseId: b.warehouseId,
      itemId: b.itemId,
      code: it?.code ?? "",
      name: it?.name ?? "",
      itemGroup: it ? (groups.get(it.itemGroupId)?.name ?? null) : null,
      warehouse: whs.get(b.warehouseId)?.name ?? "",
      balanceDate: b.balanceDate,
      openingQty: b.openingQty,
      inQty: b.inQty,
      outQty: b.outQty,
      closingQty: b.closingQty,
      _order: i,
    };
  });
}

// ---- main router ----

export async function handleLocalRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  ensureSeed();

  const [rawPath, rawQuery] = path.split("?");
  const segs = rawPath.split("/").filter(Boolean).map(safeDecode);
  const params: Record<string, string> = {};
  if (rawQuery) {
    for (const [k, v] of new URLSearchParams(rawQuery).entries()) params[k] = v;
  }

  const M = method.toUpperCase();
  const first = segs[0] ?? "";
  const b = ((body ?? {}) as Record<string, unknown>);

  // ---- auth (dev user, tanpa login) ----
  if (first === "auth") {
    const devUser = {
      id: "dev-user", name: "Developer", email: "dev@estoq.local",
      role: "role_sys_admin", active: true, avatarHue: 210,
    };
    if (segs[1] === "me" && M === "GET") {
      return { ...devUser, isSystem: true, permissions: [], access: { branchIds: [], warehouseIds: [], workspaceIds: [] } } as T;
    }
    if (segs[1] === "me" && (M === "PUT" || M === "PATCH")) {
      const users = repo<Row>("users");
      const updated = users.update("dev-user", (body ?? {}) as Partial<Row>) ?? users.get("dev-user");
      return { user: updated } as T;
    }
    if (segs[1] === "login" || segs[1] === "refresh") {
      return { accessToken: "dev-access", refreshToken: "dev-refresh", user: devUser } as T;
    }
    if (segs[1] === "logout") return undefined as T;
    throw new LocalApiError("Auth endpoint tidak dikenal di mode lokal", 404);
  }

  // ---- company-settings: single object ----
  if (first === "company-settings") {
    const rows = readCollection<Row>("companySettings");
    if (M === "GET") {
      if (rows.length === 0) throw new LocalApiError("Company settings belum di-seed", 404);
      return rows[0] as T;
    }
    const r = repo<Row>("companySettings");
    const existing = readCollection<Row>("companySettings")[0];
    if (existing) return r.update(existing.id, (body ?? {}) as Partial<Row>) as T;
    return r.create((body ?? {}) as Omit<Row, "id">) as T;
  }

  // ---- exchange-rate: dummy 1:1 ----
  if (first === "exchange-rate") {
    return { from: params.from ?? "IDR", to: params.to ?? "IDR", rate: 1, source: "local", timestamp: new Date().toISOString() } as T;
  }

  // ---- dashboards: empty meta ----
  if (first === "dashboards") {
    if (segs[1] === "meta") return { widgets: [], layouts: {} } as T;
    if (segs[1] === "widgets") {
      if (segs[2] === "query") return { rows: [], percentChange: null, periodLabel: null, previousValue: null } as T;
      if (segs[2] === "query-batch") return { results: [] } as T;
    }
    throw new LocalApiError("Dashboard belum tersedia di mode lokal", 404);
  }

  // ---- misc read-only kecil ----
  if (first === "activity-logs" || first === "activityLogs") return [] as T;
  // ---- bulk import (Settings > Import Data): simpan baris ke koleksi ----
  if (first === "import" && segs.length === 2 && M === "POST") {
    const datasetToCollection: Record<string, string> = {
      branches: "branches",
      warehouses: "warehouses",
      locations: "locations",
      itemGroups: "itemGroups",
      items: "items",
      stockBalances: "stockBalances",
    };
    const target = datasetToCollection[segs[1]] ?? segs[1];
    const r = repo<Row>(target);
    const rows = ((b.rows as Row[] | undefined) ?? []);
    const mode = String(b.mode ?? "skip");
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      const code = (row.code as string | undefined) ?? (row.barcode as string | undefined);
      if (mode === "skip" && code) {
        const exists = readCollection<Row>(target).some((x) => x.code === code);
        if (exists) {
          skipped += 1;
          continue;
        }
      }
      r.create(row as Omit<Row, "id">);
      imported += 1;
    }
    return { imported, skipped, errors: [] } as T;
  }
  if (first === "item-groups" && segs[1] === "counts") {
    const items = readCollection<{ itemGroupId: string }>("items");
    const counts: Record<string, number> = {};
    for (const it of items) counts[it.itemGroupId] = (counts[it.itemGroupId] ?? 0) + 1;
    return { counts } as T;
  }
  if (first === "items" && segs[1] === "lookup") {
    const items = readCollection<Row>("items");
    const found = items.find((i) => eq(i.code, params.barcode ?? "") || eq(i.alternativeCode, params.barcode ?? ""));
    if (!found) return { found: false } as T;
    const groups = lookupMap<{ id: string; code: string; name: string }>("itemGroups");
    const g = groups.get(String(found.itemGroupId ?? ""));
    return { found: true, matched: true, item: found, itemGroup: g ? { id: g.id, code: g.code, name: g.name } : null } as T;
  }
  if (first === "opname-scan-details" && segs[1] === "check") {
    return { exists: false } as T;
  }
  if (first === "purchase-orders" && segs[1] === "last-price") {
    const pos = readCollection<{ lines?: { itemId: string; unitPrice?: unknown }[] }>("purchaseOrders");
    const wanted = new Set<string>();
    if (params.itemId) wanted.add(params.itemId);
    if (params.itemIds) for (const s of params.itemIds.split(",")) wanted.add(s.trim());
    const out: Record<string, string | null> = {};
    for (const id of wanted) out[id] = null;
    for (const po of [...pos].reverse()) {
      for (const l of po.lines ?? []) {
        if (wanted.has(String(l.itemId)) && out[String(l.itemId)] == null && l.unitPrice != null) {
          out[String(l.itemId)] = String(l.unitPrice);
        }
      }
    }
    if (params.itemId && !params.itemIds) return { itemId: params.itemId, unitPrice: out[params.itemId] } as T;
    return out as T;
  }

  // ---- stock balance ledger & summary (dihitung dari transaksi) ----
  if (first === "stock-balances") {
    if (segs[1] === "ledger" || segs[1] === undefined) {
      const rows = enrichBalanceRows(params);
      if (params.page || params.pageSize) return paginate(rows, params) as T;
      return rows as T;
    }
    if (segs[1] === "summary") {
      const rows = enrichBalanceRows(params);
      return {
        totalItems: new Set(rows.map((r) => String(r.itemId))).size,
        totalQty: rows.reduce((s, r) => s + num(r.closingQty), 0),
        totalRows: rows.length,
      } as T;
    }
  }
  if (first === "stockBalances") {
    const rows = enrichBalanceRows(params);
    if (params.page || params.pageSize) return paginate(rows, params) as T;
    return rows as T;
  }
  if (first === "stock-ledger") {
    const rows = buildStockLedger(params);
    if (params.page || params.pageSize) return paginate(rows, params) as T;
    return rows as T;
  }
  if (first === "transactions" && segs[1] === "scan-history") {
    const rows = buildScanHistory();
    if (params.page || params.pageSize) return paginate(rows, params) as T;
    return rows as T;
  }

  // ---- opname project detail/stats/scans ----
  if (first === "opname-projects" && segs.length === 3 && segs[2] === "detail") {
    return buildOpnameDetail(segs[1]) as T;
  }
  if (first === "opname-projects" && segs.length === 3 && segs[2] === "stats") {
    return buildOpnameStats(segs[1]) as T;
  }
  if (first === "opname-projects" && segs.length === 3 && segs[2] === "scans") {
    const scans = readCollection<Row>("opnameScans").filter((s) => eq(s.opnameId, segs[1]));
    return { scans, totalBarcodes: 0, totalQty: 0, itemCount: 0 } as T;
  }

  // ---- document-types/:id -> with series ----
  if (first === "document-types" && segs.length === 2 && M === "GET") {
    const dt = byIdOrDoc(readCollection<Row>("documentTypes"), segs[1]);
    if (!dt) throw new LocalApiError("Document type tidak ditemukan", 404);
    const series = readCollection<Row>("documentSeries").filter((s) => eq(s.documentTypeId, dt.id));
    return { ...dt, series } as T;
  }
  if (first === "workflows" && segs.length === 2 && M === "GET") {
    const wf = byIdOrDoc(readCollection<Row>("workflows"), segs[1]);
    if (!wf) throw new LocalApiError("Workflow tidak ditemukan", 404);
    return {
      ...wf,
      states: readCollection<Row>("workflowStates").filter((s) => eq(s.workflowId, wf.id)),
      transitions: readCollection<Row>("workflowTransitions").filter((s) => eq(s.workflowId, wf.id)),
    } as T;
  }
  if (first === "user-signatures") {
    const r = repo<Row>("userSignatures");
    if (M === "GET") return (readCollection<Row>("userSignatures")[0] ?? null) as T;
    if (M === "PUT" || M === "POST") {
      const existing = readCollection<Row>("userSignatures")[0];
      const payload = { userId: "dev-user", signatureData: (body as Record<string, unknown>)?.signatureData ?? null, updatedAt: new Date().toISOString() };
      if (existing) return r.update(existing.id, payload) as T;
      return r.create(payload as Omit<Row, "id">) as T;
    }
    if (M === "DELETE") {
      const existing = readCollection<Row>("userSignatures")[0];
      if (existing) r.remove(existing.id);
      return undefined as T;
    }
  }

  // ---- custom actions & sub-resources untuk dokumen ----
  const actionResult = handleDocAction(first, segs, M, params, body);
  if (actionResult !== undefined) return actionResult as T;

  // ---- generic CRUD: /table, /table/:id, /table/:id/<action> ----
  const collection = toCollection(first);
  const r = repo<Row>(collection);

  // POST /table/:id/<action> generik (post/approve/reject/cancel/submit/...)
  if (segs.length === 3 && (M === "POST" || M === "PATCH")) {
    const target = byIdOrDoc(readCollection<Row>(collection), segs[1]);
    if (!target) throw new LocalApiError("Data tidak ditemukan", 404);
    const updated = applyTransition(collection, target.id, segs[2], (body ?? {}) as Record<string, unknown>);
    if (!updated) throw new LocalApiError(`Aksi '${segs[2]}' tidak dikenal`, 400);
    return updated as T;
  }

  if (segs.length === 1) {
    if (M === "GET") {
      let rows = applyFilters(readCollection<Row>(collection), params);
      rows = orderRows(collection, rows, params);
      if (collection === "transactions" || collection === "transactionsCursor") rows = enrichTransactionList(rows);
      if (collection === "opnameProjects") rows = rows.map(enrichOpnameListItem);
      if (params.cursor || params.limit) {
        if (collection === "transactions") return cursorPage(rows, params) as T;
      }
      if (params.page || params.pageSize) return paginate(rows, params) as T;
      return rows as T;
    }
    if (M === "POST") {
      guardGoodsReceipt(collection, (body ?? {}) as Record<string, unknown>);
      const created = r.create(((body ?? {}) as Record<string, unknown>) as Omit<Row, "id">);
      if (collection === "transactions") return enrichTransactionOne(created) as T;
      if (collection === "purchaseOrders") return attachReceipts(created) as T;
      return created as T;
    }
  }

  if (segs.length === 2) {
    const row = byIdOrDoc(readCollection<Row>(collection), segs[1]);
    if (!row) throw new LocalApiError("Data tidak ditemukan", 404);
    if (M === "GET") {
      if (collection === "transactions") return enrichTransactionOne(row) as T;
      if (collection === "purchaseOrders") return attachReceipts(row) as T;
      if (collection === "rfqs") return attachRfq(row) as T;
      return row as T;
    }
    if (M === "PATCH" || M === "PUT") {
      const updated = r.update(row.id, (body ?? {}) as Partial<Row>);
      if (!updated) throw new LocalApiError("Data tidak ditemukan", 404);
      return updated as T;
    }
    if (M === "DELETE") {
      r.remove(row.id);
      return undefined as T;
    }
  }

  throw new LocalApiError(`Endpoint '${path}' belum didukung mode lokal`, 404);
}

// Guard: GNR hanya boleh dibuat setelah QC selesai (receiving COMPLETED),
// bukan saat masih PENDING_QC — sesuai flow Receiving → QC → GNR.
function guardGoodsReceipt(collection: string, body: Record<string, unknown>): void {
  if (collection !== "goodsReceipts") return;
  const receivingId = body.receivingId != null ? String(body.receivingId) : null;
  if (!receivingId) return;
  const rcv = readCollection<Row>("receivings").find((x) => x.id === receivingId);
  if (rcv && String(rcv.status).toUpperCase() === "PENDING_QC") {
    throw new LocalApiError("QC belum selesai — GNR hanya bisa dibuat setelah QC COMPLETED.", 422);
  }
}

function orderRows(collection: string, rows: Row[], params: Record<string, string>): Row[] {
  void collection;
  const { sort, dir } = params;
  if (!sort) {
    // default: terbaru dulu bila ada createdAt
    return [...rows].sort((a, b) => String(b.createdAt ?? b.id).localeCompare(String(a.createdAt ?? a.id)));
  }
  const d = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => String(a[sort] ?? "").localeCompare(String(b[sort] ?? "")) * d);
}

function attachReceipts(po: Row): Row {
  const receipts = readCollection<Row>("goodsReceipts").filter((g) => eq(g.purchaseOrderId, po.id));
  return { ...po, receipts };
}

function attachRfq(rfq: Row): Row {
  const quotations = readCollection<Row>("supplierQuotations").filter((q) => eq(q.rfqId, rfq.id));
  return { ...rfq, quotations };
}

function enrichOpnameListItem(p: Row): Row {
  const warehouses = readCollection<Row>("opnameWarehouses").filter((w) => eq(w.opnameId, p.id));
  const total = warehouses.length;
  const counted = warehouses.filter((w) => String(w.status).toUpperCase() === "COMPLETED").length;
  return {
    ...p,
    jumlahGudang: total,
    progress: { counted, total, pct: total === 0 ? 0 : Math.round((counted / total) * 100) },
    warehouses: warehouses.map((w) => ({ ...w })),
  };
}

function buildOpnameDetail(id: string): Row {
  const p = byIdOrDoc(readCollection<Row>("opnameProjects"), id);
  if (!p) throw new LocalApiError("Project tidak ditemukan", 404);
  const warehouses = readCollection<Row>("opnameWarehouses").filter((w) => eq(w.opnameId, p.id));
  const counted = warehouses.filter((w) => String(w.status).toUpperCase() === "COMPLETED").length;
  return {
    parent: p,
    warehouses,
    summary: {
      jumlahGudang: warehouses.length,
      totalLokasi: 0,
      countedLokasi: 0,
      pct: warehouses.length === 0 ? 0 : Math.round((counted / warehouses.length) * 100),
      status: p.status,
    },
  } as unknown as Row;
}

function buildOpnameStats(id: string): Row {
  const details = readCollection<Row>("opnameScanDetails").filter((d) => eq(d.opnameId, id));
  const byItem = new Map<string, { qty: number; warehouseId: string }>();
  for (const d of details) {
    const k = String(d.itemId);
    const cur = byItem.get(k) ?? { qty: 0, warehouseId: String(d.warehouseId ?? "") };
    cur.qty += num(d.quantity);
    byItem.set(k, cur);
  }
  const items = lookupMap<{ id: string; code: string; name: string }>("items");
  const whs = lookupMap<{ id: string; name: string }>("warehouses");
  const balances = computeInventory();
  const balMap = new Map(balances.map((b) => [`${b.warehouseId}::${b.itemId}`, b.closingQty]));
  const variance = [...byItem.entries()].map(([itemId, c]) => {
    const it = items.get(itemId);
    const systemQty = balMap.get(`${c.warehouseId}::${itemId}`) ?? 0;
    return {
      itemId, itemCode: it?.code ?? "", itemName: it?.name ?? "", unit: "",
      warehouseId: c.warehouseId, warehouseName: whs.get(c.warehouseId)?.name ?? "",
      systemQty, countedQty: c.qty, diff: c.qty - systemQty,
    };
  });
  return { projectId: id, progress: { total: 0, counted: details.length, pct: 0 }, progressByWh: {}, variance } as unknown as Row;
}

function buildStockLedger(params: Record<string, string>): Row[] {
  const items = lookupMap<{ id: string; code: string; name: string; valuationRate: unknown }>("items");
  const whs = lookupMap<{ id: string; code: string; name: string }>("warehouses");
  type Entry = { date: string; itemId: string; warehouseId: string; qtyIn: number; qtyOut: number; ref: string; refId: string };
  const entries: Entry[] = [];

  for (const m of readCollection<Row>("transactions")) {
    if (String(m.status).toUpperCase() !== "POSTED") continue;
    for (const d of ((m.details as Row[] | undefined) ?? [])) {
      const q = num((d as Row).qty);
      const fw = (d as Row).fromWarehouseId != null ? String((d as Row).fromWarehouseId) : "";
      const tw = (d as Row).toWarehouseId != null ? String((d as Row).toWarehouseId) : "";
      if (tw) entries.push({ date: String(m.movementDate ?? m.createdAt ?? ""), itemId: String((d as Row).itemId), warehouseId: tw, qtyIn: q, qtyOut: 0, ref: "TRANSACTION", refId: m.id });
      if (fw && fw !== tw) entries.push({ date: String(m.movementDate ?? m.createdAt ?? ""), itemId: String((d as Row).itemId), warehouseId: fw, qtyIn: 0, qtyOut: q, ref: "TRANSACTION", refId: m.id });
      if (!fw && !tw) entries.push({ date: String(m.movementDate ?? m.createdAt ?? ""), itemId: String((d as Row).itemId), warehouseId: "", qtyIn: q, qtyOut: 0, ref: "TRANSACTION", refId: m.id });
    }
  }
  for (const g of readCollection<Row>("goodsReceipts")) {
    if (String(g.status).toUpperCase() !== "POSTED") continue;
    for (const l of ((g.lines as Row[] | undefined) ?? [])) {
      entries.push({ date: String(g.receiptDate ?? g.createdAt ?? ""), itemId: String(l.itemId), warehouseId: String(g.warehouseId ?? ""), qtyIn: num(l.qty), qtyOut: 0, ref: "GRN", refId: g.id });
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date));

  const running = new Map<string, number>();
  const rows: Row[] = entries.map((e, i) => {
    const k = `${e.warehouseId}::${e.itemId}`;
    const bal = (running.get(k) ?? 0) + e.qtyIn - e.qtyOut;
    running.set(k, bal);
    const it = items.get(e.itemId);
    const w = whs.get(e.warehouseId);
    const rate = num(it?.valuationRate);
    return {
      id: `ledger-${i}`, transactionId: e.refId, transactionType: e.ref, transactionDate: e.date,
      itemId: e.itemId, itemCode: it?.code ?? "", itemName: it?.name ?? "", unit: "",
      warehouseId: e.warehouseId, warehouseCode: w?.code ?? "", warehouseName: w?.name ?? "",
      qtyIn: e.qtyIn, qtyOut: e.qtyOut, qtyBalance: bal,
      valuationRate: rate, stockValue: bal * rate,
      referenceType: e.ref, referenceId: e.refId, createdAt: e.date,
    };
  });

  return rows.filter((r) => {
    if (params.warehouseId && !eq(r.warehouseId, params.warehouseId)) return false;
    if (params.itemId && !eq(r.itemId, params.itemId)) return false;
    if (params.from && String(r.transactionDate ?? "") < params.from) return false;
    if (params.to && String(r.transactionDate ?? "") > params.to) return false;
    if (params.query) {
      const needle = params.query.toLowerCase();
      const hay = `${r.itemCode} ${r.itemName} ${r.warehouseName}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function buildScanHistory(): Row[] {
  const items = lookupMap<{ id: string; code: string; name: string }>("items");
  const rows: Row[] = [];
  for (const m of readCollection<Row>("transactions")) {
    for (const d of ((m.details as Row[] | undefined) ?? [])) {
      const it = items.get(String((d as Row).itemId));
      rows.push({
        id: (d as Row).id ?? `${m.id}-${rows.length}`,
        movementId: m.id,
        movementDate: String(m.movementDate ?? m.createdAt ?? ""),
        movementType: String((m as Row).typeId ?? ""),
        movementStatus: String(m.status ?? ""),
        barcode: String((d as Row).barcode ?? it?.code ?? ""),
        batchNumber: (d as Row).batchNumber != null ? String((d as Row).batchNumber) : null,
        itemCode: it?.code ?? "", itemName: it?.name ?? "", unit: "",
        serialNumber: (d as Row).serialNumber != null ? String((d as Row).serialNumber) : null,
        qty: num((d as Row).qty),
        createdAt: String((d as Row).createdAt ?? m.createdAt ?? ""),
      });
    }
  }
  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// ---- document-specific actions (create-po, create-receipt, qc submit, ...) ----

function handleDocAction(
  first: string, segs: string[], method: string, params: Record<string, string>, body: unknown
): unknown | undefined {
  const M = method.toUpperCase();
  const b = ((body ?? {}) as Record<string, unknown>);
  const findDoc = (collection: string, id: string): Row | undefined =>
    byIdOrDoc(readCollection<Row>(collection), id);

  // PR/MR/PO/SO/GRN/Delivery/Receiving/RFQ lifecycle generik
  const lifecycles: Record<string, string> = {
    "purchase-requests": "purchaseRequests",
    "material-requests": "materialRequests",
    "purchase-orders": "purchaseOrders",
    "sales-orders": "salesOrders",
    "goods-receipts": "goodsReceipts",
    "deliveries": "deliveries",
    "receivings": "receivings",
    "rfqs": "rfqs",
    transactions: "transactions",
  };
  const lc = lifecycles[first];
  if (lc && segs.length === 3 && M === "POST") {
    const action = segs[2];
    const id = segs[1];
    if (["post", "approve", "reject", "cancel", "submit", "send", "close", "unpost", "amend"].includes(action)) {
      const target = findDoc(lc, id);
      if (!target) throw new LocalApiError("Dokumen tidak ditemukan", 404);
      if (action === "submit" && lc === "qcInspections") return submitQcInspection(target.id);
      return applyTransition(lc, target.id, action, b) ?? target;
    }
  }

  // PR -> PO
  if (first === "purchase-requests" && segs[2] === "create-po" && M === "POST") {
    const pr = findDoc("purchaseRequests", segs[1]);
    if (!pr) throw new LocalApiError("PR tidak ditemukan", 404);
    const supplierId = (b.supplierId != null ? String(b.supplierId) : (pr.supplierId != null ? String(pr.supplierId) : "")) as string;
    const po = repo<Row>("purchaseOrders").create({
      supplierId,
      warehouseId: String(pr.warehouseId ?? ""),
      orderDate: new Date().toISOString().slice(0, 10),
      status: "DRAFT",
      purchaseRequestId: pr.id,
      lines: ((pr.lines as Row[] | undefined) ?? []).map((l) => ({ itemId: l.itemId, uomId: l.uomId, qty: String(l.qty ?? 0), unitPrice: l.unitPrice ?? null, note: l.note ?? null })),
    } as Omit<Row, "id">);
    return { id: po.id, documentNo: po.documentNo };
  }

  // PO -> Receiving
  if (first === "purchase-orders" && segs[2] === "create-receipt" && M === "POST") {
    const po = findDoc("purchaseOrders", segs[1]);
    if (!po) throw new LocalApiError("PO tidak ditemukan", 404);
    const rcv = repo<Row>("receivings").create({
      purchaseOrderId: po.id,
      warehouseId: String(po.warehouseId ?? ""),
      receiptDate: (b.receiptDate != null ? String(b.receiptDate) : new Date().toISOString().slice(0, 10)) as string,
      status: "DRAFT",
      lines: ((po.lines as Row[] | undefined) ?? []).map((l) => ({ itemId: l.itemId, uomId: l.uomId, qty: String(l.qty ?? 0), unitPrice: l.unitPrice ?? null })),
    } as Omit<Row, "id">);
    return { id: rcv.id, documentNo: rcv.documentNo };
  }

  // SO -> Delivery
  if (first === "sales-orders" && segs[2] === "create-delivery" && M === "POST") {
    const so = findDoc("salesOrders", segs[1]);
    if (!so) throw new LocalApiError("SO tidak ditemukan", 404);
    const dlv = repo<Row>("deliveries").create({
      salesOrderId: so.id,
      customerId: so.customerId ?? null,
      warehouseId: String(so.warehouseId ?? ""),
      deliveryDate: (b.deliveryDate != null ? String(b.deliveryDate) : new Date().toISOString().slice(0, 10)) as string,
      status: "DRAFT",
      lines: ((so.lines as Row[] | undefined) ?? []).map((l) => ({ itemId: l.itemId, uomId: l.uomId, qty: String(l.qty ?? 0), unitPrice: l.unitPrice ?? null })),
    } as Omit<Row, "id">);
    return { id: dlv.id, documentNo: dlv.documentNo };
  }

  // Receiving -> QC (legacy endpoint)
  if (first === "receivings" && segs[2] === "qc" && M === "POST") {
    const rcv = findDoc("receivings", segs[1]);
    if (!rcv) throw new LocalApiError("Receiving tidak ditemukan", 404);
    const lines = ((rcv.lines as Row[] | undefined) ?? []).map((l) => {
      const upd = ((b.lines as Row[] | undefined) ?? []).find((x) => String(x.id) === String(l.id));
      return { ...l, qtyRejected: upd ? String(upd.qtyRejected ?? 0) : l.qtyRejected ?? "0", qtyAccepted: upd ? String(num(l.qty) - num(upd.qtyRejected)) : (l.qtyAccepted ?? l.qty) };
    });
    return repo<Row>("receivings").update(rcv.id, {
      lines, qcNotes: (b.qcNotes as string | null) ?? rcv.qcNotes ?? null,
      status: "COMPLETED", qcInspectedAt: new Date().toISOString(),
    } as Partial<Row>);
  }

  // RFQ sub-resources
  if (first === "rfqs" && segs.length === 3 && segs[2] === "quotations" && M === "POST") {
    const rfq = findDoc("rfqs", segs[1]);
    if (!rfq) throw new LocalApiError("RFQ tidak ditemukan", 404);
    const q = repo<Row>("supplierQuotations").create({ rfqId: rfq.id, status: "DRAFT", ...(b as Record<string, unknown>) } as Omit<Row, "id">);
    repo<Row>("rfqs").update(rfq.id, { status: "QUOTED" } as Partial<Row>);
    return q;
  }
  if (first === "rfqs" && segs.length === 3 && segs[2] === "compare" && M === "GET") {
    const rfq = findDoc("rfqs", segs[1]);
    if (!rfq) throw new LocalApiError("RFQ tidak ditemukan", 404);
    return { ...attachRfq(rfq), lines: rfq.lines ?? [] };
  }
  if (first === "rfqs" && segs.length === 3 && segs[2] === "award" && M === "POST") {
    const rfq = findDoc("rfqs", segs[1]);
    if (!rfq) throw new LocalApiError("RFQ tidak ditemukan", 404);
    const suppliers = lookupMap<{ id: string; name: string }>("suppliers");
    const sup = suppliers.get(String(b.supplierId ?? ""));
    return repo<Row>("rfqs").update(rfq.id, {
      status: "AWARDED", awardedSupplierId: String(b.supplierId ?? ""), awardedSupplierName: sup?.name ?? null, awardedAt: new Date().toISOString(),
    } as Partial<Row>);
  }
  if (first === "rfqs" && segs.length === 3 && segs[2] === "create-po" && M === "POST") {
    const rfq = findDoc("rfqs", segs[1]);
    if (!rfq) throw new LocalApiError("RFQ tidak ditemukan", 404);
    const supplierId = (rfq.awardedSupplierId != null ? String(rfq.awardedSupplierId) : "") as string;
    const po = repo<Row>("purchaseOrders").create({
      supplierId, warehouseId: String(rfq.warehouseId ?? ""),
      orderDate: new Date().toISOString().slice(0, 10), status: "DRAFT", rfqId: rfq.id,
      lines: ((rfq.lines as Row[] | undefined) ?? []).map((l) => ({ itemId: l.itemId, uomId: l.uomId, qty: String(l.qty ?? 0) })),
    } as Omit<Row, "id">);
    repo<Row>("rfqs").update(rfq.id, { status: "PO_CREATED" } as Partial<Row>);
    return { id: po.id, documentNo: po.documentNo };
  }
  if (first === "supplier-quotations" && segs.length === 3 && segs[2] === "submit" && M === "POST") {
    const q = findDoc("supplierQuotations", segs[1]);
    if (!q) throw new LocalApiError("Quotation tidak ditemukan", 404);
    return repo<Row>("supplierQuotations").update(q.id, { status: "SUBMITTED" } as Partial<Row>);
  }

  // QC inspections lifecycle + cancel/remove
  if (first === "qc-inspections" && segs.length === 3 && M === "POST") {
    const qc = findDoc("qcInspections", segs[1]);
    if (!qc) throw new LocalApiError("QC tidak ditemukan", 404);
    if (segs[2] === "submit") return submitQcInspection(qc.id);
    if (segs[2] === "cancel") return applyTransition("qcInspections", qc.id, "cancel", b);
  }

  // opname-projects create: siapkan warehouses + documentNo
  if (first === "opname-projects" && segs.length === 1 && M === "POST") {
    const docNo = nextDocumentNo("opnameProjects");
    const project = repo<Row>("opnameProjects").create({
      documentNo: docNo, status: "DRAFT", ...(b as Record<string, unknown>),
    } as Omit<Row, "id">);
    const whRepo = repo<Row>("opnameWarehouses");
    for (const w of ((b.warehouses as Row[] | undefined) ?? [])) {
      whRepo.create({ opnameId: project.id, warehouseId: String(w.warehouseId ?? ""), status: "PENDING" } as Omit<Row, "id">);
    }
    return project;
  }

  void params;
  return undefined;
}

// QC submit -> propagasi receiving_lines.qtyAccepted/Rejected +
// receivings.status=COMPLETED (lihat AGENTS.md flow QC).
function submitQcInspection(qcId: string): Row {
  const qcRepo = repo<Row>("qcInspections");
  const qc = qcRepo.get(qcId);
  if (!qc) throw new LocalApiError("QC tidak ditemukan", 404);
  const updated = qcRepo.update(qcId, { status: "COMPLETED" } as Partial<Row>) ?? qc;

  const receivingId = qc.receivingId != null ? String(qc.receivingId) : "";
  if (receivingId) {
    const rcvRepo = repo<Row>("receivings");
    const rcv = rcvRepo.get(receivingId);
    if (rcv) {
      const qcLines = ((qc.lines as Row[] | undefined) ?? []);
      const rcvLines = ((rcv.lines as Row[] | undefined) ?? []).map((rl) => {
        const match =
          qcLines.find((q) => q.receivingLineId != null && String(q.receivingLineId) === String(rl.id)) ??
          qcLines.find((q) => String(q.itemId) === String(rl.itemId));
        if (!match) return rl;
        const rejected = num(match.qtyRejected);
        return { ...rl, qtyRejected: String(rejected), qtyAccepted: String(num(match.qtyReceived ?? rl.qty) - rejected) };
      });
      rcvRepo.update(receivingId, { lines: rcvLines, status: "COMPLETED", qcInspectedAt: new Date().toISOString() } as Partial<Row>);
    }
  }
  return updated;
}
