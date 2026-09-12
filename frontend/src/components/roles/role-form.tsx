import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useErrorToast } from "@/hooks/use-error-toast";
import {
  useRoles,
  useRolePermissions,
  useBranchAccesses,
  useBranches,
  useAllWarehouses,
  useLocations,
  useWorkspaces,
  useWorkspaceAccesses,
  useInsert,
  useUpdate,
  useRemove,
} from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { cx } from "@/lib/utils";
import type { Role, RolePermission, BranchAccess, WorkspaceAccess } from "@/types";
import { EntityAccess, type CheckedIds } from "@/components/access/entity-access";
import {
  WORKSPACES,
  NAV,
  WAREHOUSE_NAV,
  PURCHASING_NAV,
  MARKETING_NAV,
  QUALITY_NAV,
} from "@/components/app-shell/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormActions,
} from "@/components/ui/form-page";

interface MenuItem {
  key: string;
  label: string;
  parent?: boolean;
  /** Menu punya tombol Export — aksi Export hanya tampil di sini. */
  supportsExport?: boolean;
  /** Menu punya tombol Import — aksi Import hanya tampil di sini. */
  supportsImport?: boolean;
}

interface MenuGroup {
  /** Kunci menu induk — gerbang akses untuk seluruh isi grup. */
  masterKey: string;
  title: string;
  menus: MenuItem[];
}

const MENU_GROUPS: MenuGroup[] = [
  {
    masterKey: "dashboard",
    title: "Dashboard",
    menus: [{ key: "dashboard", label: "Dashboard" }],
  },
  {
    masterKey: "ai",
    title: "AI Assistant",
    menus: [{ key: "ai", label: "AI Assistant" }],
  },
  {
    masterKey: "inventory.transactions",
    title: "Transaction",
    menus: [{ key: "inventory.transactions", label: "Transactions" }],
  },
  {
    masterKey: "inbound",
    title: "Inbound",
    menus: [
      { key: "supply.suppliers", label: "Suppliers" },
      { key: "supply.purchaseOrders", label: "Purchase Orders / Receiving" },
      { key: "supply.goodsReceipts", label: "Goods Receipts / GRN / Putaway" },
    ],
  },
  {
    masterKey: "outbound",
    title: "Outbound",
    menus: [
      { key: "supply.customers", label: "Customers" },
      { key: "supply.salesOrders", label: "Sales Orders" },
      { key: "supply.deliveries", label: "Deliveries / Dispatch / Picking" },
    ],
  },
  {
    masterKey: "inventory",
    title: "Inventory",
    menus: [
      { key: "inventory", label: "Inventory", parent: true },
      { key: "inventory.stockBalance", label: "Stock Balance", supportsExport: true },
      { key: "inventory.stockLedger", label: "Stock Ledger", supportsExport: true },
      { key: "inventory.batches", label: "Batches / Lot" },
    ],
  },
  {
    masterKey: "opname",
    title: "Stock Opname",
    menus: [
      { key: "opname", label: "Stock Opname", parent: true },
      { key: "opname.new", label: "Create Stock Opname" },
      { key: "opname.variance", label: "Variance Review" },
      { key: "opname.detail", label: "Stock Opname Details" },
      { key: "opname.detail.scan", label: "Scan" },
      { key: "opname.detail.sessions", label: "Scan Sessions" },
      { key: "opname.detail.sessions.detail", label: "Session Details" },
      { key: "opname.detail.variance", label: "Stock Opname Variance" },
    ],
  },
  {
    masterKey: "reports",
    title: "Reports",
    menus: [
      { key: "reports", label: "Reports", parent: true },
      { key: "reports.project", label: "Report per Stock Opname", supportsExport: true },
      { key: "reports.summary", label: "Summary Report", supportsExport: true },
      { key: "reports.history", label: "Scan History", supportsExport: true },
      { key: "reports.variance", label: "Variance Report", supportsExport: true },
    ],
  },
  {
    masterKey: "settings",
    title: "Settings",
    menus: [
      { key: "settings", label: "Settings", parent: true },
      { key: "settings.users", label: "Users" },
      { key: "settings.roles", label: "Roles" },
      { key: "settings.roles.new", label: "Add Role" },
      { key: "settings.roles.edit", label: "Edit Role" },
      { key: "settings.workflows", label: "Approval Workflows" },
      { key: "settings.company", label: "Company Settings" },
      { key: "settings.import", label: "Import Data", supportsImport: true },
      { key: "settings.columnWidth", label: "Adjust Table Columns" },
    ],
  },
  {
    masterKey: "setup",
    title: "Setup",
    menus: [
      { key: "master", label: "Master", parent: true },
      { key: "master.items", label: "Item List" },
      { key: "master.itemGroups", label: "Item Groups" },
      { key: "master.uom", label: "UOM" },
      { key: "master.barcodeFormats", label: "Barcode Formats" },
      { key: "master.barcodeFormats.new", label: "New Barcode Format" },
      { key: "master.barcodeFormats.edit", label: "Edit Barcode Format" },
      { key: "master.batchFormats", label: "Batch Formats" },
      { key: "master.batchFormats.new", label: "New Batch Format" },
      { key: "master.batchFormats.edit", label: "Edit Batch Format" },
      { key: "master.movementTypes", label: "Transaction Types" },
      { key: "inventory.branches", label: "Branches" },
      { key: "inventory.warehouses", label: "Warehouses" },
      { key: "inventory.locations", label: "Locations" },
    ],
  },
];

