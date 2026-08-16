ALTER TABLE "stock_balances" ADD COLUMN "unit" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD COLUMN "category_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "stock_balances" AS "sb"
SET
  "unit" = "i"."unit",
  "category_name" = "c"."name"
FROM "items" AS "i"
LEFT JOIN "categories" AS "c" ON "c"."id" = "i"."category_id"
WHERE "sb"."item_id" = "i"."id";