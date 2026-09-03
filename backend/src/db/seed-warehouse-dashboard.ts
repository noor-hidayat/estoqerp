// Seed dashboard warehouse: 1 dashboard "Warehouse Overview" untuk wsp-warehouse
// berisi 6 widget template warehouse (idempotent, bisa dijalankan ulang)
// Jalankan: npm run db:seed-warehouse-dashboard -w backend
import { eq } from "drizzle-orm";
import { db, pool } from "./pool";
import { dashboards, dashboardWidgets, workspaces } from "./schema";
import { WIDGET_TEMPLATES } from "../lib/dashboard-templates";
import { nextRowId } from "../lib/id";

const WORKSPACE_CODE = "warehouse"; // wsp-warehouse
const DASHBOARD_NAME = "Warehouse Overview";

async function main() {
  // Cari workspace warehouse
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.code, WORKSPACE_CODE)).limit(1);
  if (!ws) throw new Error(`Workspace code=${WORKSPACE_CODE} tidak ditemukan. Jalankan migrasi dulu.`);
  console.log(`Workspace: ${ws.id} (${ws.code}) - ${ws.name}`);

  // Cek dashboard sudah ada?
  const [existing] = await db
    .select()
    .from(dashboards)
    .where(eq(dashboards.workspaceId, ws.id))
    .limit(10);
  // Cari by name + workspace
  const { eq: eq2, and } = await import("drizzle-orm");
  const found = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.workspaceId, ws.id), eq(dashboards.name, DASHBOARD_NAME)))
    .limit(1);
  let dashboardId: string;
  if (found.length) {
    dashboardId = found[0].id;
    console.log(`Dashboard sudah ada: ${dashboardId} "${DASHBOARD_NAME}" -> kosongkan dulu`);
    const existingWidgets = await db.select().from(dashboardWidgets).where(eq(dashboardWidgets.dashboardId, dashboardId));
    console.log(`  Hapus ${existingWidgets.length} widgets lama`);
    if (existingWidgets.length) {
      await db.delete(dashboardWidgets).where(eq(dashboardWidgets.dashboardId, dashboardId));
    }
    await db.update(dashboards).set({ isGlobal: false }).where(eq(dashboards.id, dashboardId));
    // Isi ulang dengan 5 KPI baru
    const templates = WIDGET_TEMPLATES.filter((t) => t.workspaceId === ws.id);
    console.log(`Templates warehouse (baru): ${templates.map((t) => t.id).join(", ")}`);
    let cursorY = 0;
    let cursorX = 0;
    for (const tpl of templates) {
      const w = tpl.defaultLayout.w;
      const h = tpl.defaultLayout.h;
      if (cursorX + w > 12 + 1e-9) {
        cursorX = 0;
        cursorY += 4;
      }
      const layout = { x: Math.round(cursorX * 10) / 10, y: cursorY, w, h };
      cursorX = Math.round((cursorX + w) * 10) / 10;
      const wId = await nextRowId(db, dashboardWidgets, "wgt", new Date());
      await db.insert(dashboardWidgets).values({
        id: wId,
        dashboardId,
        type: tpl.type,
        config: { templateId: tpl.id, title: tpl.title },
        layout,
      });
      console.log(`  + widget ${tpl.id} (${tpl.type}) -> ${wId} layout x${layout.x} y${layout.y} w${w} h${h}`);
    }
    console.log(`Selesai reset: dashboard ${dashboardId} dengan ${templates.length} widgets.`);
    return;
  }

  // Buat dashboard baru
  const dashId = await nextRowId(db, dashboards, "dsb", new Date());
  await db.insert(dashboards).values({
    id: dashId,
    name: DASHBOARD_NAME,
    workspaceId: ws.id,
    isGlobal: false, // hanya muncul di workspace warehouse
    ownerId: null,
    branchId: null,
  });
  console.log(`Buat dashboard: ${dashId} "${DASHBOARD_NAME}" workspaceId=${ws.id} isGlobal=false`);

  const templates = WIDGET_TEMPLATES.filter((t) => t.workspaceId === ws.id);
  console.log(`Templates warehouse: ${templates.length}`);

  // Layout sederhana: grid 12 kolom, susun berurutan
  // Row1: kpi w3 + bar w6 + pie w4 = 13 -> wrap, jadi row1: kpi(0,0,3,4) bar(3,0,6,8) pie(9,0,3,8) truncated? pakai default
  // Simpler: pakai layout per template dengan y = cumulative
  let cursorY = 0;
  let cursorX = 0;
  for (const tpl of templates) {
    const w = tpl.defaultLayout.w;
    const h = tpl.defaultLayout.h;
    if (cursorX + w > 12 + 1e-9) {
      cursorX = 0;
      cursorY += 8; // tinggi baris default
    }
    const layout = { x: Math.round(cursorX * 10) / 10, y: cursorY, w, h };
    cursorX = Math.round((cursorX + w) * 10) / 10;
    // Jika row penuh, next iteration akan wrap

    const wId = await nextRowId(db, dashboardWidgets, "wgt", new Date());
    await db.insert(dashboardWidgets).values({
      id: wId,
      dashboardId: dashId,
      type: tpl.type,
      config: { templateId: tpl.id, title: tpl.title },
      layout,
    });
    console.log(`  widget ${tpl.id} (${tpl.type}) -> ${wId} layout x${layout.x} y${layout.y} w${w} h${h}`);
  }

  console.log(`Selesai: dashboard ${dashId} dengan ${templates.length} widgets.`);
}

main()
  .catch((e) => {
    console.error("Seed warehouse dashboard gagal:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
