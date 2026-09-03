ALTER TABLE "items" ADD COLUMN "is_finish_good" boolean DEFAULT false NOT NULL;
CREATE INDEX "idx_items_is_finish_good" ON "items" ("is_finish_good");
--> statement-breakpoint
UPDATE "items" SET "is_finish_good" = true WHERE "item_group_id" IN (SELECT "id" FROM "item_groups" WHERE "name" ILIKE '%jadi%' OR "name" ILIKE '%finish%' OR "code" ILIKE '%FG%');
