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
    // Dipetakan sesuai workspace NAV:
    // Warehouse → Receiving, GRN, Putaway, Supplier Return (menu keys PO/GR, filter by workspace)
    // Purchasing → Suppliers, Purchase Orders, Goods Receipts
    menus: [
      { key: "supply.suppliers", label: "Suppliers" },
      { key: "supply.receivings", label: "Receiving" },
      { key: "supply.goodsReceipts", label: "GRN" },
      { key: "supply.goodsReceipts", label: "Putaway" },
      { key: "supply.goodsReceipts", label: "Supplier Return" },
    ],
  },
  {
    masterKey: "outbound",
    title: "Outbound",
    // Warehouse → Delivery Order (SO), Picking, Packing, Dispatch/Shipment, Customer Return (Deliveries)
    // Marketing → Customers, Sales Orders, Deliveries
    menus: [
      { key: "supply.customers", label: "Customers" },
      { key: "supply.salesOrders", label: "Sales Orders / Delivery Order" },
      { key: "supply.deliveries", label: "Picking" },
      { key: "supply.deliveries", label: "Packing" },
      { key: "supply.deliveries", label: "Dispatch / Shipment" },
      { key: "supply.deliveries", label: "Customer Return" },
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
      { key: "master.taxCategories", label: "Tax Categories" },
      { key: "master.priceLists", label: "Price Lists" },
      { key: "master.documentTypes", label: "Document Numbering" },
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
  // Jika code tidak dikenal (mis. workspace baru atau mapping gagal), jangan buka semua menu
  // — hanya kembalikan shared (Settings/Setup) + dashboard/ai agar fail-closed.
  if (!code) return new Set([...SHARED_MENUS, "dashboard", "ai"]);
  const dedicated =
    code === "warehouse" ? WAREHOUSE_NAV
    : code === "purchasing" ? PURCHASING_NAV
    : code === "marketing" ? MARKETING_NAV
    : code === "quality" ? QUALITY_NAV
    : null;
  if (!dedicated) return new Set([...SHARED_MENUS, "dashboard", "ai"]);
  const s = collectNavMenus(dedicated as any);
  // shared menus (Setting/Setup) selalu tersedia di semua workspace
  for (const m of SHARED_MENUS) s.add(m);
  // Dashboard & AI selalu tersedia meski tidak di dedicated nav
  s.add("dashboard"); s.add("ai");
  return s;
}

// --- Dynamic MenuGroups dari NAV (sesuai workspace, bukan static) ---
// Konversi NavItem (dengan children) → MenuGroup untuk Role Management.
// Tiap NavItem dengan children menjadi 1 grup (title = label, masterKey = menu).
// Anak-anak dengan menu key sama digabung labelnya (mis. GRN/Putaway share goodsReceipts).
function navGroupsToMenuGroups(navGroups: typeof NAV): MenuGroup[] {
  const groups: MenuGroup[] = [];
  for (const g of navGroups) {
    for (const item of g.items) {
      if ((item as any).children && (item as any).children.length > 0) {
        const children = (item as any).children as typeof item[];
        // Kumpulkan menu unik per key, gabung label bila duplikat (GRN/Putaway share key)
        const seen = new Map<string, MenuItem>();
        for (const c of children) {
          const existing = seen.get(c.menu);
          if (!existing) {
            seen.set(c.menu, { key: c.menu, label: c.label });
          } else if (!existing.label.includes(c.label)) {
            existing.label += " / " + c.label;
          }
        }
        // Jika parent punya menu berbeda dari children, tampilkan parent sebagai row parent
        const childKeys = new Set(children.map((c) => c.menu));
        const menus: MenuItem[] = [];
        if (!childKeys.has(item.menu)) {
          menus.push({ key: item.menu, label: item.label, parent: true });
        }
        menus.push(...seen.values());
        groups.push({ masterKey: item.menu, title: item.label, menus });
      } else {
        groups.push({ masterKey: item.menu, title: item.label, menus: [{ key: item.menu, label: item.label }] });
      }
    }
  }
  return groups;
}
function menuGroupsForWorkspaceCodeDynamic(code: string | null): MenuGroup[] {
  if (!code) return [];
  const dedicated =
    code === "warehouse" ? WAREHOUSE_NAV
    : code === "purchasing" ? PURCHASING_NAV
    : code === "marketing" ? MARKETING_NAV
    : code === "quality" ? QUALITY_NAV
    : null;
  if (!dedicated) return [];
  const base = [...(dedicated as unknown as typeof NAV), ...NAV.filter((g) => (g as any).shared)];
  return navGroupsToMenuGroups(base as any);
}
function buildWorkspaceMenuGroups(codes: string[]): MenuGroup[] {
  // Union semua workspace terpilih, dedup by title+masterKey
  const map = new Map<string, MenuGroup>();
  for (const code of codes) {
    const gs = menuGroupsForWorkspaceCodeDynamic(code);
    for (const g of gs) {
      const key = g.title + "|" + g.masterKey;
      if (!map.has(key)) {
        map.set(key, { ...g, menus: [...g.menus] });
      } else {
        // Merge menus bila grup sama muncul di multiple workspace (mis. Dashboard)
        const existing = map.get(key)!;
        const seen = new Set(existing.menus.map((m) => m.key));
        for (const m of g.menus) {
          if (!seen.has(m.key)) {
            seen.add(m.key);
            existing.menus.push(m);
          } else {
            // Merge label bila duplikat key beda label (jarang)
            const ex = existing.menus.find((x) => x.key === m.key);
            if (ex && !ex.label.includes(m.label)) ex.label += " / " + m.label;
          }
        }
      }
    }
  }
  return [...map.values()];
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

  const isLoading = rolesLoading || (role ? permsLoading || accessesLoading || wsAccessLoading : false);

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
    const found = list.find((w: any) => w.id === wsId || (w as any).publicId === wsId || (w as any).code === wsId);
    if (found?.code) return found.code as string;
    // fallback mapping publicId → code (uuid v7 seed & legacy wsp-*)
    if (wsId === "wsp-warehouse" || wsId === "22222222-2222-4222-8222-222222222222") return "warehouse";
    if (wsId === "wsp-purchasing" || wsId === "33333333-3333-4333-8333-333333333333") return "purchasing";
    if (wsId === "wsp-marketing" || wsId === "44444444-4444-4444-8444-444444444444") return "marketing";
    if (wsId === "wsp-quality" || wsId === "55555555-5555-4555-8555-555555555555") return "quality";
    // fallback untuk data lama yang masih menyimpan internal bigint id (2..5) atau numeric string
    const num = Number(wsId);
    if (!Number.isNaN(num)) {
      if (num === 2 || num === 222) return "warehouse";
      if (num === 3 || num === 333) return "purchasing";
      if (num === 4 || num === 444) return "marketing";
      if (num === 5 || num === 555) return "quality";
      // kalau id internal 1 pernah jadi stockopname/warehouse lama
      if (num === 1) return "warehouse";
    }
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

  // Pemetaan menu sesuai workspace (dinamis dari NAV, bukan static).
  // Contoh: warehouse → Inbound: Receiving, GRN, Putaway, Supplier Return (dari WAREHOUSE_NAV)
  //         purchasing → Suppliers, Purchase Orders, Goods Receipts, dll.
  // Shared (Settings/Setup) selalu ikut. Jika dynamic gagal, fallback ke filter static MENU_GROUPS.
  const workspaceFilteredGroups = (() => {
    if (!hasWorkspace) return [] as MenuGroup[];
    const codes = [...checkedWs].map(wsCodeOf).filter((c): c is string => !!c);
    if (codes.length === 0) return [] as MenuGroup[];
    const dynamic = buildWorkspaceMenuGroups(codes);
    if (dynamic.length > 0) {
      // Filter lagi by allowedMenuKeys agar menu yang tidak diizinkan workspace tidak bocor
      // (dynamic sudah sesuai, tapi tetap intersect dengan allowed keys untuk safety)
      return dynamic
        .map((g) => ({ ...g, menus: g.menus.filter((m) => allowedMenuKeys.has(m.key)) }))
        .filter((g) => g.menus.length > 0);
    }
    // fallback static
    return MENU_GROUPS.map((g) => ({
      ...g,
      menus: g.menus.filter((m) => allowedMenuKeys.has(m.key)),
    })).filter((g) => g.menus.length > 0);
  })();

  const allowedGroups = workspaceFilteredGroups;

  const menuState = (menuKey: string, menu: MenuItem) => {
    const acts = perms[menuKey];
    const size = acts?.size ?? 0;
    const total = actionsFor(menu).length;
    return { checked: size > 0, all: size === total, none: size === 0 };
  };

  const groupState = (menus: MenuItem[]) => {
    // Deduplicate by menu key agar Inbound GRN/Putaway yang share key tidak double-count
    const uniq = new Map<string, MenuItem>();
    for (const m of menus) if (!uniq.has(m.key)) uniq.set(m.key, m);
    const uniqMenus = [...uniq.values()];
    const total = uniqMenus.reduce((a, m) => a + (perms[m.key]?.size ?? 0), 0);
    const expected = uniqMenus.reduce((a, m) => a + actionsFor(m).length, 0);
    return { checked: total === expected && expected > 0, none: total === 0, count: total };
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
        <FormSection title="1 — Branch Access">
          <EntityAccess
            branches={branches ?? []}
            warehouses={warehouses ?? []}
            locations={locations ?? []}
            checked={checked}
            toggle={toggleAccess}
          />
        </FormSection>

        {/* Step 2 — Workspace */}
        <FormSection title="2 — Workspace Access">
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
        </FormSection>

        {/* Step 3 — Menu Access: HIDDEN sebelum workspace dipilih */}
        {hasWorkspace && (
        <FormSection title="3 — Menu Access">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => workspaceFilteredGroups.forEach((g) => toggleGroupAccess(g.menus, true))}
                disabled={workspaceFilteredGroups.length===0}
              >
                Select all (filtered)
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => workspaceFilteredGroups.forEach((g) => toggleGroupAccess(g.menus, false))}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {workspaceFilteredGroups.map((g) => {
              const gs = groupState(g.menus);
              const on = gs.checked;
              const indeterminate = !gs.checked && !gs.none;
              return (
                <label
                  key={g.title + "|" + g.masterKey}
                  className={cx(
                    "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-colors",
                    on
                        ? "border-primary/60 bg-primary/10"
                        : indeterminate
                          ? "border-amber-300 bg-amber-50"
                          : "border-border bg-card hover:bg-muted/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    ref={(el) => { if (el) el.indeterminate = indeterminate; }}
                    onChange={() => toggleGroupAccess(g.menus, !on)}
                    className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
                  />
                  <span className={cx("text-[13px] font-medium", on ? "text-primary" : indeterminate ? "text-amber-700" : "text-foreground")}>
                    {g.title}
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{g.menus.length} menu{gs.count>0?` • ${gs.count} akses`:``}</span>
                </label>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {(() => {
              // Collapsible hanya menampilkan menu yang dicentang di Menu Akses
              const checkedGroups = workspaceFilteredGroups
                .map((g) => ({ ...g, menus: g.menus.filter((m) => perms[m.key] && perms[m.key].size > 0) }))
                .filter((g) => g.menus.length > 0);
              if (checkedGroups.length === 0) {
                return (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
                    <p className="text-[12.5px] text-muted-foreground">Belum ada menu terpilih</p>
                  </div>
                );
              }
              return (
                <div className="max-h-[46vh] space-y-2 overflow-y-auto pr-1">
                  {checkedGroups.map((group) => {
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
                              <span className="rounded bg-primary/10 px-1.5 py-px text-[10px] font-semibold text-primary">
                                {group.menus.length} terpilih • {gs.count} akses
                              </span>
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
              );
            })()}
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