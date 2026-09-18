-- Lookup denormalisasi: "barcode X ada di gudang Y berapa qty?" — index tunggal,
-- 0 join. Sinkronisasi dijaga trigger DB (di bawah) + backfill awal
-- (db/backfill-stock-barcodes.ts). Tidak diisi manual dari frontend.
--   - type = ITEM  → barcode = items.code, batch_id = NULL
--   - type = BATCH → barcode = batches.batch_number, batch_id diisi

CREATE TABLE IF NOT EXISTS "stock_barcodes" (
	"id" text PRIMARY KEY NOT NULL,
	"warehouse_id" text NOT NULL,
	"item_id" text NOT NULL,
	"batch_id" text,
	"barcode" text NOT NULL,
	"type" text DEFAULT 'ITEM' NOT NULL,
	"qty" numeric(15,3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
 ALTER TABLE "stock_barcodes" ADD CONSTRAINT "stock_barcodes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "stock_barcodes" ADD CONSTRAINT "stock_barcodes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "stock_barcodes" ADD CONSTRAINT "stock_barcodes_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "stock_barcodes" ADD CONSTRAINT "stock_barcodes_type_check" CHECK (type IN ('ITEM','BATCH'));
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_stock_barcodes_wh_barcode" ON "stock_barcodes" USING btree ("warehouse_id","barcode");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_barcodes_wh_item" ON "stock_barcodes" USING btree ("warehouse_id","item_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_barcodes_batch" ON "stock_barcodes" USING btree ("batch_id");

-- Helper: id serial per-bulan {prefix}-{YYMM}-{0001}, konsisten dengan
-- nextRowId() di aplikasi (LIKE prefix). Dijaga loop anti-kolisi.
CREATE OR REPLACE FUNCTION "next_stock_barcode_id"() RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_id text;
  v_serial int;
BEGIN
  LOOP
    SELECT COALESCE(MAX(SUBSTRING(id FROM 10)::int), 0) + 1
      INTO v_serial
      FROM stock_barcodes
      WHERE id LIKE 'sbc-' || to_char(now(), 'YYMM') || '-%';
    v_id := 'sbc-' || to_char(now(), 'YYMM') || '-' || lpad(v_serial::text, 4, '0');
    IF NOT EXISTS (SELECT 1 FROM stock_barcodes WHERE id = v_id) THEN
      RETURN v_id;
    END IF;
  END LOOP;
END;
$$;

-- Sinkron dari stock_balances → baris ITEM (barcode = item.code)
CREATE OR REPLACE FUNCTION "sync_stock_barcodes_balance"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
  v_qty numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM stock_barcodes
      WHERE warehouse_id = OLD.warehouse_id AND item_id = OLD.item_id AND type = 'ITEM';
    RETURN OLD;
  END IF;

  SELECT code INTO v_code FROM items WHERE id = NEW.item_id;
  IF v_code IS NULL THEN RETURN NEW; END IF;
  v_qty := NEW.closing_qty;

  IF v_qty > 0 THEN
    INSERT INTO stock_barcodes (id, warehouse_id, item_id, batch_id, barcode, type, qty, updated_at)
      VALUES (next_stock_barcode_id(), NEW.warehouse_id, NEW.item_id, NULL, v_code, 'ITEM', v_qty, now())
      ON CONFLICT (warehouse_id, barcode) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();
  ELSE
    DELETE FROM stock_barcodes
      WHERE warehouse_id = NEW.warehouse_id AND item_id = NEW.item_id AND type = 'ITEM';
  END IF;
  RETURN NEW;
END;
$$;

-- Sinkron dari stock_batches → baris BATCH (barcode = batch_number)
CREATE OR REPLACE FUNCTION "sync_stock_barcodes_batch"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_code text;
  v_item text;
  v_qty numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM stock_barcodes
      WHERE warehouse_id = OLD.warehouse_id AND batch_id = OLD.batch_id AND type = 'BATCH';
    RETURN OLD;
  END IF;

  SELECT batch_number, item_id INTO v_code, v_item FROM batches WHERE id = NEW.batch_id;
  IF v_code IS NULL OR v_item IS NULL THEN RETURN NEW; END IF;
  v_qty := NEW.qty;

  IF v_qty > 0 THEN
    INSERT INTO stock_barcodes (id, warehouse_id, item_id, batch_id, barcode, type, qty, updated_at)
      VALUES (next_stock_barcode_id(), NEW.warehouse_id, v_item, NEW.batch_id, v_code, 'BATCH', v_qty, now())
      ON CONFLICT (warehouse_id, barcode) DO UPDATE SET qty = EXCLUDED.qty, batch_id = EXCLUDED.batch_id, updated_at = now();
  ELSE
    DELETE FROM stock_barcodes
      WHERE warehouse_id = NEW.warehouse_id AND batch_id = NEW.batch_id AND type = 'BATCH';
  END IF;
  RETURN NEW;
END;
$$;

-- Saat batch_number diubah → perbarui barcode baris BATCH terkait
CREATE OR REPLACE FUNCTION "sync_stock_barcodes_batch_renumber"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.batch_number = OLD.batch_number THEN RETURN NEW; END IF;
  DELETE FROM stock_barcodes WHERE batch_id = NEW.id AND type = 'BATCH';
  INSERT INTO stock_barcodes (id, warehouse_id, item_id, batch_id, barcode, type, qty, updated_at)
    SELECT next_stock_barcode_id(), sb.warehouse_id, NEW.item_id, NEW.id, NEW.batch_number, 'BATCH', sb.qty, now()
    FROM stock_batches sb WHERE sb.batch_id = NEW.id AND sb.qty > 0
    ON CONFLICT (warehouse_id, barcode) DO UPDATE SET qty = EXCLUDED.qty, updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_stock_barcodes_balance" ON "stock_balances";
CREATE TRIGGER "trg_stock_barcodes_balance"
  AFTER INSERT OR UPDATE OR DELETE ON "stock_balances"
  FOR EACH ROW EXECUTE FUNCTION "sync_stock_barcodes_balance"();

DROP TRIGGER IF EXISTS "trg_stock_barcodes_batch" ON "stock_batches";
CREATE TRIGGER "trg_stock_barcodes_batch"
  AFTER INSERT OR UPDATE OR DELETE ON "stock_batches"
  FOR EACH ROW EXECUTE FUNCTION "sync_stock_barcodes_batch"();

DROP TRIGGER IF EXISTS "trg_stock_barcodes_batch_renumber" ON "batches";
CREATE TRIGGER "trg_stock_barcodes_batch_renumber"
  AFTER UPDATE OF "batch_number" ON "batches"
  FOR EACH ROW EXECUTE FUNCTION "sync_stock_barcodes_batch_renumber"();
