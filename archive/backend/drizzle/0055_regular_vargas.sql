ALTER TABLE "price_lists" ADD COLUMN "type" text DEFAULT 'PURCHASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "supplier_id" bigint;--> statement-breakpoint
ALTER TABLE "price_lists" ADD COLUMN "customer_id" bigint;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_price_lists_type" ON "price_lists" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_price_lists_supplier" ON "price_lists" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_price_lists_customer" ON "price_lists" USING btree ("customer_id");