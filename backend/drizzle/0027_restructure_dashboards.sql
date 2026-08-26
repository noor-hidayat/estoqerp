-- Restructure `dashboards` for the customizable per-widget model and add `dashboard_widgets`.

ALTER TABLE "dashboards" DROP COLUMN IF EXISTS "slug";
ALTER TABLE "dashboards" DROP COLUMN IF EXISTS "description";
ALTER TABLE "dashboards" DROP COLUMN IF EXISTS "is_default";
ALTER TABLE "dashboards" DROP COLUMN IF EXISTS "layout";
ALTER TABLE "dashboards" DROP COLUMN IF EXISTS "created_by";
ALTER TABLE "dashboards" DROP COLUMN IF EXISTS "updated_at";

ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "owner_id" text;
ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "branch_id" text;
ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "is_global" boolean DEFAULT true NOT NULL;

DO $$ BEGIN
 ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "dashboard_widgets" (
 "id" text PRIMARY KEY NOT NULL,
 "dashboard_id" text NOT NULL,
 "type" text NOT NULL,
 "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_dashboard_widgets_dashboard" ON "dashboard_widgets" USING btree ("dashboard_id");

-- Indexes for efficient widget aggregation on stock_ledger (~100k txn/month)
CREATE INDEX IF NOT EXISTS "idx_stock_ledger_wh_date" ON "stock_ledger" USING btree ("warehouse_id", "transaction_date");
