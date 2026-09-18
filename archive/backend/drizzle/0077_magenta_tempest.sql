ALTER TABLE "purchase_requests" DROP CONSTRAINT "purchase_requests_supplier_id_suppliers_id_fk";
--> statement-breakpoint
DROP INDEX "idx_purchase_requests_supplier";--> statement-breakpoint
ALTER TABLE "purchase_requests" DROP COLUMN "supplier_id";