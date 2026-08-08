"use client";

import { useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ScanLine,
  Video,
  XCircle,
} from "lucide-react";
import { useData } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { newUid } from "@/lib/mock/store";
import { nowMs } from "@/lib/now";
import { parseBarcode, type ParsedResult } from "@/lib/barcode/parser";
import type { BarcodeFormat, ScanRecord } from "@/types";
import { formatNumber, formatTime, cx } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CameraScanner } from "@/components/barcode/camera-scanner";

interface Feed {
  ok: boolean;
  title: string;
  detail?: string;
  itemName?: string;
  hue?: number;
}

interface BufferEntry {
  barcode: string;
  parsed: ParsedResult;
  format: BarcodeFormat;
  count: number;
  source: ScanRecord["source"];
}

export default function ScanSessionPage() {
  const params = useParams<{ id: string }>();
  const { db, insert, update } = useData();
  const { user } = useSession();

  const project = db.projects.find((p) => p.id === params.id);

  const locations = useMemo(
    () =>
      db.locations.filter((l) => l.warehouseId === project?.warehouseId),
    [db, project]
  );

  const activeSession = db.scanSessions.find(
    (s) => s.projectId === params.id && s.status === "ACTIVE"
  );

  const [locationId, setLocationId] = useState(
    activeSession?.locationId ?? locations[0]?.id ?? ""
  );
  const [input, setInput] = useState("");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [buffer, setBuffer] = useState<BufferEntry[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [qtyMap, setQtyMap] = useState<Record<string, string>>({});
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastScanRef = useRef<{ barcode: string; at: number } | null>(null);

  if (!project) return null;

  const sessionRecords = db.scanRecords.filter(
    (r) => r.sessionId === activeSession?.id
  );
  const totalQty = sessionRecords.reduce((a, r) => a + r.quantity, 0);
  const distinctItems = new Set(sessionRecords.map((r) => r.itemId)).size;

  const startSession = async () => {
    if (!locationId) return;
    const id = newUid("ses");
    await insert("scanSessions", {
      id,
      projectId: project.id,
      locationId,
      scannedBy: user?.id ?? "",
      startedAt: new Date().toISOString(),
      status: "ACTIVE",
    });
    if (project.status === "DRAFT") {
      await update("projects", project.id, { status: "IN_PROGRESS" });
    }
    setLocationId(locationId);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const recordScans = async (
    items: Array<{
      parsed: ParsedResult;
      quantity: number;
      qtyMode: "AUTO" | "MANUAL";
      source: ScanRecord["source"];
    }>
  ) => {
    const totalQty = items.reduce((a, i) => a + i.quantity, 0);
    for (const it of items) {
      await insert("scanRecords", {
        id: newUid("rec"),
        sessionId: activeSession?.id ?? "",
        projectId: project.id,
        barcode: it.parsed.raw,
        itemId: it.parsed.itemId,
        parsed: it.parsed.values,
        quantity: it.quantity,
        qtyMode: it.qtyMode,
        source: it.source,
        locationId: activeSession?.locationId,
        scannedAt: new Date().toISOString(),
      });
    }
    setFeed({
      ok: true,
      title: `${items.length} scan disimpan`,
      itemName: items[0]?.parsed.item?.name,
      detail: `Total qty ${formatNumber(totalQty)} · ${items.length} barcode unik tercatat.`,
      hue: items[0]?.parsed.item?.hue,
    });
  };

  const handleScan = (
    barcode: string,
    source: ScanRecord["source"] = "SCANNER"
  ) => {
    const now = nowMs();
    const last = lastScanRef.current;
    if (last && last.barcode === barcode && now - last.at < 900) return;
    lastScanRef.current = { barcode, at: now };

    const parsed = parseBarcode(barcode, db.barcodeFormats, {
      items: db.items,
      categories: db.categories,
    });

    if (!parsed || !parsed.matched) {
      setFeed({
        ok: false,
        title: "Barcode tidak dikenali",
        detail: `“${barcode}” tidak cocok dengan format aktif.`,
      });
      return;
    }

    if (!parsed.item) {
      setFeed({
        ok: false,
        title: "Item tidak terdeteksi",
        detail:
          "Kode item/kategori pada barcode tidak cocok dengan master data. Periksa format atau master item.",
      });
      return;
    }

    const format = db.barcodeFormats.find((f) => f.id === parsed.formatId);
    if (!format) {
      setFeed({
        ok: false,
        title: "Format tidak aktif",
        detail: parsed.formatName,
      });
      return;
    }

    const existing = buffer.find((e) => e.barcode === barcode);
    if (existing && format.uniqueBarcode) {
      setFeed({
        ok: false,
        title: "Barcode duplikat",
        itemName: parsed.item?.name,
        hue: parsed.item?.hue,
        detail: `Barcode ini sudah di-scan. Format "${format.name}" tidak mengizinkan duplikat.`,
      });
      setInput("");
      return;
    }
    const newCount = (existing?.count ?? 0) + 1;
    setBuffer((prev) =>
      existing
        ? prev.map((e) =>
            e.barcode === barcode ? { ...e, count: e.count + 1, source } : e
          )
        : [...prev, { barcode, parsed, format, count: 1, source }]
    );
    setFeed({
      ok: true,
      title: parsed.item?.name ?? "Barcode dikenali",
      itemName: parsed.item?.name,
      hue: parsed.item?.hue,
      detail: `Masuk antrean scan (total ${newCount}x)`,
    });
    setInput("");
    if (!cameraOpen) inputRef.current?.focus();
  };

  const openSave = () => {
    const map: Record<string, string> = {};
    for (const e of buffer) {
      const masterQty = e.parsed.item?.qty;
      const autoQty =
        e.format.qtyPerFormat && masterQty && masterQty > 0
          ? masterQty * e.count
          : e.count;
      map[e.barcode] = String(autoQty);
    }
    setQtyMap(map);
    setSaveOpen(true);
  };

  const clearBuffer = () => {
    setBuffer([]);
    setFeed({
      ok: true,
      title: "Antrean dibersihkan",
      detail: "Scan yang belum disimpan dibuang.",
    });
    setInput("");
    inputRef.current?.focus();
  };

  const confirmSave = () => {
    const items: Array<{
      parsed: ParsedResult;
      quantity: number;
      qtyMode: "AUTO" | "MANUAL";
      source: ScanRecord["source"];
    }> = [];
    for (const e of buffer) {
      const raw = (qtyMap[e.barcode] ?? "").trim();
      const masterQty = e.parsed.item?.qty;
      const autoQty =
        e.format.qtyPerFormat && masterQty && masterQty > 0
          ? masterQty * e.count
          : e.count;
      const qty = raw === "" ? e.count : Number(raw);
      if (!Number.isFinite(qty) || qty < 1) {
        setFeed({
          ok: false,
          title: "Qty tidak valid",
          detail: `“${e.parsed.item?.name ?? e.barcode}” harus lebih dari 0.`,
        });
        return;
      }
      items.push({
        parsed: e.parsed,
        quantity: qty,
        qtyMode: qty === autoQty ? "AUTO" : "MANUAL",
        source: e.source,
      });
    }
    if (items.length === 0) return;
    recordScans(items);
    setBuffer([]);
    setSaveOpen(false);
    setInput("");
    inputRef.current?.focus();
  };

  const closeSession = () => {
    if (!activeSession) return;
    void update("scanSessions", activeSession.id, {
      status: "CLOSED",
      endedAt: new Date().toISOString(),
    });
  };

  const submitInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleScan(input.trim());
    setInput("");
  };

  if (
    project.status === "APPROVED" ||
    project.status === "CANCELLED"
  ) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-200 bg-white py-20 text-center">
        <CheckCircle2 size={28} strokeWidth={2} className="text-zinc-300" />
        <h2 className="mt-4 text-lg font-semibold text-zinc-900">
          Sesi scan sudah ditutup
        </h2>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Project berstatus {project.status.toLowerCase()}. Data sudah final.
        </p>
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-lg border border-zinc-200 bg-white p-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-zinc-900 text-emerald-400">
            <ScanLine size={26} strokeWidth={2} />
          </span>
          <h2 className="mt-5 text-xl font-semibold tracking-tight text-zinc-900">
            Mulai sesi scan
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            Pilih lokasi rak/bin tempat Anda menghitung, lalu mulai membaca
            barcode dengan scanner fisik atau kamera HP.
          </p>

          <div className="mt-6">
            <Select
              label="Lokasi"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
                </option>
              ))}
            </Select>
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="mt-6 w-full"
            disabled={!locationId}
            onClick={startSession}
          >
            Mulai Scan
            <ArrowRight size={16} strokeWidth={2.2} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="space-y-6">
        <div className="rounded-lg border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-zinc-900">
                  Sesi scan aktif
                </p>
                <p className="text-[11.5px] text-zinc-400">
                  Lokasi{" "}
                  {db.locations.find((l) => l.id === activeSession.locationId)
                    ?.code ?? "—"}{" "}
                  · dimulai {formatTime(activeSession.startedAt)}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={closeSession}>
              Tutup Sesi
            </Button>
          </div>

          <form onSubmit={submitInput} className="mt-5">
            <label
              htmlFor="scan-input"
              className="mb-1.5 block text-[13px] font-medium text-zinc-700"
            >
              Pindai barcode
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
                placeholder="Scan barcode / tempel dari keyboard scanner..."
                className="h-14 w-full rounded-lg border-2 border-zinc-200 bg-zinc-50 px-5 pr-16 font-mono text-lg tracking-wider text-zinc-900 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal placeholder:text-zinc-400 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <button
                type="button"
                onClick={() => setCameraOpen((v) => !v)}
                className={cx(
                  "absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl transition-colors",
                  cameraOpen
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
                )}
              >
                <Video size={18} strokeWidth={2.2} />
              </button>
            </div>
            <p className="mt-2 text-[11.5px] text-zinc-400">
              Scan bebas beberapa barcode, lalu klik Simpan untuk mengisi qty.
            </p>
          </form>

          <AnimatePresence>
            {feed && (
              <motion.div
                key={feed.title + feed.detail}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 26 }}
                className={cx(
                  "mt-4 flex items-center gap-4 rounded-lg border p-4",
                  feed.ok
                    ? "border-emerald-200 bg-emerald-50/70"
                    : "border-red-200 bg-red-50/70"
                )}
              >
                {feed.ok ? (
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white"
                    style={{ background: `hsl(${feed.hue ?? 200} 55% 45%)` }}
                  >
                    {feed.itemName
                      ?.split(" ")
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("") ?? "OK"}
                  </span>
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
                    <XCircle size={22} strokeWidth={2} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold text-zinc-900">
                    {feed.title}
                  </p>
                  {feed.detail && (
                    <p className="mt-0.5 text-[12px] text-zinc-500">
                      {feed.detail}
                    </p>
                  )}
                </div>
                {feed.ok && (
                  <CheckCircle2
                    size={20}
                    strokeWidth={2.2}
                    className="shrink-0 text-emerald-500"
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {cameraOpen && (
            <CameraScanner
              onScan={(t) => handleScan(t, "CAMERA")}
              onClose={() => setCameraOpen(false)}
            />
          )}
        </AnimatePresence>

        {buffer.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-5 py-3.5">
              <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                Antrean scan · {buffer.length} barcode
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={clearBuffer}
                  className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                >
                  Bersihkan
                </button>
                <Button size="sm" onClick={openSave}>
                  Simpan
                  <CheckCircle2 size={14} strokeWidth={2.2} />
                </Button>
              </div>
            </div>
            <div className="max-h-56 divide-y divide-zinc-100 overflow-y-auto">
              {buffer.map((e) => {
                const item = e.parsed.item;
                return (
                  <div key={e.barcode} className="flex items-center gap-3 px-5 py-2.5">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                      style={{ background: `hsl(${item?.hue ?? 200} 55% 45%)` }}
                    >
                      {item?.name.split(" ").slice(0, 2).map((w) => w[0]).join("") ?? "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-zinc-800">
                        {item?.name ?? "—"}
                      </p>
                      <p className="truncate font-mono text-[10.5px] text-zinc-400">
                        {e.barcode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[12.5px] font-semibold text-zinc-900">
                        {e.count}x
                      </p>
                      <p className="text-[10px] text-zinc-400">{e.format.name}</p>
                      {e.format.qtyPerFormat &&
                        e.parsed.item?.qty &&
                        e.parsed.item.qty > 0 && (
                          <p className="text-[10px] font-medium text-emerald-600">
                            qty master {e.parsed.item.qty}
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
              className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/60 p-4 sm:items-center"
              onClick={() => setSaveOpen(false)}
            >
              <motion.div
                onClick={(e) => e.stopPropagation()}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-200 bg-white"
              >
                <div className="border-b border-zinc-100 px-5 py-4">
                  <h3 className="text-[15px] font-semibold tracking-tight text-zinc-900">
                    Catat qty scan
                  </h3>
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    Isi jumlah tiap barcode, lalu simpan ke sesi.
                  </p>
                </div>

                <div className="max-h-[52vh] divide-y divide-zinc-100 overflow-y-auto">
                  {buffer.map((e) => (
                    <div key={e.barcode} className="flex items-center gap-3 px-5 py-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                        style={{ background: `hsl(${e.parsed.item?.hue ?? 200} 55% 45%)` }}
                      >
                        {e.parsed.item?.name.split(" ").slice(0, 2).map((w) => w[0]).join("") ?? "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-zinc-800">
                          {e.parsed.item?.name ?? "—"}
                        </p>
                        <p className="truncate font-mono text-[11px] text-zinc-400">
                          {e.barcode}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="block text-[11px] text-zinc-400">
                            scan {e.count}x
                          </span>
                          {e.format.qtyPerFormat &&
                            e.parsed.item?.qty &&
                            e.parsed.item.qty > 0 && (
                              <span className="block text-[10px] font-medium text-emerald-600">
                                master {e.parsed.item.qty}/scan
                              </span>
                            )}
                        </div>
                        <input
                          type="number"
                          min={1}
                          value={qtyMap[e.barcode] ?? String(e.count)}
                          onChange={(ev) =>
                            setQtyMap((m) => ({ ...m, [e.barcode]: ev.target.value }))
                          }
                          className="h-10 w-24 rounded-xl border border-zinc-200 bg-zinc-50 text-center font-mono text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3 border-t border-zinc-100 px-5 py-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setSaveOpen(false)}
                  >
                    Batal
                  </Button>
                  <Button className="flex-1" onClick={confirmSave}>
                    Simpan Scan
                    <CheckCircle2 size={15} strokeWidth={2.2} />
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            { label: "Scan", value: sessionRecords.length },
            { label: "Total qty", value: formatNumber(totalQty) },
            { label: "Item unik", value: distinctItems },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-zinc-200 bg-white p-4 text-center"
            >
              <p className="font-mono text-xl font-semibold text-zinc-900">
                {s.value}
              </p>
              <p className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wider text-zinc-400">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-3.5">
            <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
              Scan terakhir sesi ini
            </h3>
          </div>
          <div className="max-h-[460px] divide-y divide-zinc-100 overflow-y-auto">
            {sessionRecords.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-zinc-400">
                Belum ada scan di sesi ini.
              </p>
            )}
            {[...sessionRecords]
              .reverse()
              .slice(0, 30)
              .map((r) => {
                const item = db.items.find((i) => i.id === r.itemId);
                return (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                      style={{ background: `hsl(${item?.hue ?? 200} 55% 45%)` }}
                    >
                      {item?.name.split(" ").slice(0, 2).map((w) => w[0]).join("") ?? "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium text-zinc-800">
                        {item?.name ?? "—"}
                      </p>
                      <p className="truncate font-mono text-[10.5px] text-zinc-400">
                        {r.barcode}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[12.5px] font-semibold text-zinc-900">
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
  );
}
