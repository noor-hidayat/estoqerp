import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const opnameModes = ["COMPARE", "SCRATCH"] as const;
export type OpnameMode = (typeof opnameModes)[number];

export const projectStatuses = ["DRAFT", "IN_PROGRESS", "APPROVED", "CANCELLED"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const qtyModes = ["AUTO", "MANUAL"] as const;
export const scanSources = ["SCANNER", "CAMERA", "MANUAL"] as const;

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("role_sys_admin"),
  active: boolean("active").notNull().default(true),
  avatarHue: integer("avatar_hue").notNull().default(200),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// --- RBAC: Role custom + permission + akses entitas ---

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    menu: text("menu").notNull(),
    action: text("action").notNull(),
  },
  (t) => [uniqueIndex("uq_role_permissions").on(t.roleId, t.menu, t.action)]
);

export const entityTypes = ["BRANCH", "WAREHOUSE"] as const;

// Akses entitas (branch/warehouse) — murni per ROLE, diatur di Role Management.
export const branchAccesses = pgTable(
  "branch_access",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: entityTypes }).notNull(),
    entityId: text("entity_id").notNull(),
  },
  (t) => [
    uniqueIndex("uq_branch_access").on(t.roleId, t.entityType, t.entityId),
    index("idx_branch_access_role").on(t.roleId),
  ]
);

// --- Workspace: 4 fixed workspace untuk mengelompokkan menu ---
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon").notNull().default("Layers"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Akses workspace per ROLE — siapa boleh lihat workspace tersebut.
export const workspaceAccesses = pgTable(
  "workspace_access",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("uq_workspace_access").on(t.roleId, t.workspaceId),
    index("idx_workspace_access_role").on(t.roleId),
    index("idx_workspace_access_ws").on(t.workspaceId),
  ]
);

// Preferensi UI per-user (misal lebar kolom tabel), disimpan di sistem.
export const userSettings = pgTable(
  "user_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => [
    uniqueIndex("uq_user_settings_user_key").on(t.userId, t.key),
    index("idx_user_settings_user").on(t.userId),
  ]
);

// Dashboard customizable (multi-dashboard, diatur admin/global).
// Tiap widget disimpan di tabel terpisah `dashboard_widgets`.
export const dashboards = pgTable("dashboards", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").references(() => users.id),
  branchId: text("branch_id").references(() => branches.id),
  workspaceId: text("workspace_id").references(() => workspaces.id),
  isGlobal: boolean("is_global").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: text("id").primaryKey(),
  dashboardId: text("dashboard_id")
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // bar | line | pie | table | kpi
  config: jsonb("config").notNull().default({}),
  layout: jsonb("layout").notNull().default({}), // { x, y, w, h }
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Konfigurasi AI assistant — per workspace (workspace_id null = global fallback).
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    defaultProvider: text("default_provider", { enum: ["GOOGLE", "DEEPSEEK"] })
      .notNull()
      .default("GOOGLE"),
    googleApiKey: text("google_api_key"),
    googleModel: text("google_model").notNull().default("gemini-3.5-flash"),
    deepseekApiKey: text("deepseek_api_key"),
    deepseekModel: text("deepseek_model").notNull().default("deepseek-chat"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("uq_ai_settings_workspace").on(t.workspaceId)]
);

