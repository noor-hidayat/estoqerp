"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  ScanLine,
  Video,
  XCircle,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { nowMs } from "@/lib/now";
import { api } from "@/lib/api/client";
import {
  useProject,
  useLocations,
  useScanSessions,
  useScanRecords,
  useBarcodeFormats,
  useItemsList,
  useCategories,
  useInsert,
  useUpdate,
} from "@/lib/api/query";
import { syncMasterCache, getAll } from "@/lib/local-cache";
import { parseBarcode } from "@/lib/barcode/parser";
import type { BarcodeFormat, Category, Item, ScanRecord, ScanSession } from "@/types";
import { formatNumber, formatTime, cx } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ComboBox } from "@/components/ui/combo-box";
import { CameraScanner } from "@/components/barcode/camera-scanner";
import { ShellLoader } from "@/components/ui/loader";
import { AccessDenied } from "@/components/ui/role-guard";

interface Feed {
  ok: boolean;
  title: string;
  detail?: string;
}

interface ScanParsed {
  barcode: string;
  itemId: string;
  item?: Item;
  formatId?: string;
  formatName?: string;
  values?: Record<string, string>;
}

interface BufferEntry {
  barcode: string;
  parsed: ScanParsed;
  format: BarcodeFormat;
  count: number;
  source: ScanRecord["source"];
}

