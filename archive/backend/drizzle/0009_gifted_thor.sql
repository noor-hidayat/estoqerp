CREATE TABLE "opname_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline" timestamp with time zone,
	"created_by" text
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "opname_projects" ADD CONSTRAINT "opname_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_id_opname_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."opname_projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_projects_project_id" ON "projects" USING btree ("project_id");