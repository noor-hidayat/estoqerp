ALTER TABLE "stock_balances" RENAME COLUMN "qty" TO "closing_qty";--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "balance_date" date NOT NULL DEFAULT CURRENT_DATE;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "opening_qty" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "in_qty" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "out_qty" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "created_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "updated_at" timestamp with time zone NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "stock_balances" DROP COLUMN "warehouse_name";--> statement-breakpoint
ALTER TABLE "stock_balances" DROP COLUMN "item_name";--> statement-breakpoint
ALTER TABLE "stock_balances" DROP COLUMN "item_code";--> statement-breakpoint
ALTER TABLE "stock_balances" DROP COLUMN "unit";--> statement-breakpoint
ALTER TABLE "stock_balances" DROP COLUMN "category_name";