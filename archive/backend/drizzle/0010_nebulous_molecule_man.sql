ALTER TABLE "stock_balances" ADD COLUMN "warehouse_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "item_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "item_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "stock_balances" AS "sb"
SET
  "warehouse_name" = "w"."name",
  "item_name" = "i"."name",
  "item_code" = "i"."code"
FROM "warehouses" AS "w", "items" AS "i"
WHERE "sb"."warehouse_id" = "w"."id" AND "sb"."item_id" = "i"."id";