// Mapping workspace code → menu keys yang tersedia di workspace tersebut.
// Diambil dari NAV dedicates (WAREHOUSE_NAV etc) + shared groups (Setting/Setup).
function collectNavMenus(groups: typeof NAV): Set<string> {
  const s = new Set<string>();
  for (const g of groups) for (const it of g.items) { s.add(it.menu); if (it.children) for (const c of it.children) s.add(c.menu); }
  return s;
}
const SHARED_MENUS = collectNavMenus(NAV.filter((g) => (g as any).shared));
function menusForWorkspaceCode(code: string | null): Set<string> {
  if (!code) return new Set(MENU_GROUPS.flatMap((g) => g.menus.map((m) => m.key)));
  const dedicated =
    code === "warehouse" ? WAREHOUSE_NAV
    : code === "purchasing" ? PURCHASING_NAV
    : code === "marketing" ? MARKETING_NAV
    : code === "quality" ? QUALITY_NAV
    : null;
  if (!dedicated) return new Set(MENU_GROUPS.flatMap((g) => g.menus.map((m) => m.key)));
  const s = collectNavMenus(dedicated as any);
  // shared menus (Setting/Setup) selalu tersedia di semua workspace
  for (const m of SHARED_MENUS) s.add(m);
  // Dashboard & AI selalu tersedia meski tidak di dedicated nav
  s.add("dashboard"); s.add("ai");
  return s;
}

const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  update: "Edit",
  delete: "Delete",
  export: "Export",
  import: "Import",
};
const ALL_ACTIONS = Object.keys(ACTION_LABELS);

/** Aksi yang didukung sebuah menu — Export/Import hanya jika tombolnya ada. */
function actionsFor(m: MenuItem): string[] {
  return ALL_ACTIONS.filter(
    (a) =>
      !(a === "export" && !m.supportsExport) &&
      !(a === "import" && !m.supportsImport)
  );
}

function TriStateCheck({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      title={label}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-border accent-primary"
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
    />
  );
}

