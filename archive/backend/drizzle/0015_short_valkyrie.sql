CREATE TABLE "batches" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"batch_number" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"qty" numeric(15, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_batches" ADD CONSTRAINT "stock_batches_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_batches_item_number" ON "batches" USING btree ("item_id","batch_number");--> statement-breakpoint
CREATE INDEX "idx_batches_item" ON "batches" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_stock_batches_batch_wh" ON "stock_batches" USING btree ("batch_id","warehouse_id");--> statement-breakpoint
CREATE INDEX "idx_stock_batches_wh" ON "stock_batches" USING btree ("warehouse_id");--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD CONSTRAINT "stock_movement_details_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_batch" ON "stock_ledger" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_stock_movement_details_batch" ON "stock_movement_details" USING btree ("batch_id");