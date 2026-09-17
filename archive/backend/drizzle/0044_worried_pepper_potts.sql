ALTER TABLE "purchase_order_lines" ADD COLUMN "discount" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "tax_type" text DEFAULT 'EXCLUSIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "tax_rate" numeric(5, 2) DEFAULT '11' NOT NULL;