export default function ScanSessionPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, isSystem, permissions } = useSession();

  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: locations = [] } = useLocations(project?.warehouseId);
  const {
    data: sessions = [],
    isLoading: sessionsLoading,
  } = useScanSessions({ projectId: id, status: "ACTIVE" });
  const activeSession = sessions[0];
  const { data: scanRecordsData } = useScanRecords(
    activeSession?.id
      ? { sessionId: activeSession.id, pageSize: 1000 }
      : { pageSize: 1 }
  );
  const sessionRecords = scanRecordsData?.rows ?? [];
  const { data: formats = [] } = useBarcodeFormats();
  const { data: allItems = [] } = useItemsList();
  const { data: categories = [] } = useCategories();

  // Sync master data to IndexedDB so scan can lookup offline
  useEffect(() => {
    if (formats.length && allItems.length && categories.length) {
      void syncMasterCache({ items: allItems, categories, barcodeFormats: formats });
    }
  }, [formats, allItems, categories]);

  const insertScanSession = useInsert("scanSessions");
  const insertScanRecord = useInsert("scanRecords");
  const updateProject = useUpdate("projects");
  const updateSession = useUpdate("scanSessions");

  // Source of truth for active session: query refetch may lag right after
  // session is created/closed — this ref is set synchronously so scan records are never
  // saved without sessionId/locationId.
  const activeSessionRef = useRef<ScanSession | null>(null);
  useEffect(() => {
    activeSessionRef.current = activeSession ?? null;
  }, [activeSession]);

  const itemMap = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  const [locationId, setLocationId] = useState("");
  const [input, setInput] = useState("");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [buffer, setBuffer] = useState<BufferEntry[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [manualQty, setManualQty] = useState("1");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ barcode: string; at: number } | null>(null);
  const lookupCacheRef = useRef(new Map<string, {
    found: boolean;
    matched?: boolean;
    detail?: string;
    item?: Item;
    category?: { id: string; code: string; name: string } | null;
    formatId?: string;
    formatName?: string;
    values?: Record<string, string>;
  }>());

  useEffect(() => {
    if (!feed) return;
    const t = setTimeout(() => setFeed(null), 4000);
    return () => clearTimeout(t);
  }, [feed]);

  useEffect(() => {
    if (!locationId && locations.length > 0) {
      const initial = activeSession?.locationId ?? locations[0]?.id ?? "";
      if (initial) setLocationId(initial);
    }
  }, [activeSession?.locationId, locationId, locations]);

  if (!can(isSystem, permissions, "opname.detail.scan", "view")) {
    return <AccessDenied />;
  }

  if (projectLoading) return <ShellLoader />;

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background py-20 text-center">
        <ScanLine size={28} strokeWidth={2} className="text-muted-foreground" />
        <p className="mt-4 text-lg font-semibold text-foreground">
          Project not found
        </p>
      </div>
    );
  }

  const totalQty = sessionRecords.reduce((a, r) => a + r.quantity, 0);
  const distinctItems = new Set(sessionRecords.map((r) => r.itemId)).size;

  const history = buffer.flatMap((e) =>
    Array.from({ length: e.count }, (_, i) => ({
      key: `buf-${e.barcode}-${i}`,
      barcode: e.barcode,
    }))
  );

  const startSession = async (): Promise<ScanSession | null> => {
    if (activeSessionRef.current) return activeSessionRef.current;
    if (!locationId) return null;
    try {
      const created = (await insertScanSession.mutateAsync({
        projectId: project.id,
        locationId,
        scannedBy: user?.id ?? "",
        startedAt: new Date().toISOString(),
        status: "ACTIVE",
      })) as ScanSession;
      activeSessionRef.current = created;
      if (project.status === "DRAFT") {
        await updateProject.mutateAsync({
          id: project.id,
          patch: { status: "IN_PROGRESS" },
        });
      }
      setTimeout(() => inputRef.current?.focus(), 50);
      return created;
    } catch (e) {
      setFeed({
        ok: false,
        title: "Failed to start session",
        detail: e instanceof Error ? e.message : "Try again.",
      });
      return null;
    }
  };

  const recordScans = async (
    items: Array<{
      parsed: ScanParsed;
      quantity: number;
      qtyMode: "AUTO" | "MANUAL";
      source: ScanRecord["source"];
    }>
  ) => {
    const session = activeSessionRef.current;
    if (!session) {
      throw new Error("Scan session not yet active. Scan a barcode once to start the session.");
    }
    for (const it of items) {
      await insertScanRecord.mutateAsync({
        sessionId: session.id,
        projectId: project.id,
        barcode: it.parsed.barcode,
        itemId: it.parsed.itemId,
        parsed: it.parsed.values ?? {},
        quantity: it.quantity,
        qtyMode: it.qtyMode,
        source: it.source,
        locationId: session.locationId ?? undefined,
        scannedAt: new Date().toISOString(),
      });
    }
  };

  const resolveLookup = async (barcode: string) => {
    type LookupResponse = {
      found: boolean;
      matched?: boolean;
      detail?: string;
      item?: Item;
      category?: { id: string; code: string; name: string } | null;
      formatId?: string;
      formatName?: string;
      values?: Record<string, string>;
    };

    // 1. In-memory parse (online — fastest)
    if (formats.length && allItems.length && categories.length) {
      const parsed = parseBarcode(barcode, formats, { items: allItems, categories });
      if (parsed && parsed.matched) {
        if (parsed.item) {
          const category = categories.find((c) => c.id === parsed.item!.categoryId) ?? null;
          return {
            found: true, matched: true,
            item: parsed.item, category,
            formatId: parsed.formatId, formatName: parsed.formatName, values: parsed.values,
          } as LookupResponse;
        }
        return { found: false, matched: true, detail: "no match" } as LookupResponse;
      }
    }

    // 2. IndexedDB parse (offline fallback)
    try {
      const [dbFormats, dbItems, dbCategories] = await Promise.all([
        getAll<BarcodeFormat>("barcodeFormats"),
        getAll<Item>("items"),
        getAll<Category>("categories"),
      ]);
      if (dbFormats.length && dbItems.length) {
        const parsed = parseBarcode(barcode, dbFormats, { items: dbItems, categories: dbCategories });
        if (parsed && parsed.matched) {
          if (parsed.item) {
            const category = dbCategories.find((c) => c.id === parsed.item!.categoryId) ?? null;
            return {
              found: true, matched: true,
              item: parsed.item, category,
              formatId: parsed.formatId, formatName: parsed.formatName, values: parsed.values,
            } as LookupResponse;
          }
          return { found: false, matched: true, detail: "no match" } as LookupResponse;
        }
      }
    } catch {
      // IndexedDB error — continue to API
    }

    // 3. Server API (last fallback)
    return api.get<LookupResponse>(`/items/lookup?barcode=${encodeURIComponent(barcode)}`);
  };

  const handleScan = async (
    rawBarcode: string,
    source: ScanRecord["source"] = "SCANNER"
  ) => {
    if (!locationId) {
      setFeed({
        ok: false,
        title: "Select Location First",
        detail: "You must select a location before starting scan.",
      });
      return;
    }
    const barcode = rawBarcode.trim().replace(/\s+/g, "");
    if (!barcode) return;
    const now = nowMs();
    const last = lastScanRef.current;
    if (last && last.barcode === barcode && now - last.at < 900) return;
    lastScanRef.current = { barcode, at: now };

    let lookup = lookupCacheRef.current.get(barcode);
    if (!lookup) {
      lookup = await resolveLookup(barcode);
      lookupCacheRef.current.set(barcode, lookup);
    }

    if (!lookup || !lookup.found || !lookup.matched) {
      setFeed({
        ok: false,
        title: "No Barcode Format",
        detail: lookup?.detail ?? "Barcode not found.",
      });
      return;
    }

    if (!lookup.item) {
      setFeed({
        ok: false,
        title: "Barcode Not Found",
        detail:
          "Item data not found in the database. Check the master item or barcode format.",
      });
      return;
    }
    const lookupItem = lookup.item;

    const format = formats.find((f) => f.id === lookup.formatId);
    if (!format) {
      setFeed({
        ok: false,
        title: "Format Inactive",
        detail: lookup.formatName ?? "—",
      });
      return;
    }

    const newEntry = {
      barcode,
      parsed: {
        barcode,
        itemId: lookupItem.id,
        item: lookupItem,
        formatId: lookup.formatId,
        formatName: lookup.formatName,
        values: lookup.values,
      },
      format,
      count: 1,
      source,
    };

    if (format.uniqueBarcode) {
      const sameCode = buffer.find((e) => e.barcode === barcode);
      if (sameCode) {
        const scannedBy = user?.name ?? "unknown";
        const scannedAt =
          locationMap.get(activeSession?.locationId ?? "")?.code ?? "—";
        setFeed({
          ok: false,
          title: "Duplicate Barcode",
          detail: `Barcode already scanned by ${scannedBy} at ${scannedAt}.`,
        });
        setInput("");
        return;
      }

      const check = await api.get<{
        exists: boolean;
        record?: {
          sessionId: string;
          scannedBy: string;
          locationCode: string;
          scannedAt: string;
        };
      }>(
        `/scan-records/check?projectId=${project.id}&barcode=${encodeURIComponent(barcode)}${activeSessionRef.current?.id ? `&excludeSessionId=${activeSessionRef.current.id}` : ""}`
      );
      if (check.exists) {
        setFeed({
          ok: false,
          title: "Duplicate Barcode",
          detail: `Barcode already scanned by ${check.record?.scannedBy ?? "unknown"} at ${check.record?.locationCode ?? "—"}.`,
        });
        setInput("");
        return;
      }

      // Unique barcode = each barcode has its own entry, NOT merged by itemId
      setBuffer((prev) => [...prev, newEntry]);
    } else {
      // Non-unique: merge by itemId (qty aggregation)
      const sameItem = buffer.find((e) => e.parsed.itemId === lookupItem.id);
      setBuffer((prev) =>
        sameItem
          ? prev.map((e) =>
              e.parsed.itemId === lookupItem.id
                ? { ...e, count: e.count + 1, source }
                : e
            )
          : [...prev, newEntry]
      );
    }
    setInput("");
    if (!cameraOpen) inputRef.current?.focus();
  };

  const openSave = () => {
    setManualQty("");
    setSaveOpen(true);
  };

  const clearBuffer = () => {
    setBuffer([]);
    setInput("");
    inputRef.current?.focus();
  };

  const confirmSave = async () => {
    if (saving) return;
    const session = activeSessionRef.current;
    const items: Array<{
      parsed: ScanParsed;
      quantity: number;
      qtyMode: "AUTO" | "MANUAL";
      source: ScanRecord["source"];
    }> = [];
    const needsManual = buffer.some((e) => !e.format.qtyPerFormat);
    const manual = needsManual ? Number(manualQty.trim()) : NaN;
    if (needsManual && (!Number.isFinite(manual) || manual < 1)) {
      setFeed({
        ok: false,
        title: "Qty invalid",
        detail: "Fill in the qty (must be greater than 0).",
      });
      return;
    }
    for (const e of buffer) {
      const masterQty = e.parsed.item?.qty;
      const autoQty =
        e.format.qtyPerFormat && masterQty && masterQty > 0
          ? masterQty * e.count
          : e.count;
      const qty = e.format.qtyPerFormat ? autoQty : manual;
      items.push({
        parsed: e.parsed,
        quantity: qty,
        qtyMode: e.format.qtyPerFormat ? "AUTO" : "MANUAL",
        source: e.source,
      });
    }
    if (items.length === 0) return;
    if (!session) {
      setFeed({
        ok: false,
        title: "Session not active",
        detail: "Scan a barcode once to start a new session, then save again.",
      });
      return;
    }

    setSaving(true);
    try {
      await recordScans(items);
      await updateSession.mutateAsync({
        id: session.id,
        patch: {
          status: "CLOSED",
          endedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      setFeed({
        ok: false,
        title: "Failed to save scan",
        detail: `${
          e instanceof Error ? e.message : "Try again."
        } Some scans may have already been saved — check the "Latest scans" list before trying again.`,
      });
      setSaving(false);
      return;
    }

    activeSessionRef.current = null;
    setSaving(false);
    setBuffer([]);
    setSaveOpen(false);
    setInput("");
    setLocationId("");
    inputRef.current?.focus();
  };

  useSaveShortcut(confirmSave, saveOpen);

  const closeSession = () => {
    const session = activeSessionRef.current;
    if (!session) return;
    activeSessionRef.current = null;
    void updateSession.mutateAsync({
      id: session.id,
      patch: {
        status: "CLOSED",
        endedAt: new Date().toISOString(),
      },
    });
  };

  const submitInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    void (async () => {
      if (sessionsLoading) return;
      if (!activeSessionRef.current && locationId) {
        const created = await startSession();
        if (!created) return;
      }
      await handleScan(input.trim());
    })();
    setInput("");
  };

  if (
    project.status === "APPROVED" ||
    project.status === "CANCELLED"
  ) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-background py-20 text-center">
        <CheckCircle2 size={28} strokeWidth={2} className="text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Scan session closed
        </h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Project status is {project.status.toLowerCase()}. Data is final.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <ComboBox
                label="Scan location"
                value={locationId}
                onChange={(locId) => {
                  setLocationId(locId);
                  if (activeSession) {
                    void updateSession.mutateAsync({
                      id: activeSession.id,
                      patch: { locationId: locId },
                    });
                  }
                }}
                options={locations.map((l) => ({
                  value: l.id,
                  label: `${l.code} — ${l.name}`,
                }))}
                placeholder="Select rack/bin location..."
                emptyText="Location not found"
              />
            </div>
            {activeSession && (
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-[12.5px] font-semibold text-card-foreground">
                    Active scan session
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    started {formatTime(activeSession.startedAt)}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={closeSession}>
                  Close Session
                </Button>
              </div>
            )}
          </div>

          {cameraOpen ? (
            <div className="mt-5">
              <CameraScanner
                onScan={(t) =>
                  void (async () => {
                    if (sessionsLoading) return;
                    if (!activeSessionRef.current && locationId) {
                      const created = await startSession();
                      if (!created) return;
                    }
                    await handleScan(t, "CAMERA");
                  })()
                }
                onClose={() => setCameraOpen(false)}
              />
            </div>
          ) : (
            <form onSubmit={submitInput} className="mt-5">
              <label
                htmlFor="scan-input"
                className="mb-1.5 block text-[13px] font-medium text-muted-foreground"
              >
                Scan barcode
              </label>
              <div className="relative">
                <input
                  id="scan-input"
                  ref={inputRef}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Scan barcode / paste from keyboard scanner..."
                  className="h-14 w-full rounded-lg border-2 border-border bg-muted px-5 pr-16 font-mono text-lg tracking-wider text-foreground placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                />
                <button
                  type="button"
                  onClick={() => setCameraOpen((v) => !v)}
                  className={cx(
                    "absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl transition-colors md:hidden",
                    cameraOpen
                      ? "bg-primary text-white"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  )}
                >
                  <Video size={18} strokeWidth={2} />
                </button>
              </div>
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                Freely scan several barcodes, then click Save to fill in qty.
              </p>
            </form>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Barcode History
            </h3>
          </div>
          {history.length === 0 ? (
            <div className="h-[308px]" />
          ) : (
            <div className="h-[308px] overflow-y-auto">
                  {history.map((h) => (
                    <div key={h.key} className="flex h-11 items-center px-5">
                      <p className="min-w-0 flex-1 truncate font-mono text-[13px] tracking-wider text-card-foreground">
                        {h.barcode}
                      </p>
                    </div>
                  ))}
            </div>
          )}
        </div>

        {buffer.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                Scan queue · {buffer.length} barcode
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={clearBuffer}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  Clear
                </button>
                <Button size="sm" onClick={openSave}>
                  Save
                  <CheckCircle2 size={14} strokeWidth={2} />
                </Button>
              </div>
            </div>
            <div className="max-h-56 divide-y divide-border overflow-y-auto">
              {buffer.map((e) => {
                const item = e.parsed.item;
                return (
                  <div key={e.barcode} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-card-foreground">
                        {item?.name ?? "—"}
                      </p>
                      <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {e.barcode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[12.5px] font-semibold text-card-foreground">
                        {e.count}x
                      </p>
                      <p className="text-[10px] text-muted-foreground">{e.format.name}</p>
                      {e.format.qtyPerFormat &&
                        e.parsed.item?.qty &&
                        e.parsed.item.qty > 0 && (
                          <p className="text-[10px] font-medium text-emerald-600">
                            master qty {e.parsed.item.qty}
                          </p>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {saveOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
              onClick={() => setSaveOpen(false)}
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-background"
              >
                <div className="border-b border-border px-5 py-4">
                  <h3 className="text-[15px] font-semibold tracking-tight text-foreground">
                    Record scan qty
                  </h3>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {buffer.some((e) => !e.format.qtyPerFormat)
                      ? "Fill in the same qty for all barcodes, then save to session."
                      : "Qty automatically from master item per barcode."}
                  </p>
                </div>

                {buffer.some((e) => !e.format.qtyPerFormat) && (
                  <div className="border-b border-border px-5 py-4">
                    <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                      Qty per barcode
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={manualQty}
                      onChange={(e) => setManualQty(e.target.value)}
                      placeholder="e.g.: 1000"
                      className="h-10 w-full rounded-xl border border-border bg-muted px-3.5 text-center font-mono text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
                    />
                  </div>
                )}

                <div className="max-h-[52vh] divide-y divide-border overflow-y-auto">
                  {buffer.map((e) => {
                    const masterQty = e.parsed.item?.qty;
                    const autoQty =
                      e.format.qtyPerFormat && masterQty && masterQty > 0
                        ? masterQty * e.count
                        : e.count;
                    return (
                      <div key={e.barcode} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {e.parsed.item?.name ?? "—"}
                          </p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {e.barcode}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="block text-[11px] text-muted-foreground">
                            scan {e.count}x
                          </span>
                          {e.format.qtyPerFormat ? (
                            <span className="block text-[10px] font-medium text-emerald-600">
                              master {e.parsed.item?.qty ?? 0}/scan →{" "}
                              {formatNumber(autoQty)}
                            </span>
                          ) : (
                            <span className="block font-mono text-[13px] font-semibold text-foreground">
                              {manualQty.trim() === ""
                                ? "—"
                                : formatNumber(Number(manualQty))}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-3 border-t border-border px-5 py-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSaveOpen(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => void confirmSave()}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save Scan"}
                    {!saving && <CheckCircle2 size={15} strokeWidth={2} />}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="hidden lg:block">
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { label: "Scan", value: sessionRecords.length },
            { label: "Total qty", value: formatNumber(totalQty) },
            { label: "Unique items", value: distinctItems },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-border bg-card p-4 text-center"
            >
              <p className="font-mono text-xl font-semibold text-card-foreground">
                {s.value}
              </p>
              <p className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-5 py-3.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Latest scans this session
            </h3>
          </div>
          <div className="max-h-[460px] divide-y divide-border overflow-y-auto">
            {sessionRecords.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No scans in this session yet.
              </p>
            )}
            {[...sessionRecords]
              .reverse()
              .slice(0, 30)
              .map((r) => {
                const item = itemMap.get(r.itemId ?? "");
                return (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-card-foreground">
                        {item?.name ?? "—"}
                      </p>
                      <p className="truncate font-mono text-[10.5px] text-muted-foreground">
                        {r.barcode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[12.5px] font-semibold text-card-foreground">
                        +{formatNumber(r.quantity)}
                      </p>
                      <Badge tone={r.qtyMode === "AUTO" ? "violet" : "amber"}>
                        {r.qtyMode === "AUTO" ? "Auto" : "Manual"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
      </div>

      <AnimatePresence>
        {feed && !feed.ok && (
          <motion.div
            key={feed.title + feed.detail}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="fixed right-4 top-20 z-[60] flex w-80 max-w-[calc(100vw-2rem)] items-start gap-3 rounded-lg border border-destructive/20 bg-background p-4 shadow-lg"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <XCircle size={20} strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-foreground">
                {feed.title}
              </p>
              {feed.detail && (
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {feed.detail}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
