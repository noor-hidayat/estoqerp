CREATE TABLE "batch_formats" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "production_date" date;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "expiry_date" date;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "shift" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_records" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "scan_records" ADD CONSTRAINT "scan_records_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE set null ON UPDATE no action;