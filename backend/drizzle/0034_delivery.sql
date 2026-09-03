-- Delivery (outbound) from Sales Order: header + lines

CREATE TABLE IF NOT EXISTS "deliveries" (
  "id" text PRIMARY KEY NOT NULL,
  "delivery_no" text NOT NULL,
  "sales_order_id" text,
  "customer_id" text,
  "warehouse_id" text NOT NULL,
  "delivery_date" date NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "notes" text,
  "created_by" text,
  "branch_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_delivery_no_unique" ON "deliveries" ("delivery_no");
CREATE INDEX IF NOT EXISTS "idx_deliveries_so" ON "deliveries" ("sales_order_id");
CREATE INDEX IF NOT EXISTS "idx_deliveries_wh" ON "deliveries" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_deliveries_customer" ON "deliveries" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_deliveries_status" ON "deliveries" ("status");
CREATE INDEX IF NOT EXISTS "idx_deliveries_date" ON "deliveries" ("delivery_date");

DO $$ BEGIN
  ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_sales_order_id_sales_orders_id_fk" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "delivery_lines" (
  "id" text PRIMARY KEY NOT NULL,
  "delivery_id" text NOT NULL,
  "item_id" text NOT NULL,
  "uom_id" text NOT NULL,
  "qty" numeric(15,3) NOT NULL,
  "unit_price" numeric(15,2),
  "batch_number" text,
  "note" text
);
CREATE INDEX IF NOT EXISTS "idx_dll_delivery" ON "delivery_lines" ("delivery_id");

DO $$ BEGIN
  ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "uom"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
