ALTER TABLE "scan_records" DROP CONSTRAINT "scan_records_item_id_items_id_fk";
--> statement-breakpoint
ALTER TABLE "scan_records" ADD CONSTRAINT "scan_records_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;