ALTER TABLE "material_request_lines" ADD COLUMN IF NOT EXISTS "unit_price" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "material_request_lines" ADD COLUMN IF NOT EXISTS "discount" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_request_lines" ADD COLUMN IF NOT EXISTS "batch_number" text;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "currency" text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "exchange_rate" numeric(15, 6) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "global_discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "additional_charges" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "material_requests" ADD COLUMN IF NOT EXISTS "tax_category_id" bigint;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD COLUMN IF NOT EXISTS "to_department" text;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='material_requests_tax_category_id_tax_categories_id_fk') THEN
    ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_tax_category_id_tax_categories_id_fk" FOREIGN KEY ("tax_category_id") REFERENCES "public"."tax_categories"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP COLUMN IF EXISTS "payment_terms";