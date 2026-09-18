CREATE TABLE "role_permissions" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"menu" text NOT NULL,
	"action" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_accesses" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'role_sys_admin';--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_accesses" ADD CONSTRAINT "user_accesses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_permissions" ON "role_permissions" USING btree ("role_id","menu","action");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_accesses" ON "user_accesses" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_user_accesses_user" ON "user_accesses" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "branch_id";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "warehouse_id";