-- PO line delivery date per item
ALTER TABLE "purchase_order_lines" ADD COLUMN IF NOT EXISTS "delivery_date" date;
