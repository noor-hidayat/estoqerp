-- stock_barcodes = isi dari stock_batch: tiap barcode asli (CMS-serial, diambil
-- dari tiap transaksi di stock_movement_details) beserta lokasi gudang terkini.
-- barcode = PK (unik per unit fisik). Tidak ada qty/type. Saat barcode pindah
-- gudang, kolom warehouse_id diperbarui. Sinkron via trigger DB + backfill.
-- Kolom gudang (from/to) ada di stock_movement_details itu sendiri.

-- Lepas dulu trigger & fungsi lama (struktur sebelumnya pakai type/qty/id).
DROP TRIGGER IF EXISTS "trg_stock_barcodes" ON "stock_movement_details";
DROP TRIGGER IF EXISTS "trg_stock_barcodes_balance" ON "stock_balances";
DROP TRIGGER IF EXISTS "trg_stock_barcodes_batch" ON "stock_batches";
DROP TRIGGER IF EXISTS "trg_stock_barcodes_batch_renumber" ON "batches";
DROP FUNCTION IF EXISTS "sync_stock_barcodes"();
DROP FUNCTION IF EXISTS "sync_stock_barcodes_balance"();
DROP FUNCTION IF EXISTS "sync_stock_barcodes_batch"();
DROP FUNCTION IF EXISTS "sync_stock_barcodes_batch_renumber"();
DROP FUNCTION IF EXISTS "next_stock_barcode_id"();
DROP TABLE IF EXISTS "stock_barcodes" CASCADE;

CREATE TABLE IF NOT EXISTS "stock_barcodes" (
	"barcode" text PRIMARY KEY NOT NULL,
	"batch_id" text,
	"warehouse_id" text NOT NULL,
	"item_id" text NOT NULL,
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
 ALTER TABLE "stock_barcodes" ADD CONSTRAINT "stock_barcodes_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_stock_barcodes_wh" ON "stock_barcodes" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_barcodes_batch" ON "stock_barcodes" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stock_barcodes_item" ON "stock_barcodes" USING btree ("item_id");

-- Sinkron dari stock_movement_details: barcode masuk (to_warehouse_id) -> simpan/
-- pindahkan ke gudang tujuan; barcode keluar (from_warehouse_id saja) -> hapus.
-- Kolom gudang ada langsung di baris detail (NEW.to_warehouse_id / NEW.from_warehouse_id).
CREATE OR REPLACE FUNCTION "sync_stock_barcodes"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_to text;
  v_from text;
  v_barcode text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_barcode := OLD.barcode;
    IF v_barcode IS NOT NULL THEN
      DELETE FROM stock_barcodes WHERE barcode = v_barcode;
    END IF;
    RETURN OLD;
  END IF;

  v_barcode := NEW.barcode;
  IF v_barcode IS NULL THEN
    RETURN NEW;
  END IF;

  v_to := NEW.to_warehouse_id;
  v_from := NEW.from_warehouse_id;

  IF v_to IS NOT NULL THEN
    INSERT INTO stock_barcodes (barcode, batch_id, item_id, warehouse_id, updated_at)
      VALUES (v_barcode, NEW.batch_id, NEW.item_id, v_to, now())
      ON CONFLICT (barcode) DO UPDATE SET
        batch_id = EXCLUDED.batch_id,
        item_id = EXCLUDED.item_id,
        warehouse_id = EXCLUDED.warehouse_id,
        updated_at = now();
  ELSIF v_from IS NOT NULL THEN
    DELETE FROM stock_barcodes WHERE barcode = v_barcode;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trg_stock_barcodes" ON "stock_movement_details";
CREATE TRIGGER "trg_stock_barcodes"
  AFTER INSERT OR UPDATE OR DELETE ON "stock_movement_details"
  FOR EACH ROW EXECUTE FUNCTION "sync_stock_barcodes"();

-- Backfill dari transaksi yang sudah ada (gudang dari baris detail).
INSERT INTO stock_barcodes (barcode, batch_id, item_id, warehouse_id, updated_at)
SELECT DISTINCT ON (md.barcode) md.barcode, md.batch_id, md.item_id, md.to_warehouse_id, now()
FROM stock_movement_details md
WHERE md.barcode IS NOT NULL AND md.to_warehouse_id IS NOT NULL
ORDER BY md.barcode, md.created_at DESC
ON CONFLICT (barcode) DO UPDATE SET
  batch_id = EXCLUDED.batch_id,
  item_id = EXCLUDED.item_id,
  warehouse_id = EXCLUDED.warehouse_id,
  updated_at = now();
