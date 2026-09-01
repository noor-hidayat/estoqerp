-- Item valuation: standard_cost manual + valuation_rate auto (global moving average)
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "standard_cost" numeric(15, 2);
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "valuation_rate" numeric(15, 2) DEFAULT '0' NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_movement_details" ADD COLUMN IF NOT EXISTS "incoming_rate" numeric(15, 2);
--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "valuation_rate" numeric(15, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "stock_value" numeric(15, 2) DEFAULT '0' NOT NULL;
