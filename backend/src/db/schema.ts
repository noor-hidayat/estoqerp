import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const opnameModes = ["COMPARE", "SCRATCH"] as const;
export type OpnameMode = (typeof opnameModes)[number];

export const projectStatuses = ["DRAFT", "IN_PROGRESS", "APPROVED", "CANCELLED"] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

export const sessionStatuses = ["ACTIVE", "CLOSED"] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

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

// Konfigurasi AI assistant (satu baris global).
export const aiSettings = pgTable(
  "ai_settings",
  {
    id: text("id").primaryKey(),
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
  }
);

export const branches = pgTable("branches", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  city: text("city").notNull(),
});

export const warehouses = pgTable("warehouses", {
  id: text("id").primaryKey(),
  branchId: text("branch_id")
    .notNull()
    .references(() => branches.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
});

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  warehouseId: text("warehouse_id")
    .notNull()
    .references(() => warehouses.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
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
  unit: text("unit").notNull(),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id),
  price: integer("price").notNull().default(0),
  hue: integer("hue").notNull().default(200),
  barcodeId: text("barcode_id"),
  qty: integer("qty"),
});

export const barcodeFormats = pgTable("barcode_formats", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  qtyPerFormat: boolean("qty_per_format").notNull().default(true),
  uniqueBarcode: boolean("unique_barcode").notNull().default(false),
  segments: jsonb("segments").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const opnameProjects = pgTable("opname_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  deadline: timestamp("deadline", { withTimezone: true }),
  createdBy: text("created_by").references(() => users.id),
});

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    projectId: text("project_id").references(() => opnameProjects.id, {
      onDelete: "set null",
    }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    warehouseId: text("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    mode: text("mode", { enum: opnameModes }).notNull(),
    status: text("status", { enum: projectStatuses })
      .notNull()
      .default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deadline: timestamp("deadline", { withTimezone: true }),
    createdBy: text("created_by").references(() => users.id),
  },
  (t) => [
    index("idx_projects_project_id").on(t.projectId),
    index("idx_projects_created_by").on(t.createdBy),
  ]
);

export const scanSessions = pgTable(
  "scan_sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    locationId: text("location_id").references(() => locations.id),
    scannedBy: text("scanned_by").references(() => users.id),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: text("status", { enum: sessionStatuses })
      .notNull()
      .default("ACTIVE"),
  },
  (t) => [index("idx_scan_sessions_project").on(t.projectId)]
);

export const scanRecords = pgTable(
  "scan_records",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => scanSessions.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    barcode: text("barcode").notNull(),
    itemId: text("item_id").references(() => items.id, { onDelete: "set null" }),
    parsed: jsonb("parsed").notNull().default({}),
    quantity: integer("quantity").notNull().default(1),
    qtyMode: text("qty_mode", { enum: qtyModes }).notNull().default("AUTO"),
    source: text("source", { enum: scanSources }).notNull().default("SCANNER"),
    locationId: text("location_id").references(() => locations.id),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_scan_records_session").on(t.sessionId),
    index("idx_scan_records_project").on(t.projectId),
  ]
);

export const opnameEntries = pgTable(
  "opname_entries",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => items.id),
    locationId: text("location_id").references(() => locations.id),
    systemQty: integer("system_qty").notNull().default(0),
    countedQty: integer("counted_qty").notNull().default(0),
  },
  (t) => [index("idx_opname_entries_project").on(t.projectId)]
);
