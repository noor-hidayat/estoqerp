ALTER TABLE "purchase_orders" ADD COLUMN "payment_terms" text;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "currency" text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "exchange_rate" numeric(15, 6) DEFAULT '1' NOT NULL;