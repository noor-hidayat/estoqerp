ALTER TABLE "purchase_orders" ADD COLUMN "current_approval_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "approval_workflow_id" bigint;