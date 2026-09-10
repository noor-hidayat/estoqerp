ALTER TABLE "purchase_orders" ALTER COLUMN "tax_rate" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "purchase_orders" DROP COLUMN "tax_type";