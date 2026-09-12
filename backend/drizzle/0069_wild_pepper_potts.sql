ALTER TABLE "warehouses" ADD COLUMN "parent_id" bigint;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "pic_name" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "pic_phone" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "pic_email" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_parent_id_warehouses_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_warehouses_parent" ON "warehouses" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_warehouses_branch_parent" ON "warehouses" USING btree ("branch_id","parent_id");