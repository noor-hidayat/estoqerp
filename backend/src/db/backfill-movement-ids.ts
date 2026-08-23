// Backfill id stock_movements ke nomor series (minimal 4 digit), sekali jalan.
// Harus dijalankan SELURUHnya SEBELUM migrasi yang menghapus kolom
// movement_number. Strategi: drop FK child sementara, repad nomor lama ke
// 4 digit, update referensi child + ledger, update PK, pasang FK kembali.
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, pool } from "./pool";
import * as schema from "./schema";

async function main() {
  await db.transaction(async (tx) => {
    // 1) Drop FK child ke stock_movements sementara.
    const fks = await tx.execute<{ tbl: string; con: string }>(sql`
      SELECT conrelid::regclass::text AS tbl, conname AS con
      FROM pg_constraint
      WHERE contype = 'f' AND confrelid = 'stock_movements'::regclass
    `);
    for (const fk of fks.rows) {
      const tbl = String(fk.tbl).replace(/^public\./, "");
      await tx.execute(sql.raw(`ALTER TABLE ${tbl} DROP CONSTRAINT ${fk.con};`));
    }

    // 2) Repad trailing number ke 4 digit pada movement_number yang masih ada.
    await tx.execute(sql`
      UPDATE stock_movements
      SET movement_number = regexp_replace(
        movement_number,
        '(\\d+)$',
        lpad(substring(movement_number from '(\\d+)$'), 4, '0')
      )
    `);

    // 3) Update referensi child + ledger ke movement_number (nilai baru).
    await tx.execute(sql`
      UPDATE stock_movement_details d
      SET movement_id = m.movement_number
      FROM stock_movements m
      WHERE d.movement_id = m.id
    `);
    await tx.execute(sql`
      UPDATE stock_ledger l
      SET transaction_id = m.movement_number
      FROM stock_movements m
      WHERE l.transaction_id = m.id
    `);

    // 4) Update PK stock_movements ke movement_number.
    await tx.execute(sql`
      UPDATE stock_movements SET id = movement_number
    `);

    // 5) Pasang kembali FK child.
    for (const fk of fks.rows) {
      const tbl = String(fk.tbl).replace(/^public\./, "");
      await tx.execute(
        sql.raw(
          `ALTER TABLE ${tbl} ADD CONSTRAINT ${fk.con} FOREIGN KEY (movement_id) REFERENCES stock_movements(id) ON DELETE CASCADE;`
        )
      );
    }
  });

  console.log("Backfill id transaksi selesai — semua id pakai nomor series 4 digit.");
}

main()
  .catch((e) => {
    console.error("Backfill gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