export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const warehouses = pgTable("warehouses", {
  id: text("id").primaryKey(),
  branchId: text("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const itemGroups = pgTable("item_groups", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const uom = pgTable("uom", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockBalances = pgTable(
  "stock_balances",
  {
    id: text("id").primaryKey(),
    balanceDate: date("balance_date").notNull().default(sql`CURRENT_DATE`),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    openingQty: integer("opening_qty").notNull().default(0),
    inQty: integer("in_qty").notNull().default(0),
    outQty: integer("out_qty").notNull().default(0),
    closingQty: integer("closing_qty").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_stock_balances_wh_item").on(t.warehouseId, t.itemId),
    index("idx_stock_balances_item").on(t.itemId),
  ]
);

export const items = pgTable("items", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  itemGroupId: text("item_group_id")
    .notNull()
    .references(() => itemGroups.id),
  hue: integer("hue").notNull().default(200),
  uomId: text("uom_id").references(() => uom.id),
  alternativeCode: text("alternative_code"),
  uomQty: numeric("uom_qty", { precision: 15, scale: 3 }),
  description: text("description"),
  standardCost: numeric("standard_cost", { precision: 15, scale: 2 }),
  valuationRate: numeric("valuation_rate", { precision: 15, scale: 2 })
    .notNull()
    .default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const barcodeFormats = pgTable("barcode_formats", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  qtyPerFormat: boolean("qty_per_format").notNull().default(true),
  uniqueBarcode: boolean("unique_barcode").notNull().default(false),
  segments: jsonb("segments").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Format batch number: definisi bagaimana nomor batch dipecah menjadi
// tanggal produksi, shift, dsb. Dipakai oleh format barcode (segmen BATCH
// wajib menunjuk format batch) maupun input manual batch di transaksi stok.
export const batchFormats = pgTable("batch_formats", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  segments: jsonb("segments").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const opnameProjects = pgTable("opname_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode", { enum: opnameModes }).notNull().default("COMPARE"),
  status: text("status", { enum: projectStatuses })
    .notNull()
    .default("DRAFT"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deadline: timestamp("deadline", { withTimezone: true }),
  opnameDate: date("opname_date"),
  cutOffDate: date("cut_off_date"),
  cutOffTime: text("cut_off_time"),
  createdBy: text("created_by").references(() => users.id),
  description: text("description"),
});

export const batchStatuses = ["ACTIVE", "EMPTY"] as const;

export const batches = pgTable(
  "batches",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    batchNumber: text("batch_number").notNull(),
    status: text("status", { enum: batchStatuses }).notNull().default("ACTIVE"),
    productionDate: date("production_date"),
    expiryDate: date("expiry_date"),
    shift: text("shift"),
    meta: jsonb("meta").notNull().default({}),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_batches_item_number").on(t.itemId, t.batchNumber),
    index("idx_batches_item").on(t.itemId),
  ]
);

export const stockBatches = pgTable(
  "stock_batches",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_stock_batches_batch_wh").on(t.batchId, t.warehouseId),
    index("idx_stock_batches_wh").on(t.warehouseId),
  ]
);

// ---------------------------------------------------------------------------
// STOCK BARCODES — isi dari stock_batch: tiap barcode asli (CMS-serial, diambil
// dari setiap transaksi di stock_movement_details) beserta lokasi gudang
// terkini. barcode = PK (unik per unit fisik). Tidak ada qty/type. Saat barcode
// pindah gudang, kolom warehouse_id diperbarui. Sinkron via trigger DB
// (migration 0025) + backfill awal. Tidak diisi manual dari frontend.
// ---------------------------------------------------------------------------
export const stockBarcodes = pgTable(
  "stock_barcodes",
  {
    barcode: text("barcode").primaryKey(),
    batchId: text("batch_id").references(() => batches.id, {
      onDelete: "cascade",
    }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_stock_barcodes_wh").on(t.warehouseId),
    index("idx_stock_barcodes_batch").on(t.batchId),
    index("idx_stock_barcodes_item").on(t.itemId),
  ]
);

// ---------------------------------------------------------------------------
// STOCK BATCH DETAILS — barcode per-unit (barcode asli CMS-serial, bukan
// batch_number) beserta lokasi gudang terkini. Sinkron dari
// stock_movement_details via trigger DB (lihat migration 0025) + backfill awal.
// Tidak diisi manual dari frontend. barcode unik per unit fisik.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// STOCK MOVEMENT + LEDGER (baru — belum dipakai kode)
// ---------------------------------------------------------------------------

export const movementTypes = pgTable("movement_types", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("OTHER"),
  series: text("series").notNull().default("SMV"),
  builtin: boolean("builtin").notNull().default(false),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const stockMovements = pgTable("stock_movements", {
  id: text("id").primaryKey(),
  typeId: text("type_id")
    .notNull()
    .references(() => movementTypes.id),
  movementDate: timestamp("movement_date", { withTimezone: true })
    .notNull()
    .defaultNow(),
  status: text("status").notNull().default("DRAFT"),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  description: text("description"),
  createdBy: text("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  index("idx_stock_movements_created_id").on(t.createdAt.desc(), t.id.desc()),
  index("idx_stock_movements_status").on(t.status),
  index("idx_stock_movements_type").on(t.typeId),
  index("idx_stock_movements_date").on(t.movementDate.desc()),
  index("idx_stock_movements_created").on(t.createdAt.desc()),
  index("idx_stock_movements_type_status").on(t.typeId, t.status),
]);

export const stockMovementDetails = pgTable(
  "stock_movement_details",
  {
    id: text("id").primaryKey(),
    movementId: text("movement_id")
      .notNull()
      .references(() => stockMovements.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    fromWarehouseId: text("from_warehouse_id").references(() => warehouses.id),
    toWarehouseId: text("to_warehouse_id").references(() => warehouses.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    uomId: text("uom_id").references(() => uom.id),
    batchId: text("batch_id").references(() => batches.id),
    barcode: text("barcode"),
    serialNumber: text("serial_number"),
    incomingRate: numeric("incoming_rate", { precision: 15, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_stock_movement_details_movement").on(t.movementId),
    index("idx_stock_movement_details_batch").on(t.batchId),
    index("idx_smd_from_wh").on(t.fromWarehouseId),
    index("idx_smd_to_wh").on(t.toWarehouseId),
    index("idx_smd_movement_from").on(t.movementId, t.fromWarehouseId),
    index("idx_smd_movement_to").on(t.movementId, t.toWarehouseId),
    index("idx_smd_created").on(t.createdAt.desc()),
  ]
);

export const stockLedger = pgTable(
  "stock_ledger",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id").notNull(),
    transactionType: text("transaction_type").notNull(),
    transactionDate: timestamp("transaction_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    locationId: text("location_id").references(() => locations.id),
    qtyIn: numeric("qty_in", { precision: 15, scale: 3 }).notNull().default("0"),
    qtyOut: numeric("qty_out", { precision: 15, scale: 3 }).notNull().default("0"),
    qtyBalance: numeric("qty_balance", { precision: 15, scale: 3 }).notNull().default("0"),
    valuationRate: numeric("valuation_rate", { precision: 15, scale: 2 }).notNull().default("0"),
    stockValue: numeric("stock_value", { precision: 15, scale: 2 }).notNull().default("0"),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    batchId: text("batch_id").references(() => batches.id),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_stock_ledger_item_wh").on(t.itemId, t.warehouseId),
    index("idx_stock_ledger_wh_item").on(t.warehouseId, t.itemId),
    index("idx_stock_ledger_wh_item_date").on(t.warehouseId, t.itemId, t.transactionDate, t.createdAt),
    index("idx_stock_ledger_date").on(t.transactionDate),
    index("idx_stock_ledger_batch").on(t.batchId),
  ]
);

// ---------------------------------------------------------------------------
// OPNAME — 4 tabel: project, warehouse peserta, scan (header), scan detail
// ---------------------------------------------------------------------------

export const opnameWhStatuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type OpnameWhStatus = (typeof opnameWhStatuses)[number];

export const opnameScanStatuses = ["DRAFT", "POSTED", "CANCELED"] as const;
export type OpnameScanStatus = (typeof opnameScanStatuses)[number];

export const opnameWarehouses = pgTable(
  "opname_warehouses",
  {
    id: text("id").primaryKey(),
    opnameId: text("opname_id")
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    status: text("status", { enum: opnameWhStatuses })
      .notNull()
      .default("PENDING"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_opname_warehouses_opname_wh").on(t.opnameId, t.warehouseId),
    index("idx_opname_warehouses_opname").on(t.opnameId),
  ]
);

// Header scan — konsepnya sama dengan stock_movements:
// dibuat DRAFT, detail diisi per barcode, lalu POSTED (atau CANCELED).
export const opnameScans = pgTable(
  "opname_scans",
  {
    id: text("id").primaryKey(),
    opnameId: text("opname_id")
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    scannedBy: text("scanned_by").references(() => users.id),
    status: text("status", { enum: opnameScanStatuses })
      .notNull()
      .default("DRAFT"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("idx_opname_scans_opname").on(t.opnameId)]
);

export const opnameScanDetails = pgTable(
  "opname_scan_details",
  {
    id: text("id").primaryKey(),
    scanId: text("scan_id")
      .notNull()
      .references(() => opnameScans.id, { onDelete: "cascade" }),
    opnameId: text("opname_id")
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    locationId: text("location_id").references(() => locations.id),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    barcode: text("barcode").notNull(),
    batch: text("batch"),
    batchId: text("batch_id").references(() => batches.id, {
      onDelete: "set null",
    }),
    parsed: jsonb("parsed").notNull().default({}),
    quantity: integer("quantity").notNull().default(1),
    qtyMode: text("qty_mode", { enum: qtyModes }).notNull().default("AUTO"),
    source: text("source", { enum: scanSources }).notNull().default("SCANNER"),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_opname_scan_details_scan").on(t.scanId),
    index("idx_opname_scan_details_opname").on(t.opnameId),
    index("idx_opname_scan_details_wh").on(t.warehouseId),
  ]
);

export const opnameCountStatuses = ["DRAFT", "POSTED", "CANCELED"] as const;
export type OpnameCountStatus = (typeof opnameCountStatuses)[number];

export const opnameCounts = pgTable(
  "opname_counts",
  {
    id: text("id").primaryKey(), // SOC-mmyy-XXXX e.g. SOC-0826-0001
    projectId: text("project_id")
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    postingDate: date("posting_date"),
    postingTime: text("posting_time"),
    cutOffDate: date("cut_off_date"),
    cutOffTime: text("cut_off_time"),
    notes: text("notes"),
    status: text("status", { enum: opnameCountStatuses }).notNull().default("DRAFT"),
    createdBy: text("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_opname_counts_project").on(t.projectId),
    index("idx_opname_counts_warehouse").on(t.warehouseId),
    index("idx_opname_counts_created").on(t.createdAt),
    index("idx_opname_counts_status").on(t.status),
  ]
);

export const opnameCountDetails = pgTable(
  "opname_count_details",
  {
    id: text("id").primaryKey(),
    countId: text("count_id")
      .notNull()
      .references(() => opnameCounts.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    batch: text("batch"),
    uomId: text("uom_id").references(() => uom.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_opname_count_details_count").on(t.countId),
    index("idx_opname_count_details_item").on(t.itemId),
    index("idx_opname_count_details_wh").on(t.warehouseId),
  ]
);

// --- Supply Chain: master + dokumen (PO / SO / Goods Receipt=Inbound) ---

export const docStatuses = ["DRAFT", "POSTED", "CANCELED"] as const;
export type DocStatus = (typeof docStatuses)[number];

export const suppliers = pgTable("suppliers", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  isActive: boolean("is_active").notNull().default(true),
  branchId: text("branch_id").references(() => branches.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  isActive: boolean("is_active").notNull().default(true),
  branchId: text("branch_id").references(() => branches.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: text("id").primaryKey(),
    poNo: text("po_no").notNull().unique(),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    status: text("status", { enum: docStatuses })
      .notNull()
      .default("DRAFT"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    branchId: text("branch_id").references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_purchase_orders_supplier").on(t.supplierId),
    index("idx_purchase_orders_wh").on(t.warehouseId),
    index("idx_purchase_orders_status").on(t.status),
  ]
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: text("id").primaryKey(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    uomId: text("uom_id")
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    batchNumber: text("batch_number"),
    note: text("note"),
    deliveryDate: date("delivery_date"),
  },
  (t) => [index("idx_pol_po").on(t.purchaseOrderId)]
);

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: text("id").primaryKey(),
    soNo: text("so_no").notNull().unique(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    status: text("status", { enum: docStatuses })
      .notNull()
      .default("DRAFT"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    branchId: text("branch_id").references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_sales_orders_customer").on(t.customerId),
    index("idx_sales_orders_wh").on(t.warehouseId),
    index("idx_sales_orders_status").on(t.status),
  ]
);

export const salesOrderLines = pgTable(
  "sales_order_lines",
  {
    id: text("id").primaryKey(),
    salesOrderId: text("sales_order_id")
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    uomId: text("uom_id")
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    batchNumber: text("batch_number"),
    note: text("note"),
  },
  (t) => [index("idx_sol_so").on(t.salesOrderId)]
);

export const goodsReceipts = pgTable(
  "goods_receipts",
  {
    id: text("id").primaryKey(),
    grNo: text("gr_no").notNull().unique(),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    receiptDate: date("receipt_date").notNull(),
    status: text("status", { enum: docStatuses })
      .notNull()
      .default("DRAFT"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => users.id),
    branchId: text("branch_id").references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_goods_receipts_po").on(t.purchaseOrderId),
    index("idx_goods_receipts_wh").on(t.warehouseId),
    index("idx_goods_receipts_status").on(t.status),
  ]
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: text("id").primaryKey(),
    goodsReceiptId: text("goods_receipt_id")
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    uomId: text("uom_id")
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    batchNumber: text("batch_number"),
    note: text("note"),
  },
  (t) => [index("idx_grl_gr").on(t.goodsReceiptId)]
);
