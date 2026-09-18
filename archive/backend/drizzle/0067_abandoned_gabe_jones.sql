ALTER TABLE "workflows" DROP CONSTRAINT "workflows_code_unique";--> statement-breakpoint
DROP INDEX "idx_workflows_code";--> statement-breakpoint
ALTER TABLE "workflows" DROP COLUMN "code";