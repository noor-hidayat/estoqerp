CREATE TABLE IF NOT EXISTS "branch_access" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branch_access_role_id_roles_id_fk') THEN
		ALTER TABLE "branch_access" ADD CONSTRAINT "branch_access_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_branch_access" ON "branch_access" USING btree ("role_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_branch_access_role" ON "branch_access" USING btree ("role_id");--> statement-breakpoint
DROP TABLE IF EXISTS "user_accesses";--> statement-breakpoint
DROP TABLE IF EXISTS "role_accesses";
