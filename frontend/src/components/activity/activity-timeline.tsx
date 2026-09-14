import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { timeAgo, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Clock, FilePlus, Edit, Send, Check, X, Ban, ArrowRightLeft, FileText, Plus, Minus, RefreshCw } from "lucide-react";

type FieldChange = { from: unknown; to: unknown };
type LinesDiff = {
  added: Record<string, unknown>[];
  removed: Record<string, unknown>[];
  modified: { key: string; changes: Record<string, FieldChange>; old: Record<string, unknown>; next: Record<string, unknown> }[];
  summary?: string;
};
type ApprovalLevel = {
  level: number;
  stateName: string;
  roleNames: string[];
  roleCodes: string[];
  status: string;
  requiresSignature?: boolean;
};

type Activity = {
  id: string;
  publicId?: string | null;
  documentType: string;
  documentId: number;
  actorUserId: number | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  metadata: Record<string, unknown> & {
    changes?: Record<string, FieldChange>;
    linesDiff?: LinesDiff;
    approvalLevels?: ApprovalLevel[];
    documentNo?: string;
    targetDocumentNo?: string;
    targetType?: string;
    level?: number;
    total?: number;
    patchKeys?: string[];
    code?: string;
    name?: string;
  };
  createdAt: string;
  isBackfilled?: boolean;
};

function useActivities(documentType?: string, documentId?: string) {
  return useQuery({
    queryKey: ["activity-logs", documentType, documentId],
    queryFn: () => api.get<Activity[]>(`/activity-logs?documentType=${documentType}&documentId=${documentId}`),
    enabled: !!documentType && !!documentId,
    staleTime: 30_000,
  });
}

const ACTION_META: Record<string, { label: string; icon: any; dot: string }> = {
  create: { label: "Dibuat", icon: FilePlus, dot: "bg-primary" },
  update: { label: "Diperbarui", icon: Edit, dot: "bg-zinc-400" },
  post: { label: "Diposting", icon: Send, dot: "bg-amber-500" },
  submit: { label: "Disubmit", icon: Send, dot: "bg-amber-500" },
  approve: { label: "Disetujui", icon: Check, dot: "bg-emerald-500" },
  reject: { label: "Ditolak", icon: X, dot: "bg-red-500" },
  cancel: { label: "Dibatalkan", icon: Ban, dot: "bg-zinc-400" },
  convert: { label: "Dikonversi", icon: ArrowRightLeft, dot: "bg-violet-500" },
  prepare: { label: "Disiapkan", icon: FileText, dot: "bg-sky-500" },
  complete: { label: "Selesai", icon: Check, dot: "bg-emerald-600" },
  delete: { label: "Dihapus", icon: Ban, dot: "bg-red-400" },
};

