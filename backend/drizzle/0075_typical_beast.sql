ALTER TABLE "departments" DROP CONSTRAINT "departments_name_unique";--> statement-breakpoint
ALTER TABLE "departments" ADD COLUMN "code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_code_unique" UNIQUE("code");