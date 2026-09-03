import { sql } from "drizzle-orm";
import { db, pool } from "./pool";

async function main() {
  console.log("=== Hapus semua data dummy (preserve branches, warehouses, users, workspaces, roles, movement_types) ===");

  // Urutan truncate dengan CASCADE agar FK aman. Keep: users, branches, warehouses, workspaces, roles, movement_types, dashboards, etc.
  const tables = [
    "opname_count_details",
    "opname_counts",
    "opname_scan_details",
    "opname_scans",
    "opname_warehouses",
    "opname_projects",
    "stock_ledger",
    "stock_movement_details",
    "stock_movements",
    "delivery_lines",
    "deliveries",
    "goods_receipt_lines",
    "goods_receipts",
    "sales_order_lines",
    "sales_orders",
    "purchase_order_lines",
    "purchase_orders",
    "stock_barcodes",
    "stock_batches",
    "batches",
    "stock_balances",
    "suppliers",
    "customers",
    "locations",
    "items",
    "item_groups",
    "uom",
  ];

  // Cek count sebelum
  console.log("\n-- Count sebelum --");
  for (const t of ["branches","warehouses","users","workspaces","roles","movement_types","suppliers","customers","items","stock_balances","batches","purchase_orders","sales_orders","goods_receipts","deliveries","stock_movements","stock_ledger","opname_projects"]) {
    try {
      const r: any = await db.execute(sql.raw(`SELECT count(*)::int as n FROM ${t}`));
      const n = r.rows?.[0]?.n ?? r[0]?.n ?? "?";
      console.log(`  ${t}: ${n}`);
    } catch (e: any) {
      console.log(`  ${t}: err ${e.message}`);
    }
  }

  console.log(`\nTruncate ${tables.join(", ")} ...`);
  // TRUNCATE dengan RESTART IDENTITY untuk reset serial, CASCADE untuk FK
  const list = tables.map(t => `"${t}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE ${list} RESTART IDENTITY CASCADE`));
  console.log("TRUNCATE selesai.");

  // Pastikan branches, warehouses, users tetap
  console.log("\n-- Count sesudah --");
  for (const t of ["branches","warehouses","users","workspaces","roles","movement_types","suppliers","customers","items","stock_balances","batches","purchase_orders","sales_orders","goods_receipts","deliveries","stock_movements","stock_ledger","opname_projects","locations","uom","item_groups"]) {
    try {
      const r: any = await db.execute(sql.raw(`SELECT count(*)::int as n FROM ${t}`));
      const n = r.rows?.[0]?.n ?? r[0]?.n ?? "?";
      console.log(`  ${t}: ${n}`);
    } catch (e: any) {
      console.log(`  ${t}: err ${e.message}`);
    }
  }

  console.log("\nSelesai. Branches, warehouses, users, workspaces, roles, movement_types tetap. Dummy lain 0.");
}

main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await pool.end(); });
