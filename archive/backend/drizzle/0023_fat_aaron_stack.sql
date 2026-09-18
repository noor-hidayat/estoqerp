-- Opname: 4 tabel (project, warehouse, scan header, scan detail).
-- Data lama (projects/scan_sessions/scan_records/opname_entries + struktur
-- opname lama) dimigrasikan oleh script backend/src/db/migrate-opname.ts
-- yang menjalankan file ini dan memindahkan datanya setelahnya.

DROP TABLE IF EXISTS "opname_scan_details" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "projects" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "scan_sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "scan_records" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "opname_entries" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "opname_counts" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "opname_sessions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "opname_scans" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "opname_warehouses" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "opname_projects" CASCADE;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "opname_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'COMPARE' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline" timestamp with time zone,
	"opname_date" date,
	"created_by" text,
	"description" text
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "opname_warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"opname_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "opname_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"opname_id" text NOT NULL,
	"scanned_by" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "opname_scan_details" (
	"id" text PRIMARY KEY NOT NULL,
	"scan_id" text NOT NULL,
	"opname_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text,
	"item_id" text NOT NULL,
	"barcode" text NOT NULL,
	"batch" text,
	"batch_id" text,
	"parsed" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"qty_mode" text DEFAULT 'AUTO' NOT NULL,
	"source" text DEFAULT 'SCANNER' NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "uq_opname_warehouses_opname_wh" ON "opname_warehouses" ("opname_id","warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opname_warehouses_opname" ON "opname_warehouses" ("opname_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opname_scans_opname" ON "opname_scans" ("opname_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opname_scan_details_scan" ON "opname_scan_details" ("scan_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opname_scan_details_opname" ON "opname_scan_details" ("opname_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opname_scan_details_wh" ON "opname_scan_details" ("warehouse_id");--> statement-breakpoint

ALTER TABLE "opname_projects" ADD CONSTRAINT "opname_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "opname_warehouses" ADD CONSTRAINT "opname_warehouses_opname_id_opname_projects_id_fk" FOREIGN KEY ("opname_id") REFERENCES "opname_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "opname_warehouses" ADD CONSTRAINT "opname_warehouses_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id");--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_opname_id_opname_projects_id_fk" FOREIGN KEY ("opname_id") REFERENCES "opname_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "opname_scan_details" ADD CONSTRAINT "opname_scan_details_scan_id_opname_scans_id_fk" FOREIGN KEY ("scan_id") REFERENCES "opname_scans"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "opname_scan_details" ADD CONSTRAINT "opname_scan_details_opname_id_opname_projects_id_fk" FOREIGN KEY ("opname_id") REFERENCES "opname_projects"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "opname_scan_details" ADD CONSTRAINT "opname_scan_details_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id");--> statement-breakpoint
ALTER TABLE "opname_scan_details" ADD CONSTRAINT "opname_scan_details_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id");--> statement-breakpoint
ALTER TABLE "opname_scan_details" ADD CONSTRAINT "opname_scan_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id");--> statement-breakpoint
ALTER TABLE "opname_scan_details" ADD CONSTRAINT "opname_scan_details_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL;--> statement-breakpoint