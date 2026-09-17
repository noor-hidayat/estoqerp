-- Workspaces + per-role access + dashboard/ai per workspace
CREATE TABLE "workspaces" (
  "id" text PRIMARY KEY NOT NULL,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "description" text,
  "icon" text DEFAULT 'Layers' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE "workspace_access" (
  "id" text PRIMARY KEY NOT NULL,
  "role_id" text NOT NULL REFERENCES "roles"("id") ON DELETE CASCADE,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  CONSTRAINT "uq_workspace_access" UNIQUE("role_id","workspace_id")
);
CREATE INDEX "idx_workspace_access_role" ON "workspace_access" USING btree ("role_id");
CREATE INDEX "idx_workspace_access_ws" ON "workspace_access" USING btree ("workspace_id");
ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "idx_dashboards_workspace" ON "dashboards" USING btree ("workspace_id");
ALTER TABLE "ai_settings" ADD COLUMN IF NOT EXISTS "workspace_id" text REFERENCES "workspaces"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_ai_settings_workspace" ON "ai_settings" USING btree ("workspace_id");
--> statement-breakpoint
INSERT INTO "workspaces" ("id","code","name","description","icon","sort_order") VALUES
  ('wsp-stockopname','stockopname','Stock Opname','Project, Scan & Laporan Opname','ClipboardList',1),
  ('wsp-warehouse','warehouse','Warehouse','Stok, Ledger & Master Gudang','Warehouse',2),
  ('wsp-purchasing','purchasing','Purchasing','Supplier, PO & Goods Receipt','ShoppingCart',3),
  ('wsp-marketing','marketing','Marketing','Customer & Sales Order','Megaphone',4)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
-- Default: semua role existing dapat semua workspace (biar tidak lockout), admin bisa kurangi nanti
INSERT INTO "workspace_access" ("id","role_id","workspace_id")
SELECT 'wsa-' || substr(md5(roles.id || workspaces.id),1,8), roles.id, workspaces.id
FROM roles CROSS JOIN workspaces
ON CONFLICT DO NOTHING;
