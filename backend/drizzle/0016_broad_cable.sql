ALTER TABLE "movement_types" ADD COLUMN "kind" text DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE "movement_types" ADD COLUMN "series" text DEFAULT 'SMV' NOT NULL;--> statement-breakpoint
ALTER TABLE "movement_types" ADD COLUMN "builtin" boolean DEFAULT false NOT NULL;