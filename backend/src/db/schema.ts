import { sql } from "drizzle-orm";
import {
  bigint,
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
  uuid,
} from "drizzle-orm/pg-core";
import { v7 as uuidv7 } from "uuid";

export const opnameModes = ["COMPARE", "SCRATCH"] as const;
export type OpnameMode = (typeof opnameModes)[number];

export const projectStatuses = ["DRAFT", "IN_PROGRESS", "APPROVED", "CANCELLED"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const qtyModes = ["AUTO", "MANUAL"] as const;
export const scanSources = ["SCANNER", "CAMERA", "MANUAL"] as const;

export const entityTypes = ["BRANCH", "WAREHOUSE"] as const;

// ---------------------------------------------------------------------------
// Document Numbering: types + series + sequences (monthly reset, customizable)
// ---------------------------------------------------------------------------

export const documentTypes = pgTable("document_types", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id")
    .notNull()
    .unique()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentSeries = pgTable(
  "document_series",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv7()),
    documentTypeId: bigint("document_type_id", { mode: "number" })
      .notNull()
      .references(() => documentTypes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(), // PO, POI, SO
    format: text("format").notNull().default("{PREFIX}-{YYMM}-{SEQ:4}"),
    padding: integer("padding").notNull().default(4),
    resetPolicy: text("reset_policy", {
      enum: ["MONTHLY", "YEARLY", "NEVER", "DAILY"],
    })
      .notNull()
      .default("MONTHLY"),
    isDefault: boolean("is_default").notNull().default(false),
    branchSpecific: boolean("branch_specific").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_document_series_type").on(t.documentTypeId),
    uniqueIndex("uq_document_series_name").on(t.documentTypeId, t.name),
  ]
);

export const documentSequences = pgTable(
  "document_sequences",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    seriesId: bigint("series_id", { mode: "number" })
      .notNull()
      .references(() => documentSeries.id, { onDelete: "cascade" }),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id, {
      onDelete: "cascade",
    }),
    periodKey: text("period_key").notNull(),
    lastNumber: integer("last_number").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_document_sequences").on(t.seriesId, t.branchId, t.periodKey),
    index("idx_document_sequences_series").on(t.seriesId),
  ]
);

// ---------------------------------------------------------------------------
// Core tables: all with id bigint PK + public_id uuid v7
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  roleId: bigint("role_id", { mode: "number" }).references(() => roles.id, {
    onDelete: "set null",
  }),
  // keep legacy text role for transition? remove, use roleId only
  active: boolean("active").notNull().default(true),
  avatarHue: integer("avatar_hue").notNull().default(200),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  userId: bigint("user_id", { mode: "number" })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSignatures = pgTable(
  "user_signatures",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signatureData: text("signature_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_user_signatures_user").on(t.userId),
    index("idx_user_signatures_user").on(t.userId),
  ]
);

// --- RBAC: Role custom + permission + akses entitas ---

export const roles = pgTable("roles", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  code: text("code").unique(), // e.g. SYS_ADMIN, ADMIN, STAFF (optional)
  isSystem: boolean("is_system").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    menu: text("menu").notNull(),
    action: text("action").notNull(),
  },
  (t) => [uniqueIndex("uq_role_permissions").on(t.roleId, t.menu, t.action)]
);

export const branchAccesses = pgTable(
  "branch_access",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: entityTypes }).notNull(),
    entityId: bigint("entity_id", { mode: "number" }).notNull(),
  },
  (t) => [
    uniqueIndex("uq_branch_access").on(t.roleId, t.entityType, t.entityId),
    index("idx_branch_access_role").on(t.roleId),
  ]
);