function Dot({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, icon: Clock, dot: "bg-zinc-300" };
  const Icon = meta.icon;
  return (
    <div className={cn("flex size-7 items-center justify-center rounded-full border-2 border-background shadow-sm", meta.dot)}>
      <Icon size={12} className="text-white" strokeWidth={2.5} />
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = {
  supplierId: "Supplier",
  warehouseId: "Warehouse",
  branchId: "Branch",
  itemGroupId: "Item Group",
  uomId: "UOM",
  taxCategoryId: "Tax Category",
  priceListId: "Price List",
  customerId: "Customer",
  code: "Code",
  name: "Name",
  description: "Description",
  notes: "Notes",
  status: "Status",
  qty: "Qty",
  unitPrice: "Unit Price",
  discount: "Discount",
  batchNumber: "Batch Number",
  note: "Note",
  deliveryDate: "Delivery Date",
  requestDate: "Request Date",
  expectedDate: "Expected Date",
  orderDate: "Order Date",
  urgency: "Urgency",
  department: "Department",
  costCenter: "Cost Center",
  currency: "Currency",
  exchangeRate: "Exchange Rate",
  globalDiscountPercent: "Global Discount %",
  taxRate: "Tax Rate",
  isActive: "Active",
  active: "Active",
  phone: "Phone",
  email: "Email",
  address: "Address",
  picName: "PIC Name",
  picPhone: "PIC Phone",
  picEmail: "PIC Email",
  alternativeCode: "Alternative Code",
  uomQty: "UOM Qty",
  valuationRate: "Valuation Rate",
  isFinishGood: "Finish Good",
};

// Per-documentType column label: e.g., name for WAREHOUSE should be "Warehouse Name" not just "Name" (input label)
const DOC_FIELD_LABELS: Record<string, Record<string, string>> = {
  WAREHOUSE: { code: "Warehouse Code", name: "Warehouse Name", branchId: "Branch", parentId: "Parent Warehouse", description: "Description", phone: "Phone", email: "Email", address: "Address", picName: "PIC Name", picPhone: "PIC Phone", picEmail: "PIC Email" },
  BRANCH: { code: "Branch Code", name: "Branch Name", city: "City", address: "Address" },
  LOCATION: { code: "Location Code", name: "Location Name", warehouseId: "Warehouse" },
  ITEM: { code: "Item Code", name: "Item Name", itemGroupId: "Item Group", uomId: "UOM", alternativeCode: "Alternative Code", uomQty: "UOM Qty", description: "Description" },
  ITEM_GROUP: { code: "Group Code", name: "Group Name" },
  SUPPLIER: { code: "Supplier Code", name: "Supplier Name", contactPerson: "Contact Person", phone: "Phone", email: "Email", address: "Address", taxId: "Tax ID" },
  CUSTOMER: { code: "Customer Code", name: "Customer Name" },
  UOM: { code: "UOM Code", name: "UOM Name" },
  DEPARTMENT: { code: "Department Code", name: "Department Name" },
  TAX_CATEGORY: { code: "Tax Code", name: "Tax Name", percentage: "Percentage" },
  PRICE_LIST: { code: "Price List Code", name: "Price List Name" },
  BATCH: { batchNumber: "Batch Number", expiryDate: "Expiry Date", productionDate: "Production Date" },
};

function humanizeField(k: string, docType?: string): string {
  const dt = (docType ?? "").toUpperCase();
  const perDoc = dt ? DOC_FIELD_LABELS[dt] : undefined;
  if (perDoc?.[k]) return perDoc[k];
  return FIELD_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
function formatVal(v: unknown): string {
  if (v == null || v === "") return "NULL";
  if (typeof v === "boolean") return v ? "Ya" : "Tidak";
  if (v instanceof Date) return formatDateTime(v as any);
  const s = String(v);
  if (s.length > 80) return s.slice(0, 80) + "…";
  return s;
}

function fmt(v: string): string {
  return v === "NULL" ? "NULL" : `"${v}"`;
}

function ChangesBlock({ changes, docType }: { changes: Record<string, FieldChange>; docType?: string }) {
  const entries = Object.entries(changes);
  if (!entries.length) return null;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-white dark:bg-zinc-900">
      <div className="bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Perubahan</div>
      <div className="divide-y divide-border">
        {entries.map(([field, ch]) => (
          <div key={field} className="grid grid-cols-[110px_1fr] gap-2 px-2.5 py-1.5 text-[11px] leading-tight sm:grid-cols-[140px_1fr]">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">{humanizeField(field, docType)}</span>
            <span className="flex flex-wrap items-center gap-1">
              <span className="rounded bg-red-50 px-1 py-0.5 text-red-700 line-through decoration-red-300 dark:bg-red-900/20 dark:text-red-300">{formatVal(ch.from)}</span>
              <ArrowRightLeft size={10} className="text-zinc-400" />
              <span className="rounded bg-emerald-50 px-1 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{formatVal(ch.to)}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LinesDiffBlock({ linesDiff, docType }: { linesDiff: LinesDiff; docType?: string }) {
  const { added, removed, modified } = linesDiff;
  const has = added.length || removed.length || modified.length;
  if (!has) return null;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-2 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <RefreshCw size={11} /> Per Baris
        <span className="ml-auto flex gap-1">
          {added.length ? <span className="rounded bg-emerald-100 px-1 py-0.5 text-emerald-700">+{added.length}</span> : null}
          {removed.length ? <span className="rounded bg-red-100 px-1 py-0.5 text-red-700">-{removed.length}</span> : null}
          {modified.length ? <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-700">~{modified.length}</span> : null}
        </span>
      </div>
      <div className="divide-y divide-border">
        {added.map((l, i) => (
          <div key={`a-${i}`} className="flex items-start gap-2 px-2.5 py-1.5 text-[11px]">
            <Plus size={11} className="mt-0.5 text-emerald-600" />
            <span className="text-emerald-700 dark:text-emerald-300">
              Ditambah — {(l as any).itemId ?? (l as any).code ?? JSON.stringify(l).slice(0, 60)}
              {(l as any).qty ? ` • Qty ${String((l as any).qty)}` : ""}
            </span>
          </div>
        ))}
        {removed.map((l, i) => (
          <div key={`r-${i}`} className="flex items-start gap-2 px-2.5 py-1.5 text-[11px]">
            <Minus size={11} className="mt-0.5 text-red-600" />
            <span className="text-red-700 line-through dark:text-red-300">
              Dihapus — {(l as any).itemId ?? (l as any).code ?? JSON.stringify(l).slice(0, 60)}
              {(l as any).qty ? ` • Qty ${String((l as any).qty)}` : ""}
            </span>
          </div>
        ))}
        {modified.map((m, i) => (
          <div key={`m-${i}`} className="px-2.5 py-1.5">
            <div className="mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              <Edit size={11} /> Baris {String(m.key).slice(0, 16)} diubah
            </div>
            <div className="ml-4 space-y-0.5">
              {Object.entries(m.changes).map(([f, ch]) => (
                <div key={f} className="flex flex-wrap items-center gap-1 text-[11px]">
                  <span className="font-medium">{humanizeField(f, docType)}:</span>
                  <span className="rounded bg-red-50 px-1 py-0.5 text-red-700 line-through dark:bg-red-900/20">{formatVal(ch.from)}</span>
                  <ArrowRightLeft size={9} className="text-zinc-400" />
                  <span className="rounded bg-emerald-50 px-1 py-0.5 text-emerald-700 dark:bg-emerald-900/20">{formatVal(ch.to)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {linesDiff.summary && !has && <div className="px-2.5 py-1.5 text-[11px] text-muted-foreground">{linesDiff.summary}</div>}
      </div>
    </div>
  );
}

function ApprovalLevelsBlock({ levels }: { levels: ApprovalLevel[] }) {
  if (!levels?.length) return null;
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-border bg-white dark:bg-zinc-900">
      <div className="bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">Menunggu / Sudah Approve (Semua Level)</div>
      <div className="divide-y divide-border">
        {levels.map((lv) => {
          const isApproved = lv.status === "approved";
          const isCurrent = lv.status === "current";
          const isPending = lv.status === "pending";
          const isRejected = lv.status === "rejected";
          return (
            <div key={lv.level} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white", isApproved ? "bg-emerald-500" : isCurrent ? "bg-amber-500 animate-pulse" : isRejected ? "bg-red-500" : "bg-zinc-300")}>
                {lv.level}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium">{lv.stateName}</span>
                {lv.roleNames?.length ? <span className="ml-1 text-muted-foreground">• {lv.roleNames.join(", ")}</span> : null}
                {lv.requiresSignature ? <span className="ml-1 rounded bg-sky-100 px-1 py-0.5 text-[10px] text-sky-700">butuh ttd</span> : null}
              </span>
              <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", isApproved ? "bg-emerald-100 text-emerald-700" : isCurrent ? "bg-amber-100 text-amber-700" : isPending ? "bg-zinc-100 text-zinc-600" : isRejected ? "bg-red-100 text-red-700" : "bg-zinc-50")}>
                {isApproved ? "Disetujui" : isCurrent ? "Menunggu" : isPending ? "Pending" : isRejected ? "Ditolak" : lv.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Sentence({ actor, label, from, to, suffix }: { actor: string; label?: string; from?: string; to?: string; suffix?: string }) {
  return (
    <span>
      <span className="font-medium text-foreground">{actor}</span>
      {label ? (
        <>
          {" changes "}
          <span className="rounded bg-zinc-100 px-1 py-0.5 font-semibold text-foreground dark:bg-zinc-800">{label}</span>
          {" From "}
          <span className="rounded bg-red-50 px-1 py-0.5 text-red-700 line-through dark:bg-red-900/20 dark:text-red-300">"{from}"</span>
          {" to "}
          <span className="rounded bg-emerald-50 px-1 py-0.5 font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">"{to}"</span>
        </>
      ) : null}
      {suffix ? <span className="text-muted-foreground"> {suffix}</span> : null}
    </span>
  );
}

function sentencesFor(a: Activity): React.ReactNode[] {
  const actor = a.actorName ?? "System";
  const act = a.action?.toLowerCase();
  const ago = timeAgo(a.createdAt);
  const nodes: React.ReactNode[] = [];
  const changes = (a.metadata as any)?.changes as Record<string, FieldChange> | undefined;
  const linesDiff = (a.metadata as any)?.linesDiff as LinesDiff | undefined;

  if (act === "create") {
    nodes.push(
      <span key="c">
        <span className="font-medium text-foreground">{actor}</span> created this. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
      </span>
    );
    return nodes;
  }
  if (act === "delete") {
    nodes.push(
      <span key="d">
        <span className="font-medium text-foreground">{actor}</span> deleted this. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
      </span>
    );
    return nodes;
  }
  if (act === "approve") {
    const txt = a.toStatus === "APPROVED" ? "approved this." : "approved (waiting next level).";
    nodes.push(
      <span key="ap">
        <span className="font-medium text-foreground">{actor}</span> {txt} <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
      </span>
    );
    return nodes;
  }
  if (act === "reject") {
    nodes.push(
      <span key="rj">
        <span className="font-medium text-foreground">{actor}</span> rejected this. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
      </span>
    );
    return nodes;
  }
  if (act === "cancel") {
    nodes.push(
      <span key="ca">
        <span className="font-medium text-foreground">{actor}</span> cancelled this. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
      </span>
    );
    return nodes;
  }
  if (act === "post" || act === "submit") {
    if (a.fromStatus && a.toStatus) {
      nodes.push(
        <span key="ps">
          <span className="font-medium text-foreground">{actor}</span> changed status from {a.fromStatus} to {a.toStatus}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    } else if (a.toStatus) {
      nodes.push(
        <span key="ps2">
          <span className="font-medium text-foreground">{actor}</span> changed status to {a.toStatus.toLowerCase()}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    } else {
      nodes.push(
        <span key="ps3">
          <span className="font-medium text-foreground">{actor}</span> submitted this. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    }
    return nodes;
  }
  if (act === "convert") {
    const t = (a.metadata as any)?.targetType ?? "document";
    const no = (a.metadata as any)?.targetDocumentNo ?? "";
    nodes.push(
      <span key="cv">
        <span className="font-medium text-foreground">{actor}</span> converted to {t} {no}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
      </span>
    );
    return nodes;
  }

  let idx = 0;
  if (changes && Object.keys(changes).length) {
    // status separate, others combined into 1 line comma-separated, NULL tanpa ""
    const statusEntry = Object.entries(changes).find(([k]) => k.toLowerCase() === "status");
    const otherEntries = Object.entries(changes).filter(([k]) => k !== "updatedAt" && k.toLowerCase() !== "status");
    if (statusEntry) {
      const [, ch] = statusEntry;
      const to = formatVal((ch as any).to);
      nodes.push(
        <span key={`ch-st-${idx++}`}>
          <span className="font-medium text-foreground">{actor}</span> change status to {to}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    }
    if (otherEntries.length) {
      const parts = otherEntries.map(([field, ch]) => {
        const label = humanizeField(field, a.documentType);
        const from = formatVal((ch as any).from);
        const to = formatVal((ch as any).to);
        return `${label} From ${fmt(from)} to ${fmt(to)}`;
      });
      nodes.push(
        <span key={`ch-${idx++}`}>
          <span className="font-medium text-foreground">{actor}</span> changes {parts.join(", ")}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    }
  }
  if ((a.fromStatus || a.toStatus) && act === "update") {
    if (a.fromStatus && a.toStatus && a.fromStatus !== a.toStatus) {
      nodes.push(
        <span key={`st-${idx++}`}>
          <span className="font-medium text-foreground">{actor}</span> change status from {a.fromStatus} to {a.toStatus}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    } else if (a.toStatus && !changes?.status) {
      nodes.push(
        <span key={`st2-${idx++}`}>
          <span className="font-medium text-foreground">{actor}</span> change status to {a.toStatus.toLowerCase()}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    }
  }
  if (linesDiff) {
    const { added, removed, modified } = linesDiff;
    // combine all modified fields into 1 line
    const lineParts: string[] = [];
    for (const m of modified) {
      for (const [f, ch] of Object.entries(m.changes)) {
        const label = humanizeField(f, a.documentType);
        lineParts.push(`${label} From ${fmt(formatVal((ch as any).from))} to ${fmt(formatVal((ch as any).to))}`);
      }
    }
    if (lineParts.length) {
      nodes.push(
        <span key={`ld-${idx++}`}>
          <span className="font-medium text-foreground">{actor}</span> changed {lineParts.join(", ")}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
        </span>
      );
    }
    if (added.length || removed.length) {
      const addParts = added.map((r: any) => `added line ${r.itemId ?? r.code ?? ""}${r.qty ? ` qty ${r.qty}` : ""}`);
      const remParts = removed.map((r: any) => `removed line ${r.itemId ?? r.code ?? ""}${r.qty ? ` qty ${r.qty}` : ""}`);
      const all = [...addParts, ...remParts];
      if (all.length) {
        nodes.push(
          <span key={`adrm-${idx++}`}>
            <span className="font-medium text-foreground">{actor}</span> {all.join(", ")}. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
          </span>
        );
      }
    }
  }
  if (nodes.length === 0) {
    const label = ACTION_META[act ?? ""]?.label ?? a.action;
    nodes.push(
      <span key="fb">
        <span className="font-medium text-foreground">{actor}</span> {label.toLowerCase()} this. <span className="text-muted-foreground cursor-help" title={formatDateTime(a.createdAt)}>{ago}</span>
      </span>
    );
  }
  return nodes;
}

export function ActivityTimeline({ documentType, documentId }: { documentType: string; documentId: string }) {
  const { data: activities = [], isLoading } = useActivities(documentType, documentId);

  if (isLoading) {
    return <div className="py-6 text-center text-xs text-muted-foreground">Memuat aktivitas…</div>;
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
        <Clock size={18} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Belum ada aktivitas</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="space-y-0">
        {activities.map((a, idx) => {
          const meta = ACTION_META[a.action] ?? { label: a.action, icon: Clock, dot: "bg-zinc-300" };
          const isLast = idx === activities.length - 1;
          const changes = (a.metadata as any)?.changes as Record<string, FieldChange> | undefined;
          const linesDiff = (a.metadata as any)?.linesDiff as LinesDiff | undefined;
          const approvalLevels = (a.metadata as any)?.approvalLevels as ApprovalLevel[] | undefined;
          const sentences = sentencesFor(a);
          return (
            <div key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
              {!isLast && <div className="absolute left-[13px] top-7 bottom-0 w-px bg-border" />}
              <div className="relative z-10 shrink-0">
                <Dot action={a.action} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                {/* sentences as primary - highlighted field */}
                <div className="space-y-1">
                  {sentences.map((s, i) => (
                    <p key={i} className="text-[13px] leading-[1.5] text-foreground">
                      {s}
                    </p>
                  ))}
                </div>
                {a.comment && (
                  <div className="mt-1.5 rounded-md border border-border bg-muted/50 px-2.5 py-1.5 text-xs leading-relaxed text-foreground">
                    {a.comment}
                  </div>
                )}
                {approvalLevels && approvalLevels.length > 0 && <ApprovalLevelsBlock levels={approvalLevels} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { useActivities };
