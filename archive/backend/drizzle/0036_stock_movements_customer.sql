ALTER TABLE "stock_movements" ADD COLUMN "customer_id" text;
CREATE INDEX "idx_stock_movements_customer" ON "stock_movements" USING btree ("customer_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
