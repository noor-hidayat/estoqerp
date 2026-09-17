// @ts-nocheck
// Seed dashboard per workspace: "Warehouse Overview", "Purchasing Overview",
// "Marketing Overview" — masing-masing diisi widget dari WIDGET_TEMPLATES
// yang workspaceId-nya cocok ("wsp-" + workspace.code).
// Idempotent, bisa dijalankan ulang: dashboard bawaan di-reset (widget lama
// dihapus, diisi ulang dari template terbaru); dashboard kustom lain tak tersentuh.
// Jalankan: npm run db:seed-dashboards -w backend
import { and, eq } from "drizzle-orm";
import { db, pool } from "./pool";
import { dashboards, dashboardWidgets, workspaces } from "./schema";
import { WIDGET_TEMPLATES } from "../lib/dashboard-templates";

const TARGETS = [
  // Warehouse: hanya widget WH (stock_balances/movement/delivery). Widget
  // opname_scan_details dikecualikan — dashboard Stock Opname khusus menyusul.
  { code: "warehouse", name: "Warehouse Overview", excludeFactTables: ["opname_scan_details"] },
  { code: "purchasing", name: "Purchasing Overview", excludeFactTables: [] },
  { code: "marketing", name: "Marketing Overview", excludeFactTables: [] },
];

async function seedOne(code: string, name: string, excludeFactTables: string[] = []) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.code, code)).limit(1);
  if (!ws) {
    console.log(`Workspace code=${code} tidak ditemukan, skip.`);
    return;
  }
  // Template pakai key "wsp-<code>" (bukan numeric id) — lihat dashboard-templates.ts
  const key = `wsp-${ws.code}`;
  const templates = WIDGET_TEMPLATES.filter(
    (t) => t.workspaceId === key && !excludeFactTables.includes(t.config.factTable)
  );
  console.log(`Workspace: ${ws.id} (${ws.code}) - ${ws.name} | templates: ${templates.length}`);

  const [found] = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.workspaceId, ws.id), eq(dashboards.name, name)))
    .limit(1);

  let dashboardId: number;
  if (found) {
    dashboardId = found.id;
    const existing = await db
      .select({ id: dashboardWidgets.id })
      .from(dashboardWidgets)
      .where(eq(dashboardWidgets.dashboardId, dashboardId));
    console.log(`  Dashboard "${name}" sudah ada -> hapus ${existing.length} widget lama`);
    if (existing.length) {
      await db.delete(dashboardWidgets).where(eq(dashboardWidgets.dashboardId, dashboardId));
    }
    await db.update(dashboards).set({ isGlobal: false }).where(eq(dashboards.id, dashboardId));
  } else {
    const [ins] = await db
      .insert(dashboards)
      .values({ name, workspaceId: ws.id, isGlobal: false, ownerId: null, branchId: null })
      .returning({ id: dashboards.id });
    dashboardId = ins.id;
    console.log(`  Buat dashboard "${name}" id=${dashboardId}`);
  }

  // Layout grid 12 kolom, packing per baris
  let cursorY = 0;
  let cursorX = 0;
  let rowMaxH = 0;
  for (const tpl of templates) {
    const w = tpl.defaultLayout.w;
    const h = tpl.defaultLayout.h;
    if (cursorX + w > 12 + 1e-9) {
      cursorX = 0;
      cursorY += rowMaxH;
      rowMaxH = 0;
    }
    const layout = { x: Math.round(cursorX * 10) / 10, y: cursorY, w, h };
    cursorX = Math.round((cursorX + w) * 10) / 10;
    rowMaxH = Math.max(rowMaxH, h);
    await db.insert(dashboardWidgets).values({
      dashboardId,
      type: tpl.type,
      config: { templateId: tpl.id, title: tpl.title },
      layout,
    });
    console.log(`  + widget ${tpl.id} (${tpl.type}) layout x${layout.x} y${layout.y} w${w} h${h}`);
  }
  console.log(`  Selesai: "${name}" dengan ${templates.length} widgets.`);
}

async function main() {
  for (const t of TARGETS) {
    await seedOne(t.code, t.name, t.excludeFactTables);
  }
}

main()
  .catch((e) => {
    console.error("Seed dashboards gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
