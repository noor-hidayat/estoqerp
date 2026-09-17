CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "movement_types" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "opname_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"opname_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"item_id" text NOT NULL,
	"system_qty" numeric(15, 3) DEFAULT '0' NOT NULL,
	"counted_qty" numeric(15, 3) DEFAULT '0' NOT NULL,
	"difference_qty" numeric(15, 3) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"counted_at" timestamp with time zone,
	"counted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opname_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"opname_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text NOT NULL,
	"item_id" text NOT NULL,
	"barcode" text NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scanned_by" text
);
--> statement-breakpoint
CREATE TABLE "opname_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"opname_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text NOT NULL,
	"item_id" text NOT NULL,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "opname_warehouses" (
	"id" text PRIMARY KEY NOT NULL,
	"opname_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"transaction_date" timestamp with time zone DEFAULT now() NOT NULL,
	"item_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text,
	"qty_in" numeric(15, 3) DEFAULT '0' NOT NULL,
	"qty_out" numeric(15, 3) DEFAULT '0' NOT NULL,
	"qty_balance" numeric(15, 3) DEFAULT '0' NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movement_details" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_id" text NOT NULL,
	"item_id" text NOT NULL,
	"from_warehouse_id" text,
	"to_warehouse_id" text,
	"qty" numeric(15, 3) NOT NULL,
	"uom_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"movement_number" text NOT NULL,
	"type_id" text NOT NULL,
	"movement_date" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"reference_type" text,
	"reference_id" text,
	"description" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_movement_number_unique" UNIQUE("movement_number")
);
--> statement-breakpoint
CREATE TABLE "uom" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uom_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "ai_settings" ALTER COLUMN "google_model" SET DEFAULT 'gemini-3.5-flash';--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "uom_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "alternative_code" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "uom_qty" numeric(15, 3);--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "opname_projects" ADD COLUMN "opname_date" date;--> statement-breakpoint
ALTER TABLE "opname_projects" ADD COLUMN "status" text DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
ALTER TABLE "opname_projects" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "movement_types" ADD CONSTRAINT "movement_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_counts" ADD CONSTRAINT "opname_counts_opname_id_opname_projects_id_fk" FOREIGN KEY ("opname_id") REFERENCES "public"."opname_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_counts" ADD CONSTRAINT "opname_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_counts" ADD CONSTRAINT "opname_counts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_counts" ADD CONSTRAINT "opname_counts_counted_by_users_id_fk" FOREIGN KEY ("counted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_session_id_opname_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."opname_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_opname_id_opname_projects_id_fk" FOREIGN KEY ("opname_id") REFERENCES "public"."opname_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_scans" ADD CONSTRAINT "opname_scans_scanned_by_users_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_sessions" ADD CONSTRAINT "opname_sessions_opname_id_opname_projects_id_fk" FOREIGN KEY ("opname_id") REFERENCES "public"."opname_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_sessions" ADD CONSTRAINT "opname_sessions_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_sessions" ADD CONSTRAINT "opname_sessions_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_sessions" ADD CONSTRAINT "opname_sessions_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_sessions" ADD CONSTRAINT "opname_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_warehouses" ADD CONSTRAINT "opname_warehouses_opname_id_opname_projects_id_fk" FOREIGN KEY ("opname_id") REFERENCES "public"."opname_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opname_warehouses" ADD CONSTRAINT "opname_warehouses_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD CONSTRAINT "stock_movement_details_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD CONSTRAINT "stock_movement_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD CONSTRAINT "stock_movement_details_from_warehouse_id_warehouses_id_fk" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD CONSTRAINT "stock_movement_details_to_warehouse_id_warehouses_id_fk" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD CONSTRAINT "stock_movement_details_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_type_id_movement_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."movement_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uom" ADD CONSTRAINT "uom_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_opname_counts_opname" ON "opname_counts" USING btree ("opname_id");--> statement-breakpoint
CREATE INDEX "idx_opname_scans_session" ON "opname_scans" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_opname_scans_opname" ON "opname_scans" USING btree ("opname_id");--> statement-breakpoint
CREATE INDEX "idx_opname_sessions_opname" ON "opname_sessions" USING btree ("opname_id");--> statement-breakpoint
CREATE INDEX "idx_opname_warehouses_opname" ON "opname_warehouses" USING btree ("opname_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_item_wh" ON "stock_ledger" USING btree ("item_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_date" ON "stock_ledger" USING btree ("transaction_date");--> statement-breakpoint
CREATE INDEX "idx_stock_movement_details_movement" ON "stock_movement_details" USING btree ("movement_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;