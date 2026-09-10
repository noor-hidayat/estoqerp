ALTER TABLE "price_list_lines" DROP CONSTRAINT "price_list_lines_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "price_list_lines" DROP CONSTRAINT "price_list_lines_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "price_lists" DROP CONSTRAINT "price_lists_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "price_lists" DROP CONSTRAINT "price_lists_customer_id_customers_id_fk";
--> statement-breakpoint
DROP INDEX "idx_price_list_lines_type";--> statement-breakpoint
DROP INDEX "idx_price_list_lines_supplier";--> statement-breakpoint
DROP INDEX "idx_price_list_lines_customer";--> statement-breakpoint
DROP INDEX "idx_price_lists_type";--> statement-breakpoint
DROP INDEX "idx_price_lists_supplier";--> statement-breakpoint
DROP INDEX "idx_price_lists_customer";--> statement-breakpoint
ALTER TABLE "price_list_lines" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "price_list_lines" DROP COLUMN "supplier_id";--> statement-breakpoint
ALTER TABLE "price_list_lines" DROP COLUMN "customer_id";--> statement-breakpoint
ALTER TABLE "price_lists" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "price_lists" DROP COLUMN "supplier_id";--> statement-breakpoint
ALTER TABLE "price_lists" DROP COLUMN "customer_id";