ALTER TABLE "workflows" ADD COLUMN "status" text DEFAULT 'DRAFT' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_workflows_status" ON "workflows" USING btree ("status");