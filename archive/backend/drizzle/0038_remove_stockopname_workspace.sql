-- Hapus workspace Stock Opname (digantikan struktur Warehouse).
-- Dashboard stockopname dipindah ke warehouse; workspace_access & ai_settings ikut CASCADE.
--> statement-breakpoint
UPDATE "dashboards" SET "workspace_id" = (SELECT "id" FROM "workspaces" WHERE "code" = 'warehouse')
WHERE "workspace_id" = (SELECT "id" FROM "workspaces" WHERE "code" = 'stockopname');
--> statement-breakpoint
DELETE FROM "user_settings"
WHERE "key" = 'workspace.activeId'
  AND "value" ->> 'workspaceId' = '11111111-1111-4111-8111-111111111111';
--> statement-breakpoint
DELETE FROM "workspaces" WHERE "code" = 'stockopname';
