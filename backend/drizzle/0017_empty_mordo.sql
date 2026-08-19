ALTER TABLE "categories" RENAME TO "item_groups";--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "item_groups" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "item_groups" ("id", "code", "name", "is_active", "created_at", "updated_at")
SELECT "id", "code", "name", "is_active", "created_at", "updated_at"
FROM "groups"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_group_id_groups_id_fk";--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_category_id_categories_id_fk";--> statement-breakpoint
ALTER TABLE "items" RENAME COLUMN "category_id" TO "item_group_id";--> statement-breakpoint
UPDATE "items" SET "item_group_id" = "group_id" WHERE "group_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "group_id";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_item_group_id_item_groups_id_fk" FOREIGN KEY ("item_group_id") REFERENCES "public"."item_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
DROP TABLE "groups";--> statement-breakpoint
UPDATE "role_permissions" SET "menu" = 'master.itemGroups' WHERE "menu" = 'master.categories';--> statement-breakpoint
UPDATE "barcode_formats" SET "segments" = (
  SELECT jsonb_agg(
    CASE
      WHEN seg->>'field' = 'CATEGORY' THEN seg - 'field' || jsonb_build_object('field', 'ITEM_GROUP')
      ELSE seg
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements("segments") WITH ORDINALITY AS t(seg, ord)
) WHERE "segments" @> '[{"field":"CATEGORY"}]';