// --- Workspace: 4 fixed workspace untuk mengelompokkan menu ---
export const workspaces = pgTable("workspaces", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
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
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    roleId: bigint("role_id", { mode: "number" })
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    workspaceId: bigint("workspace_id", { mode: "number" })
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
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    userId: bigint("user_id", { mode: "number" })
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
export const dashboards = pgTable("dashboards", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  ownerId: bigint("owner_id", { mode: "number" }).references(() => users.id),
  branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
  workspaceId: bigint("workspace_id", { mode: "number" }).references(() => workspaces.id),
  isGlobal: boolean("is_global").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dashboardWidgets = pgTable("dashboard_widgets", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  dashboardId: bigint("dashboard_id", { mode: "number" })
    .notNull()
    .references(() => dashboards.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  config: jsonb("config").notNull().default({}),
  layout: jsonb("layout").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Konfigurasi AI assistant — per workspace (workspace_id null = global fallback).
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    workspaceId: bigint("workspace_id", { mode: "number" }).references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    enabled: boolean("enabled").notNull().default(false),
    defaultProvider: text("default_provider", { enum: ["GOOGLE", "DEEPSEEK"] }).notNull().default("GOOGLE"),
    googleApiKey: text("google_api_key"),
    googleModel: text("google_model").notNull().default("gemini-3.5-flash"),
    deepseekApiKey: text("deepseek_api_key"),
    deepseekModel: text("deepseek_model").notNull().default("deepseek-chat"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("uq_ai_settings_workspace").on(t.workspaceId)]
);

// Global Company Settings — single row (id=1), SYS_ADMIN only
export const companySettings = pgTable("company_settings", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  companyName: text("company_name").notNull().default("Estoq"),
  companyCode: text("company_code").notNull().default("ESTOQ"),
  address: text("address"),
  taxId: text("tax_id"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  country: text("country").notNull().default("Indonesia"),
  baseCurrency: text("base_currency").notNull().default("IDR"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  fiscalYear: text("fiscal_year").notNull().default("JANUARY_DECEMBER"),
  logo: text("logo"), // base64 data URL or URL
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const branches = pgTable("branches", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  address: text("address"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const warehouses = pgTable(
  "warehouses",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    branchId: bigint("branch_id", { mode: "number" })
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    parentId: bigint("parent_id", { mode: "number" }).references((): any => warehouses.id, { onDelete: "set null" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    picName: text("pic_name"),
    picPhone: text("pic_phone"),
    picEmail: text("pic_email"),
    address: text("address"),
    phone: text("phone"),
    email: text("email"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_warehouses_parent").on(t.parentId), index("idx_warehouses_branch_parent").on(t.branchId, t.parentId)]
);

export const locations = pgTable("locations", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  warehouseId: bigint("warehouse_id", { mode: "number" })
    .notNull()
    .references(() => warehouses.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itemGroups = pgTable("item_groups", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uom = pgTable("uom", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const departments = pgTable("departments", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxCategories = pgTable(
  "tax_categories",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv7()),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_tax_categories_code").on(t.code),
    index("idx_tax_categories_active").on(t.isActive),
    index("idx_tax_categories_name").on(t.name),
  ]
);

export const priceListTypes = ["PURCHASE", "SALES"] as const;
export type PriceListType = (typeof priceListTypes)[number];

export const priceLists = pgTable(
  "price_lists",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type", { enum: priceListTypes }).notNull().default("PURCHASE"),
    supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id, { onDelete: "set null" }),
    customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id, { onDelete: "set null" }),
    currency: text("currency").notNull().default("IDR"),
    isActive: boolean("is_active").notNull().default(true),
    validFrom: date("valid_from"),
    validTo: date("valid_to"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_price_lists_code").on(t.code),
    index("idx_price_lists_active").on(t.isActive),
    index("idx_price_lists_currency").on(t.currency),
    index("idx_price_lists_type").on(t.type),
    index("idx_price_lists_supplier").on(t.supplierId),
    index("idx_price_lists_customer").on(t.customerId),
  ]
);

export const priceListLines = pgTable(
  "price_list_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    priceListId: bigint("price_list_id", { mode: "number" })
      .notNull()
      .references(() => priceLists.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    uomId: bigint("uom_id", { mode: "number" }).references(() => uom.id),
    type: text("type", { enum: priceListTypes }).notNull().default("PURCHASE"),
    supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id, { onDelete: "set null" }),
    customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id, { onDelete: "set null" }),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    minQty: numeric("min_qty", { precision: 15, scale: 3 }).notNull().default("1"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_price_list_item").on(t.priceListId, t.itemId),
    index("idx_price_list_lines_price_list").on(t.priceListId),
    index("idx_price_list_lines_item").on(t.itemId),
    index("idx_price_list_lines_type").on(t.type),
    index("idx_price_list_lines_supplier").on(t.supplierId),
    index("idx_price_list_lines_customer").on(t.customerId),
  ]
);

export const stockBalances = pgTable(
  "stock_balances",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    balanceDate: date("balance_date").notNull().default(sql`CURRENT_DATE`),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    openingQty: integer("opening_qty").notNull().default(0),
    inQty: integer("in_qty").notNull().default(0),
    outQty: integer("out_qty").notNull().default(0),
    closingQty: integer("closing_qty").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_stock_balances_wh_item_date").on(t.warehouseId, t.itemId, t.balanceDate),
    index("idx_stock_balances_item").on(t.itemId),
    index("idx_stock_balances_date").on(t.balanceDate),
  ]
);

export const items = pgTable("items", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull(),
  name: text("name").notNull(),
  itemGroupId: bigint("item_group_id", { mode: "number" })
    .notNull()
    .references(() => itemGroups.id),
  hue: integer("hue").notNull().default(200),
  uomId: bigint("uom_id", { mode: "number" }).references(() => uom.id),
  alternativeCode: text("alternative_code"),
  uomQty: numeric("uom_qty", { precision: 15, scale: 3 }),
  description: text("description"),
  valuationRate: numeric("valuation_rate", { precision: 15, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  isFinishGood: boolean("is_finish_good").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const barcodeFormats = pgTable("barcode_formats", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  qtyPerFormat: boolean("qty_per_format").notNull().default(true),
  uniqueBarcode: boolean("unique_barcode").notNull().default(false),
  segments: jsonb("segments").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const batchFormats = pgTable("batch_formats", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  segments: jsonb("segments").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opnameProjects = pgTable("opname_projects", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  documentNo: text("document_no").unique(),
  seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
  name: text("name").notNull(),
  mode: text("mode", { enum: opnameModes }).notNull().default("COMPARE"),
  status: text("status", { enum: projectStatuses }).notNull().default("DRAFT"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deadline: timestamp("deadline", { withTimezone: true }),
  opnameDate: date("opname_date"),
  cutOffDate: date("cut_off_date"),
  cutOffTime: text("cut_off_time"),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  description: text("description"),
});

export const batchStatuses = ["ACTIVE", "EMPTY"] as const;

export const batches = pgTable(
  "batches",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    batchNumber: text("batch_number").notNull(),
    status: text("status", { enum: batchStatuses }).notNull().default("ACTIVE"),
    productionDate: date("production_date"),
    expiryDate: date("expiry_date"),
    shift: text("shift"),
    meta: jsonb("meta").notNull().default({}),
    notes: text("notes"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_batches_item_number").on(t.itemId, t.batchNumber),
    index("idx_batches_item").on(t.itemId),
  ]
);

export const stockBatches = pgTable(
  "stock_batches",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    batchId: bigint("batch_id", { mode: "number" })
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_stock_batches_batch_wh").on(t.batchId, t.warehouseId),
    index("idx_stock_batches_wh").on(t.warehouseId),
  ]
);

// Stock barcodes now has id bigint PK, barcode unique
export const stockBarcodes = pgTable(
  "stock_barcodes",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    barcode: text("barcode").notNull().unique(),
    batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id, {
      onDelete: "cascade",
    }),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_stock_barcodes_wh").on(t.warehouseId),
    index("idx_stock_barcodes_batch").on(t.batchId),
    index("idx_stock_barcodes_item").on(t.itemId),
  ]
);

// ---------------------------------------------------------------------------
// STOCK MOVEMENT + LEDGER
// ---------------------------------------------------------------------------

export const movementTypes = pgTable("movement_types", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("OTHER"),
  series: text("series").notNull().default("SMV"),
  builtin: boolean("builtin").notNull().default(false),
  createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    typeId: bigint("type_id", { mode: "number" })
      .notNull()
      .references(() => movementTypes.id),
    movementDate: timestamp("movement_date", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("DRAFT"),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    description: text("description"),
    customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_stock_movements_public_id").on(t.publicId),
    index("idx_stock_movements_document_no").on(t.documentNo),
    index("idx_stock_movements_created_id").on(t.createdAt.desc(), t.id.desc()),
    index("idx_stock_movements_status").on(t.status),
    index("idx_stock_movements_type").on(t.typeId),
    index("idx_stock_movements_date").on(t.movementDate.desc()),
    index("idx_stock_movements_created").on(t.createdAt.desc()),
    index("idx_stock_movements_type_status").on(t.typeId, t.status),
  ]
);

export const stockMovementDetails = pgTable(
  "stock_movement_details",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    movementId: bigint("movement_id", { mode: "number" })
      .notNull()
      .references(() => stockMovements.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    fromWarehouseId: bigint("from_warehouse_id", { mode: "number" }).references(() => warehouses.id),
    toWarehouseId: bigint("to_warehouse_id", { mode: "number" }).references(() => warehouses.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    uomId: bigint("uom_id", { mode: "number" }).references(() => uom.id),
    batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id),
    barcode: text("barcode"),
    serialNumber: text("serial_number"),
    incomingRate: numeric("incoming_rate", { precision: 15, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    transactionId: bigint("transaction_id", { mode: "number" }).notNull(),
    transactionType: text("transaction_type").notNull(),
    transactionDate: timestamp("transaction_date", { withTimezone: true }).notNull().defaultNow(),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    locationId: bigint("location_id", { mode: "number" }).references(() => locations.id),
    qtyIn: numeric("qty_in", { precision: 15, scale: 3 }).notNull().default("0"),
    qtyOut: numeric("qty_out", { precision: 15, scale: 3 }).notNull().default("0"),
    qtyBalance: numeric("qty_balance", { precision: 15, scale: 3 }).notNull().default("0"),
    valuationRate: numeric("valuation_rate", { precision: 15, scale: 2 }).notNull().default("0"),
    stockValue: numeric("stock_value", { precision: 15, scale: 2 }).notNull().default("0"),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    opnameId: bigint("opname_id", { mode: "number" })
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    status: text("status", { enum: opnameWhStatuses }).notNull().default("PENDING"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_opname_warehouses_opname_wh").on(t.opnameId, t.warehouseId),
    index("idx_opname_warehouses_opname").on(t.opnameId),
  ]
);

export const opnameScans = pgTable(
  "opname_scans",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    opnameId: bigint("opname_id", { mode: "number" })
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    scannedBy: bigint("scanned_by", { mode: "number" }).references(() => users.id),
    status: text("status", { enum: opnameScanStatuses }).notNull().default("DRAFT"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_opname_scans_opname").on(t.opnameId)]
);

export const opnameScanDetails = pgTable(
  "opname_scan_details",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    scanId: bigint("scan_id", { mode: "number" })
      .notNull()
      .references(() => opnameScans.id, { onDelete: "cascade" }),
    opnameId: bigint("opname_id", { mode: "number" })
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    locationId: bigint("location_id", { mode: "number" }).references(() => locations.id),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    barcode: text("barcode").notNull(),
    batch: text("batch"),
    batchId: bigint("batch_id", { mode: "number" }).references(() => batches.id, {
      onDelete: "set null",
    }),
    parsed: jsonb("parsed").notNull().default({}),
    quantity: integer("quantity").notNull().default(1),
    qtyMode: text("qty_mode", { enum: qtyModes }).notNull().default("AUTO"),
    source: text("source", { enum: scanSources }).notNull().default("SCANNER"),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
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
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    projectId: bigint("project_id", { mode: "number" })
      .notNull()
      .references(() => opnameProjects.id, { onDelete: "cascade" }),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    postingDate: date("posting_date"),
    postingTime: text("posting_time"),
    cutOffDate: date("cut_off_date"),
    cutOffTime: text("cut_off_time"),
    notes: text("notes"),
    status: text("status", { enum: opnameCountStatuses }).notNull().default("DRAFT"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_opname_counts_project").on(t.projectId),
    index("idx_opname_counts_warehouse").on(t.warehouseId),
    index("idx_opname_counts_created").on(t.createdAt),
    index("idx_opname_counts_status").on(t.status),
    index("idx_opname_counts_document_no").on(t.documentNo),
  ]
);

export const opnameCountDetails = pgTable(
  "opname_count_details",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    countId: bigint("count_id", { mode: "number" })
      .notNull()
      .references(() => opnameCounts.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    batch: text("batch"),
    uomId: bigint("uom_id", { mode: "number" }).references(() => uom.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
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

export const docStatuses = ["DRAFT", "POSTED", "CANCELED", "PENDING_APPROVAL", "APPROVED", "REJECTED"] as const;
export type DocStatus = (typeof docStatuses)[number];

export const receivingStatuses = ["DRAFT", "PENDING_QC", "COMPLETED", "CANCELED", "POSTED"] as const;
export type ReceivingStatus = (typeof receivingStatuses)[number];

export const suppliers = pgTable("suppliers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  isActive: boolean("is_active").notNull().default(true),
  branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  taxId: text("tax_id"),
  isActive: boolean("is_active").notNull().default(true),
  branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    supplierId: bigint("supplier_id", { mode: "number" })
      .notNull()
      .references(() => suppliers.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    status: text("status", { enum: docStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    department: text("department"),
    costCenter: text("cost_center"),
    currency: text("currency").notNull().default("IDR"),
    exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }).notNull().default("1"),
    allowEditOrderDate: boolean("allow_edit_order_date").notNull().default(false),
    qcRequired: boolean("qc_required").notNull().default(true),
    needApproval: boolean("need_approval").notNull().default(false),
    currentApprovalLevel: integer("current_approval_level").notNull().default(0),
    approvalWorkflowId: bigint("approval_workflow_id", { mode: "number" }),
    preparedSignature: text("prepared_signature"),
    preparedSignedAt: timestamp("prepared_signed_at", { withTimezone: true }),
    preparedBy: bigint("prepared_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    approvedSignature: text("approved_signature"),
    approvedSignedAt: timestamp("approved_signed_at", { withTimezone: true }),
    approvedBy: bigint("approved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    globalDiscountPercent: numeric("global_discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    additionalCharges: jsonb("additional_charges").$type<{ type: string; amount: string }[]>().notNull().default([]),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxCategoryId: bigint("tax_category_id", { mode: "number" }).references(() => taxCategories.id, { onDelete: "set null" }),
    priceListId: bigint("price_list_id", { mode: "number" }).references(() => priceLists.id, { onDelete: "set null" }),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_purchase_orders_supplier").on(t.supplierId),
    index("idx_purchase_orders_wh").on(t.warehouseId),
    index("idx_purchase_orders_status").on(t.status),
    index("idx_purchase_orders_document_no").on(t.documentNo),
    index("idx_purchase_orders_public_id").on(t.publicId),
    index("idx_purchase_orders_tax_category").on(t.taxCategoryId),
    index("idx_purchase_orders_price_list").on(t.priceListId),
  ]
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    purchaseOrderId: bigint("purchase_order_id", { mode: "number" })
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" })
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    discount: numeric("discount", { precision: 15, scale: 2 }).notNull().default("0"),
    batchNumber: text("batch_number"),
    note: text("note"),
    deliveryDate: date("delivery_date"),
  },
  (t) => [index("idx_pol_po").on(t.purchaseOrderId)]
);

export const purchaseRequests = pgTable(
  "purchase_requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    requestDate: date("request_date").notNull(),
    expectedDate: date("expected_date"),
    urgency: text("urgency", { enum: ["LOW", "MEDIUM", "HIGH"] }).notNull().default("MEDIUM"),
    status: text("status", { enum: docStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    department: text("department"),
    toDepartment: text("to_department"),
    costCenter: text("cost_center"),
    currency: text("currency").notNull().default("IDR"),
    exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }).notNull().default("1"),
    needApproval: boolean("need_approval").notNull().default(false),
    currentApprovalLevel: integer("current_approval_level").notNull().default(0),
    approvalWorkflowId: bigint("approval_workflow_id", { mode: "number" }),
    preparedSignature: text("prepared_signature"),
    preparedSignedAt: timestamp("prepared_signed_at", { withTimezone: true }),
    preparedBy: bigint("prepared_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    approvedSignature: text("approved_signature"),
    approvedSignedAt: timestamp("approved_signed_at", { withTimezone: true }),
    approvedBy: bigint("approved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    globalDiscountPercent: numeric("global_discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    additionalCharges: jsonb("additional_charges").$type<{ type: string; amount: string }[]>().notNull().default([]),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxCategoryId: bigint("tax_category_id", { mode: "number" }).references(() => taxCategories.id, { onDelete: "set null" }),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_purchase_requests_supplier").on(t.supplierId),
    index("idx_purchase_requests_wh").on(t.warehouseId),
    index("idx_purchase_requests_status").on(t.status),
    index("idx_purchase_requests_document_no").on(t.documentNo),
    index("idx_purchase_requests_public_id").on(t.publicId),
  ]
);

export const purchaseRequestLines = pgTable(
  "purchase_request_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    purchaseRequestId: bigint("purchase_request_id", { mode: "number" })
      .notNull()
      .references(() => purchaseRequests.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" })
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    discount: numeric("discount", { precision: 15, scale: 2 }).notNull().default("0"),
    batchNumber: text("batch_number"),
    note: text("note"),
    deliveryDate: date("delivery_date"),
  },
  (t) => [index("idx_prl_pr").on(t.purchaseRequestId)]
);

export const materialRequests = pgTable(
  "material_requests",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    requestDate: date("request_date").notNull(),
    expectedDate: date("expected_date"),
    urgency: text("urgency", { enum: ["LOW", "MEDIUM", "HIGH"] }).notNull().default("MEDIUM"),
    status: text("status", { enum: docStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    department: text("department"),
    costCenter: text("cost_center"),
    currency: text("currency").notNull().default("IDR"),
    exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }).notNull().default("1"),
    needApproval: boolean("need_approval").notNull().default(false),
    currentApprovalLevel: integer("current_approval_level").notNull().default(0),
    approvalWorkflowId: bigint("approval_workflow_id", { mode: "number" }),
    preparedSignature: text("prepared_signature"),
    preparedSignedAt: timestamp("prepared_signed_at", { withTimezone: true }),
    preparedBy: bigint("prepared_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    approvedSignature: text("approved_signature"),
    approvedSignedAt: timestamp("approved_signed_at", { withTimezone: true }),
    approvedBy: bigint("approved_by", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    globalDiscountPercent: numeric("global_discount_percent", { precision: 5, scale: 2 }).notNull().default("0"),
    additionalCharges: jsonb("additional_charges").$type<{ type: string; amount: string }[]>().notNull().default([]),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxCategoryId: bigint("tax_category_id", { mode: "number" }).references(() => taxCategories.id, { onDelete: "set null" }),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_material_requests_wh").on(t.warehouseId),
    index("idx_material_requests_status").on(t.status),
    index("idx_material_requests_document_no").on(t.documentNo),
    index("idx_material_requests_public_id").on(t.publicId),
  ]
);

export const materialRequestLines = pgTable(
  "material_request_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    materialRequestId: bigint("material_request_id", { mode: "number" })
      .notNull()
      .references(() => materialRequests.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" })
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    discount: numeric("discount", { precision: 15, scale: 2 }).notNull().default("0"),
    batchNumber: text("batch_number"),
    note: text("note"),
    deliveryDate: date("delivery_date"),
  },
  (t) => [index("idx_mrl_mr").on(t.materialRequestId)]
);

export const salesOrders = pgTable(
  "sales_orders",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    customerId: bigint("customer_id", { mode: "number" })
      .notNull()
      .references(() => customers.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    orderDate: date("order_date").notNull(),
    expectedDate: date("expected_date"),
    status: text("status", { enum: docStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_sales_orders_customer").on(t.customerId),
    index("idx_sales_orders_wh").on(t.warehouseId),
    index("idx_sales_orders_status").on(t.status),
    index("idx_sales_orders_document_no").on(t.documentNo),
  ]
);

export const salesOrderLines = pgTable(
  "sales_order_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    salesOrderId: bigint("sales_order_id", { mode: "number" })
      .notNull()
      .references(() => salesOrders.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" })
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
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    purchaseOrderId: bigint("purchase_order_id", { mode: "number" })
      .notNull()
      .references(() => purchaseOrders.id),
    supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    receiptDate: date("receipt_date").notNull(),
    status: text("status", { enum: docStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_goods_receipts_po").on(t.purchaseOrderId),
    index("idx_goods_receipts_wh").on(t.warehouseId),
    index("idx_goods_receipts_status").on(t.status),
    index("idx_goods_receipts_document_no").on(t.documentNo),
  ]
);

export const goodsReceiptLines = pgTable(
  "goods_receipt_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    goodsReceiptId: bigint("goods_receipt_id", { mode: "number" })
      .notNull()
      .references(() => goodsReceipts.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" })
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    batchNumber: text("batch_number"),
    note: text("note"),
  },
  (t) => [index("idx_grl_gr").on(t.goodsReceiptId)]
);

// --- Receiving (tahap awal inbound: Receiving → QC → GRN → stok) ---
// Catatan: receiving TIDAK menggerakkan stok. Stok bertambah saat GRN diposting.
// Return barang masuk ke Supplier Return.

export const receivings = pgTable(
  "receivings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    purchaseOrderId: bigint("purchase_order_id", { mode: "number" })
      .notNull()
      .references(() => purchaseOrders.id),
    supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    receiptDate: date("receipt_date").notNull(),
    status: text("status", { enum: receivingStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    submittedBy: bigint("submitted_by", { mode: "number" }).references(() => users.id),
    qcInspectedAt: timestamp("qc_inspected_at", { withTimezone: true }),
    qcInspectedBy: bigint("qc_inspected_by", { mode: "number" }).references(() => users.id),
    qcNotes: text("qc_notes"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_receivings_po").on(t.purchaseOrderId),
    index("idx_receivings_wh").on(t.warehouseId),
    index("idx_receivings_status").on(t.status),
    index("idx_receivings_document_no").on(t.documentNo),
  ]
);

export const receivingLines = pgTable(
  "receiving_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    receivingId: bigint("receiving_id", { mode: "number" })
      .notNull()
      .references(() => receivings.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" })
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    qtyAccepted: numeric("qty_accepted", { precision: 15, scale: 3 }),
    qtyRejected: numeric("qty_rejected", { precision: 15, scale: 3 }),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    batchNumber: text("batch_number"),
    note: text("note"),
    rejectReason: text("reject_reason"),
  },
  (t) => [index("idx_rcl_receiving").on(t.receivingId)]
);

export const qcInspectionStatuses = ["DRAFT", "COMPLETED", "CANCELED"] as const;
export type QcInspectionStatus = (typeof qcInspectionStatuses)[number];

export const qcInspections = pgTable(
  "qc_inspections",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    receivingId: bigint("receiving_id", { mode: "number" })
      .notNull()
      .references(() => receivings.id, { onDelete: "cascade" }),
    purchaseOrderId: bigint("purchase_order_id", { mode: "number" }).references(() => purchaseOrders.id),
    supplierId: bigint("supplier_id", { mode: "number" }).references(() => suppliers.id),
    warehouseId: bigint("warehouse_id", { mode: "number" }).references(() => warehouses.id),
    inspectionDate: date("inspection_date").notNull(),
    status: text("status", { enum: qcInspectionStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    qcNotes: text("qc_notes"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_qc_inspections_receiving").on(t.receivingId),
    index("idx_qc_inspections_po").on(t.purchaseOrderId),
    index("idx_qc_inspections_status").on(t.status),
    index("idx_qc_inspections_document_no").on(t.documentNo),
  ]
);

export const qcInspectionLines = pgTable(
  "qc_inspection_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    qcInspectionId: bigint("qc_inspection_id", { mode: "number" })
      .notNull()
      .references(() => qcInspections.id, { onDelete: "cascade" }),
    receivingLineId: bigint("receiving_line_id", { mode: "number" }).references(() => receivingLines.id, { onDelete: "set null" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" }).references(() => uom.id),
    qtyReceived: numeric("qty_received", { precision: 15, scale: 3 }).notNull(),
    qtyRejected: numeric("qty_rejected", { precision: 15, scale: 3 }).notNull().default("0"),
    qtyAccepted: numeric("qty_accepted", { precision: 15, scale: 3 }).notNull(),
    batchNumber: text("batch_number"),
    rejectReason: text("reject_reason"),
  },
  (t) => [index("idx_qcl_qc").on(t.qcInspectionId)]
);

export const qcParameters = pgTable(
  "qc_parameters",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_qc_params_code").on(t.code)]
);

export const qcInspectionLineParams = pgTable(
  "qc_inspection_line_params",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    qcInspectionLineId: bigint("qc_inspection_line_id", { mode: "number" })
      .notNull()
      .references(() => qcInspectionLines.id, { onDelete: "cascade" }),
    parameterId: bigint("parameter_id", { mode: "number" })
      .notNull()
      .references(() => qcParameters.id, { onDelete: "restrict" }),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    note: text("note"),
  },
  (t) => [index("idx_qcilp_line").on(t.qcInspectionLineId), index("idx_qcilp_param").on(t.parameterId)]
);

export const deliveries = pgTable(
  "deliveries",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentNo: text("document_no").unique(),
    seriesId: bigint("series_id", { mode: "number" }).references(() => documentSeries.id),
    salesOrderId: bigint("sales_order_id", { mode: "number" }).references(() => salesOrders.id),
    customerId: bigint("customer_id", { mode: "number" }).references(() => customers.id),
    warehouseId: bigint("warehouse_id", { mode: "number" })
      .notNull()
      .references(() => warehouses.id),
    deliveryDate: date("delivery_date").notNull(),
    status: text("status", { enum: docStatuses }).notNull().default("DRAFT"),
    notes: text("notes"),
    createdBy: bigint("created_by", { mode: "number" }).references(() => users.id),
    branchId: bigint("branch_id", { mode: "number" }).references(() => branches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_deliveries_so").on(t.salesOrderId),
    index("idx_deliveries_wh").on(t.warehouseId),
    index("idx_deliveries_customer").on(t.customerId),
    index("idx_deliveries_status").on(t.status),
    index("idx_deliveries_date").on(t.deliveryDate),
    index("idx_deliveries_document_no").on(t.documentNo),
  ]
);

export const deliveryLines = pgTable(
  "delivery_lines",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    deliveryId: bigint("delivery_id", { mode: "number" })
      .notNull()
      .references(() => deliveries.id, { onDelete: "cascade" }),
    itemId: bigint("item_id", { mode: "number" })
      .notNull()
      .references(() => items.id),
    uomId: bigint("uom_id", { mode: "number" })
      .notNull()
      .references(() => uom.id),
    qty: numeric("qty", { precision: 15, scale: 3 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 15, scale: 2 }),
    batchNumber: text("batch_number"),
    note: text("note"),
  },
  (t) => [index("idx_dll_delivery").on(t.deliveryId)]
);

export const workflowStatuses = ["DRAFT", "ACTIVE"] as const;
export type WorkflowStatus = (typeof workflowStatuses)[number];

// ---------------------------------------------------------------------------
// Workflow Engine — generic untuk PO, SO, GR, dll (setup custom states & transitions)
// ---------------------------------------------------------------------------
export const workflows = pgTable(
  "workflows",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    documentType: text("document_type").notNull(), // PO, SO, GR, etc.
    status: text("status", { enum: workflowStatuses }).notNull().default("DRAFT"),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_workflows_document_type").on(t.documentType), index("idx_workflows_status").on(t.status)]
);

export const workflowStates = pgTable(
  "workflow_states",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    workflowId: bigint("workflow_id", { mode: "number" })
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("neutral"), // neutral, success, warning, destructive
    type: text("type", { enum: ["initial", "intermediate", "final", "rejected"] }).notNull().default("intermediate"),
    orderNo: integer("order_no").notNull().default(0),
    requiresSignature: boolean("requires_signature").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_workflow_states_workflow").on(t.workflowId),
    uniqueIndex("uq_workflow_states_workflow_code").on(t.workflowId, t.code),
  ]
);

export const workflowTransitions = pgTable(
  "workflow_transitions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    workflowId: bigint("workflow_id", { mode: "number" })
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    fromStateId: bigint("from_state_id", { mode: "number" }).references(() => workflowStates.id, { onDelete: "set null" }),
    toStateId: bigint("to_state_id", { mode: "number" })
      .notNull()
      .references(() => workflowStates.id, { onDelete: "cascade" }),
    trigger: text("trigger", { enum: ["submit", "approve", "reject", "cancel", "custom"] }).notNull().default("approve"),
    allowedRoleIds: jsonb("allowed_role_ids").$type<string[]>().notNull().default([]), // publicId array
    condition: jsonb("condition").$type<{ minAmount?: number; maxAmount?: number } | null>(),
    requiresComment: boolean("requires_comment").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_workflow_transitions_workflow").on(t.workflowId),
    index("idx_workflow_transitions_from").on(t.fromStateId),
    index("idx_workflow_transitions_to").on(t.toStateId),
  ]
);

export const workflowInstances = pgTable(
  "workflow_instances",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    workflowId: bigint("workflow_id", { mode: "number" })
      .notNull()
      .references(() => workflows.id),
    documentType: text("document_type").notNull(),
    documentId: bigint("document_id", { mode: "number" }).notNull(),
    currentStateId: bigint("current_state_id", { mode: "number" }).references(() => workflowStates.id),
    status: text("status", { enum: ["active", "completed", "rejected"] }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_workflow_instances_workflow").on(t.workflowId),
    index("idx_workflow_instances_document").on(t.documentType, t.documentId),
  ]
);

export const workflowLogs = pgTable(
  "workflow_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    instanceId: bigint("instance_id", { mode: "number" })
      .notNull()
      .references(() => workflowInstances.id, { onDelete: "cascade" }),
    fromStateId: bigint("from_state_id", { mode: "number" }).references(() => workflowStates.id),
    toStateId: bigint("to_state_id", { mode: "number" }).references(() => workflowStates.id),
    transitionId: bigint("transition_id", { mode: "number" }).references(() => workflowTransitions.id),
    actorUserId: bigint("actor_user_id", { mode: "number" }).references(() => users.id),
    actorRole: text("actor_role"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_workflow_logs_instance").on(t.instanceId)]
);

export const documentActivities = pgTable(
  "document_activities",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
    publicId: uuid("public_id").notNull().unique().$defaultFn(() => uuidv7()),
    documentType: text("document_type").notNull(),
    documentId: bigint("document_id", { mode: "number" }).notNull(),
    actorUserId: bigint("actor_user_id", { mode: "number" }).references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    comment: text("comment"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_document_activities_doc").on(t.documentType, t.documentId),
    index("idx_document_activities_created").on(t.createdAt),
  ]
);
