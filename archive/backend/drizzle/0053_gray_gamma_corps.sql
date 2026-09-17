ALTER TABLE "price_list_lines" ADD COLUMN "type" text DEFAULT 'PURCHASE' NOT NULL;--> statement-breakpoint
ALTER TABLE "price_list_lines" ADD COLUMN "supplier_id" bigint;--> statement-breakpoint
ALTER TABLE "price_list_lines" ADD COLUMN "customer_id" bigint;--> statement-breakpoint
ALTER TABLE "price_list_lines" ADD CONSTRAINT "price_list_lines_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_lines" ADD CONSTRAINT "price_list_lines_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_price_list_lines_type" ON "price_list_lines" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_price_list_lines_supplier" ON "price_list_lines" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_price_list_lines_customer" ON "price_list_lines" USING btree ("customer_id");