export function RoleForm({ role }: { role?: Role }) {
  const navigate = useNavigate();
  const router = { push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1) } as any;

  const { isLoading: rolesLoading } = useRoles();
  const { data: rolePermissions, isLoading: permsLoading } = useRolePermissions(role?.id);
  const { data: branchAccesses, isLoading: accessesLoading } = useBranchAccesses(role?.id);
  const { data: workspaceAccesses, isLoading: wsAccessLoading } = useWorkspaceAccesses(role?.id);
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const { data: warehouses, isLoading: whsLoading } = useAllWarehouses();
  const { data: locations, isLoading: locsLoading } = useLocations();
  const { data: workspaces } = useWorkspaces();

  const insertRole = useInsert("roles");
  const updateRole = useUpdate("roles");
  const removePerm = useRemove("rolePermissions");
  const removeAccess = useRemove("branchAccesses");
  const removeWsAccess = useRemove("workspaceAccesses");
  const insertPerm = useInsert("rolePermissions");
  const insertRoleAccess = useInsert("branchAccesses");
  const insertWsAccess = useInsert("workspaceAccesses");

  const isLoading = rolesLoading || permsLoading || accessesLoading || wsAccessLoading || branchesLoading || whsLoading || locsLoading;

  const [name, setName] = useState(role?.name ?? "");
  const [active, setActive] = useState(role?.active ?? true);
  const [perms, setPerms] = useState<Record<string, Set<string>>>({});
  const [checked, setChecked] = useState<CheckedIds>({
    branches: new Set(),
    warehouses: new Set(),
  });
  const [checkedWs, setCheckedWs] = useState<Set<string>>(new Set());
  const permsLoadedRef = useRef(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(MENU_GROUPS.map((g) => g.title))
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useErrorToast(error);

  // Muat permission & akses entitas role saat data selesai di-fetch.
  // (Dipakai di mode edit — state diisi dari database, bukan inisialisasi awal.)
  useEffect(() => {
    if (!role || permsLoadedRef.current) return;
    if (!rolePermissions || !branchAccesses || !workspaceAccesses) return;

    const map: Record<string, Set<string>> = {};
    for (const p of rolePermissions) {
      if (!map[p.menu]) map[p.menu] = new Set();
      map[p.menu].add(p.action);
    }
    setPerms(map);

    const c: CheckedIds = { branches: new Set(), warehouses: new Set() };
    for (const ra of branchAccesses) {
      if (ra.entityType === "BRANCH") c.branches.add(ra.entityId);
      if (ra.entityType === "WAREHOUSE") c.warehouses.add(ra.entityId);
    }
    setChecked(c);
    setCheckedWs(new Set(workspaceAccesses.map((w) => w.workspaceId)));

    permsLoadedRef.current = true;
  }, [role, rolePermissions, branchAccesses, workspaceAccesses]);

  const togglePerm = (menu: string, action: string) => {
    setPerms((p) => {
      const n = { ...p };
      if (!n[menu]) n[menu] = new Set();
      else n[menu] = new Set(n[menu]);
      const on = n[menu].has(action);
      if (!on) {
        // Semua aksi bergantung pada View — centang aksi lain otomatis mengaktifkan View.
        n[menu].add("view");
        n[menu].add(action);
      } else {
        n[menu].delete(action);
        // View adalah prasyarat — mencabut View menghapus aksi lainnya.
        if (action === "view") n[menu].clear();
      }
      if (n[menu].size === 0) delete n[menu];
      return n;
    });
  };

  /** Toggle akses menu: centang = izinkan (semua aksi yang didukung), kosong = tolak. */
  const toggleMenuAccess = (menu: MenuItem, allow: boolean) => {
    setPerms((p) => {
      const n = { ...p };
      if (allow) {
        n[menu.key] = new Set(actionsFor(menu));
      } else {
        delete n[menu.key];
      }
      return n;
    });
  };

  /** Toggle seluruh isi grup: izinkan semua menu + aksi, atau bersihkan. */
  const toggleGroupAccess = (menus: MenuItem[], allow: boolean) => {
    setPerms((p) => {
      const n = { ...p };
      for (const m of menus) {
        if (allow) n[m.key] = new Set(actionsFor(m));
        else delete n[m.key];
      }
      return n;
    });
  };

  /** Toggle akses menu induk: aktif → izinkan induk (view), nonaktif → hapus
   *  permission induk beserta seluruh submenu-nya. */
  const toggleMasterAccess = (masterKey: string, allow: boolean) => {
    setPerms((p) => {
      const n = { ...p };
      if (allow) {
        const acts = n[masterKey] ?? new Set();
        n[masterKey] = new Set([...acts, "view"]);
      } else {
        delete n[masterKey];
        for (const key of Object.keys(n)) {
          if (key.startsWith(masterKey + ".")) delete n[key];
        }
      }
      return n;
    });
  };

  const masterAllowed = (masterKey: string) => {
    const acts = perms[masterKey];
    return !!acts && acts.size > 0;
  };

  // Workspace → menu filtering: hanya tampilkan menu yang ada di workspace terpilih.
  // Alur: Branch (EntityAccess) → Workspace → Menu. Jika belum pilih workspace, menu di-hide.
  const wsCodeOf = (wsId: string): string | null => {
    const list = (workspaces && workspaces.length > 0 ? workspaces : (WORKSPACES as unknown as typeof workspaces)) as any[];
    const found = list.find((w: any) => w.id === wsId || (w as any).publicId === wsId);
    if (found?.code) return found.code as string;
    // fallback mapping id wsp-* → code
    if (wsId === "wsp-warehouse" || wsId === "22222222-2222-4222-8222-222222222222") return "warehouse";
    if (wsId === "wsp-purchasing" || wsId === "33333333-3333-4333-8333-333333333333") return "purchasing";
    if (wsId === "wsp-marketing" || wsId === "44444444-4444-4444-8444-444444444444") return "marketing";
    if (wsId === "wsp-quality" || wsId === "55555555-5555-4555-8555-555555555555") return "quality";
    return null;
  };
  const allowedMenuKeys = (() => {
    if (checkedWs.size === 0) return new Set<string>();
    const union = new Set<string>();
    for (const wsId of checkedWs) {
      const code = wsCodeOf(wsId);
      const ms = menusForWorkspaceCode(code);
      for (const k of ms) union.add(k);
    }
    return union;
  })();
  const hasWorkspace = checkedWs.size > 0;
  const hasBranch = checked.branches.size > 0 || checked.warehouses.size > 0;

  // Filter grup/menu berdasarkan workspace terpilih (union). Hanya menu yang ada di workspace yg tampil.
  // Contoh: marketing → hanya dashboard, ai, supply.customers/salesOrders/deliveries (+ shared Settings bila ada).
  const workspaceFilteredGroups = hasWorkspace
    ? MENU_GROUPS.map((g) => ({
        ...g,
        menus: g.menus.filter((m) => allowedMenuKeys.has(m.key)),
      })).filter((g) => g.menus.length > 0)
    : [];

  const allowedGroups = workspaceFilteredGroups.filter((g) => masterAllowed(g.masterKey));

  const menuState = (menuKey: string, menu: MenuItem) => {
    const acts = perms[menuKey];
    const size = acts?.size ?? 0;
    const total = actionsFor(menu).length;
    return { checked: size > 0, all: size === total, none: size === 0 };
  };

  const groupState = (menus: MenuItem[]) => {
    const total = menus.reduce((a, m) => a + (perms[m.key]?.size ?? 0), 0);
    const expected = menus.reduce((a, m) => a + actionsFor(m).length, 0);
    return { checked: total === expected, none: total === 0, count: total };
  };

  const toggleGroup = (title: string) => {
    setOpenGroups((s) => {
      const n = new Set(s);
      if (n.has(title)) n.delete(title); else n.add(title);
      return n;
    });
  };

  const toggleAccess = (type: "BRANCH" | "WAREHOUSE", id: string) => {
    setChecked((c) => {
      const n = { branches: new Set(c.branches), warehouses: new Set(c.warehouses) };
      if (type === "BRANCH") { if (n.branches.has(id)) n.branches.delete(id); else n.branches.add(id); }
      else { if (n.warehouses.has(id)) n.warehouses.delete(id); else n.warehouses.add(id); }
      return n;
    });
  };

  const toggleWs = (id: string) => {
    setCheckedWs((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // Menu tidak bisa diatur sebelum workspace dipilih — kosongkan & prune sesuai workspace
  useEffect(() => {
    if (!hasWorkspace) {
      if (Object.keys(perms).length > 0) setPerms({});
      return;
    }
    // Hapus menu yang tidak ada di workspace terpilih (supaya marketing tidak menyimpan PO)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setPerms((prev) => {
      let changed = false;
      const next: Record<string, Set<string>> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowedMenuKeys.has(k)) next[k] = v;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [hasWorkspace, checkedWs]);

  const save = async () => {
    if (saving) return;
    if (!name.trim()) {       setError("Role name is required."); return; }
    setSaving(true);
    setError("");
    try {
      let id = role?.id;
      if (role) {
        await updateRole.mutateAsync({ id: role.id, patch: { name: name.trim(), active } });
      } else {
        const created = (await insertRole.mutateAsync({
          name: name.trim(),
          isSystem: false,
          active,
        })) as Role;
        id = created.id;
      }
      if (!id) throw new Error("Failed to create role.");

      // Hapus permission yang benar-benar ada di DB saat ini (bukan snapshot
      // lama) lalu insert ulang — sehingga save ulang setelah kegagalan
      // parsial tidak menabrak unique constraint role_permissions.
      const freshPerms = await api.get<RolePermission[]>(`/rolePermissions?roleId=${id}`);
      for (const p of freshPerms) {
        await removePerm.mutateAsync(p.id);
      }
      for (const [menu, acts] of Object.entries(perms)) {
        for (const action of acts) {
          await insertPerm.mutateAsync({ roleId: id, menu, action });
        }
      }

      const freshAccesses = await api.get<BranchAccess[]>(`/branchAccesses?roleId=${id}`);
      for (const ra of freshAccesses) {
        await removeAccess.mutateAsync(ra.id);
      }
      for (const eid of checked.branches) {
        await insertRoleAccess.mutateAsync({ roleId: id, entityType: "BRANCH", entityId: eid });
      }
      for (const eid of checked.warehouses) {
        await insertRoleAccess.mutateAsync({ roleId: id, entityType: "WAREHOUSE", entityId: eid });
      }

      const freshWs = await api.get<WorkspaceAccess[]>(`/workspaceAccesses?roleId=${id}`);
      for (const ra of freshWs) {
        await removeWsAccess.mutateAsync(ra.id);
      }
      for (const wid of checkedWs) {
        await insertWsAccess.mutateAsync({ roleId: id, workspaceId: wid });
      }

      router.push("/app/settings/roles");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save role.");
      setSaving(false);
    }
  };

  useSaveShortcut(save, !saving);

  if (isLoading) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
        <FormSkeleton
          sections={[
            ["wide", "toggle"],
            ["wide", "wide"],
            ["block", "block", "block", "block", "block", "block"],
          ]}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
      <FormPage
        title={role ? "Edit Role" : "Add Role"}
      >
        <FormSection>
          <div className="space-y-5">
            <Input label="Role name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="flex items-center gap-3">
              <Toggle checked={active} onChange={(v) => setActive(v)} />
              <span className="text-sm text-muted-foreground">{active ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </FormSection>

        {/* Step 1 — Branch */}
        <FormSection title="1 — Branch Access" description="Pilih branch / warehouse dulu. Langkah ini opsional, tapi sesuai alur: Branch → Workspace → Menu.">
          <EntityAccess
            branches={branches ?? []}
            warehouses={warehouses ?? []}
            locations={locations ?? []}
            checked={checked}
            toggle={toggleAccess}
          />
          {!hasBranch && (
            <p className="mt-2 text-[11px] text-muted-foreground">Belum pilih branch? Tidak apa — lanjut pilih workspace. (Kosong = akses semua branch dianggap follow workspace.)</p>
          )}
        </FormSection>

        {/* Step 2 — Workspace */}
        <FormSection title="2 — Workspace Access" description="Pilih workspace yang boleh diakses role ini. Menu pada langkah 3 akan otomatis difilter sesuai workspace terpilih.">
          <div className="grid gap-2 sm:grid-cols-2">
            {((workspaces && workspaces.length > 0 ? workspaces : (WORKSPACES as unknown as typeof workspaces)) as { id: string; name: string; description?: string | null; icon: string }[]).map((ws) => {
              const on = checkedWs.has(ws.id);
              const displayIcon = ws.icon ?? "Layers";
              return (
                <label key={ws.id} className={cx("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 transition-colors", on ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                  <input type="checkbox" checked={on} onChange={() => toggleWs(ws.id)} className="size-4 rounded border-input" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{ws.name}</div>
                    <div className="text-xs text-muted-foreground">{ws.description ?? ""}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{displayIcon}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setCheckedWs(new Set(((workspaces && workspaces.length > 0 ? workspaces : (WORKSPACES as unknown as typeof workspaces)) as { id:string }[]).map((w)=>w.id)))}>Select all</Button>
            <Button variant="outline" size="sm" onClick={() => setCheckedWs(new Set())}>Clear</Button>
          </div>
          {!hasWorkspace && (
            <p className="mt-2 text-[11px] text-amber-600">Pilih minimal 1 workspace supaya daftar Menu Access (langkah 3) muncul. Contoh: pilih <b>Purchasing</b> → hanya menu Purchasing (Suppliers, PO, GR) yang tampil.</p>
          )}
          {hasWorkspace && (
            <p className="mt-2 text-[11px] text-muted-foreground">Workspace terpilih: <b>{[...checkedWs].map((id) => wsCodeOf(id) ?? id).join(", ")}</b> — {workspaceFilteredGroups.length} grup menu tersedia.</p>
          )}
        </FormSection>

        {/* Step 3 — Menu Access: HIDDEN sebelum workspace dipilih, tidak bisa kasih akses */}
        {hasWorkspace && (
        <FormSection title="3 — Menu Access" description={`Hanya menu yang ada di workspace terpilih yang ditampilkan (${workspaceFilteredGroups.length} grup). Centang parent lalu atur aksi View/Create/Edit/Delete.`}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => workspaceFilteredGroups.forEach((g) => toggleMasterAccess(g.masterKey, true))}
                disabled={workspaceFilteredGroups.length===0}
              >
                Select all (filtered)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => workspaceFilteredGroups.forEach((g) => toggleMasterAccess(g.masterKey, false))}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {workspaceFilteredGroups.map((g) => {
              const on = masterAllowed(g.masterKey);
              return (
                <label
                  key={g.masterKey}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                    on
                        ? "border-primary/60 bg-primary/10"
                        : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMasterAccess(g.masterKey, !on)}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                  />
                  <span className={cx("text-[13px] font-medium", on ? "text-primary" : "text-foreground")}>
                    {g.title}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{g.menus.length} menu</span>
                </label>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {allowedGroups.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-muted-foreground">
                {workspaceFilteredGroups.length===0 ? "Tidak ada menu untuk workspace terpilih." : "Check the parent menu above to set permissions."}
              </p>
            ) : (
              <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                {allowedGroups.map((group) => {
                  const gs = groupState(group.menus);
                  const isOpen = openGroups.has(group.title);
                  return (
                    <div key={group.title} className="overflow-hidden rounded-lg border border-border">
                      <div className="flex items-center gap-2 border-b border-border/70 bg-muted px-3 py-2">
                        <TriStateCheck
                          checked={gs.checked}
                          indeterminate={!gs.checked && !gs.none}
                          onChange={() => toggleGroupAccess(group.menus, !gs.checked)}
                          label={`Select all ${group.title} menus`}
                        />
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.title)}
                          className="flex flex-1 items-center justify-between gap-2 text-left"
                        >
                      <span className="text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
                        {group.title}
                      </span>
                      <span className="flex items-center gap-2">
                        {gs.count > 0 && (
                          <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                            {gs.count}
                          </span>
                        )}
                        {isOpen ? (
                          <ChevronDown size={14} strokeWidth={2} className="text-muted-foreground" />
                        ) : (
                          <ChevronRight size={14} strokeWidth={2} className="text-muted-foreground" />
                        )}
                      </span>
                    </button>
                  </div>

                  {isOpen && (
                    <div className="divide-y divide-border">
                      {group.menus.map((m) => {
                        const ms = menuState(m.key, m);
                        const depth = m.key.split(".").length - 1;
                        const menuActions = actionsFor(m);
                        return (
                          <div
                            key={m.key}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-muted/50"
                            style={{ paddingLeft: 12 + depth * 14 }}
                          >
                            <TriStateCheck
                              checked={ms.checked}
                              indeterminate={!ms.all && !ms.none}
                              onChange={() => toggleMenuAccess(m, !ms.checked)}
                              label={`Access ${m.label}`}
                            />
                            <span className="flex min-w-[130px] flex-1 items-center gap-1.5 sm:flex-none">
                              {m.parent && (
                                <span className="rounded bg-secondary px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-secondary-foreground">
                                  Parent
                                </span>
                              )}
                              <span className="text-[12.5px] font-medium text-foreground">
                                {m.label}
                              </span>
                            </span>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                              {menuActions.map((a) => {
                                const on = perms[m.key]?.has(a) ?? false;
                                return (
                                  <label
                                    key={a}
                                    className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={() => togglePerm(m.key, a)}
                                      className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary"
                                    />
                                    {ACTION_LABELS[a]}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  </div>
                );
              })}
              </div>
            )}
          </div>
        </FormSection>
        )}

        <FormActions>
          <Button variant="ghost" onClick={() => router.push("/app/settings/roles")}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}