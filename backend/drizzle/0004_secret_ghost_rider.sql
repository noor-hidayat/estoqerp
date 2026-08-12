CREATE TABLE "role_accesses" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_accesses" ADD CONSTRAINT "role_accesses_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_accesses" ON "role_accesses" USING btree ("role_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_role_accesses_role" ON "role_accesses" USING btree ("role_id");