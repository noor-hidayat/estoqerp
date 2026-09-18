-- Supply Chain: suppliers, customers, purchase orders, sales orders, goods receipts (inbound).

CREATE TABLE IF NOT EXISTS "suppliers" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "contact_person" text,
  "phone" text,
  "email" text,
  "address" text,
  "tax_id" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "branch_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_code_unique" ON "suppliers" ("code");

CREATE TABLE IF NOT EXISTS "customers" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "contact_person" text,
  "phone" text,
  "email" text,
  "address" text,
  "tax_id" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "branch_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "customers_code_unique" ON "customers" ("code");

DO $$ BEGIN
  ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "customers" ADD CONSTRAINT "customers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "po_no" text NOT NULL,
  "supplier_id" text NOT NULL,
  "warehouse_id" text NOT NULL,
  "order_date" date NOT NULL,
  "expected_date" date,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "notes" text,
  "created_by" text,
  "branch_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchase_orders_po_no_unique" ON "purchase_orders" ("po_no");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_supplier" ON "purchase_orders" ("supplier_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_wh" ON "purchase_orders" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_status" ON "purchase_orders" ("status");

DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "purchase_order_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "purchase_order_id" text NOT NULL,
  "item_id" text NOT NULL,
  "uom_id" text NOT NULL,
  "qty" numeric(15,3) NOT NULL,
  "unit_price" numeric(15,2),
  "batch_number" text,
  "note" text
);
CREATE INDEX IF NOT EXISTS "idx_pol_po" ON "purchase_order_lines" ("purchase_order_id");

DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "uom"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "sales_orders" (
  "id" text PRIMARY KEY NOT NULL,
  "so_no" text NOT NULL,
  "customer_id" text NOT NULL,
  "warehouse_id" text NOT NULL,
  "order_date" date NOT NULL,
  "expected_date" date,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "notes" text,
  "created_by" text,
  "branch_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sales_orders_so_no_unique" ON "sales_orders" ("so_no");
CREATE INDEX IF NOT EXISTS "idx_sales_orders_customer" ON "sales_orders" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_sales_orders_wh" ON "sales_orders" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_sales_orders_status" ON "sales_orders" ("status");

DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "sales_order_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "sales_order_id" text NOT NULL,
  "item_id" text NOT NULL,
  "uom_id" text NOT NULL,
  "qty" numeric(15,3) NOT NULL,
  "unit_price" numeric(15,2),
  "batch_number" text,
  "note" text
);
CREATE INDEX IF NOT EXISTS "idx_sol_so" ON "sales_order_lines" ("sales_order_id");

DO $$ BEGIN
  ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_sales_order_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "uom"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "goods_receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "gr_no" text NOT NULL,
  "purchase_order_id" text NOT NULL,
  "supplier_id" text,
  "warehouse_id" text NOT NULL,
  "receipt_date" date NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "notes" text,
  "created_by" text,
  "branch_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_gr_no_unique" ON "goods_receipts" ("gr_no");
CREATE INDEX IF NOT EXISTS "idx_goods_receipts_po" ON "goods_receipts" ("purchase_order_id");
CREATE INDEX IF NOT EXISTS "idx_goods_receipts_wh" ON "goods_receipts" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_goods_receipts_status" ON "goods_receipts" ("status");

DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "goods_receipt_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "goods_receipt_id" text NOT NULL,
  "item_id" text NOT NULL,
  "uom_id" text NOT NULL,
  "qty" numeric(15,3) NOT NULL,
  "unit_price" numeric(15,2),
  "batch_number" text,
  "note" text
);
CREATE INDEX IF NOT EXISTS "idx_grl_gr" ON "goods_receipt_lines" ("goods_receipt_id");

DO $$ BEGIN
  ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_goods_receipt_id_fk" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "goods_receipt_lines" ADD CONSTRAINT "goods_receipt_lines_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "uom"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
