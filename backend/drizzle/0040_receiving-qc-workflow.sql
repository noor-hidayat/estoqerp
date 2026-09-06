ALTER TABLE "receiving_lines" ADD COLUMN "qty_accepted" numeric(15, 3);--> statement-breakpoint
ALTER TABLE "receiving_lines" ADD COLUMN "qty_rejected" numeric(15, 3);--> statement-breakpoint
ALTER TABLE "receiving_lines" ADD COLUMN "reject_reason" text;--> statement-breakpoint
ALTER TABLE "receivings" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivings" ADD COLUMN "submitted_by" bigint;--> statement-breakpoint
ALTER TABLE "receivings" ADD COLUMN "qc_inspected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "receivings" ADD COLUMN "qc_inspected_by" bigint;--> statement-breakpoint
ALTER TABLE "receivings" ADD COLUMN "qc_notes" text;--> statement-breakpoint
ALTER TABLE "receivings" ADD CONSTRAINT "receivings_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivings" ADD CONSTRAINT "receivings_qc_inspected_by_users_id_fk" FOREIGN KEY ("qc_inspected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;