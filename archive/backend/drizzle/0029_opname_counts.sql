-- Custom SQL migration for opname_counts + cut off on projects
ALTER TABLE "opname_projects" ADD COLUMN "cut_off_date" date;
ALTER TABLE "opname_projects" ADD COLUMN "cut_off_time" text;
--> statement-breakpoint
CREATE TABLE "opname_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"posting_date" date,
	"posting_time" text,
	"cut_off_date" date,
	"cut_off_time" text,
	"notes" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opname_counts" ADD CONSTRAINT "opname_counts_project_id_opname_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."opname_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opname_counts" ADD CONSTRAINT "opname_counts_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opname_counts" ADD CONSTRAINT "opname_counts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_opname_counts_project" ON "opname_counts" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "idx_opname_counts_warehouse" ON "opname_counts" USING btree ("warehouse_id");
--> statement-breakpoint
CREATE INDEX "idx_opname_counts_created" ON "opname_counts" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX "idx_opname_counts_status" ON "opname_counts" USING btree ("status");
--> statement-breakpoint
CREATE TABLE "opname_count_details" (
	"id" text PRIMARY KEY NOT NULL,
	"count_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" numeric(15, 3) NOT NULL,
	"batch" text,
	"uom_id" text,
	"warehouse_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "opname_count_details" ADD CONSTRAINT "opname_count_details_count_id_opname_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."opname_counts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opname_count_details" ADD CONSTRAINT "opname_count_details_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opname_count_details" ADD CONSTRAINT "opname_count_details_uom_id_uom_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "opname_count_details" ADD CONSTRAINT "opname_count_details_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_opname_count_details_count" ON "opname_count_details" USING btree ("count_id");
--> statement-breakpoint
CREATE INDEX "idx_opname_count_details_item" ON "opname_count_details" USING btree ("item_id");
--> statement-breakpoint
CREATE INDEX "idx_opname_count_details_wh" ON "opname_count_details" USING btree ("warehouse_id");
