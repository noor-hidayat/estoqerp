--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_wh_item" ON "stock_ledger" USING btree ("warehouse_id","item_id");
--> statement-breakpoint
CREATE INDEX "idx_stock_ledger_wh_item_date" ON "stock_ledger" USING btree ("warehouse_id","item_id","transaction_date","created_at","id");
