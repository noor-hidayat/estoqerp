import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, Plus, ScanBarcode, Trash2 } from "lucide-react";
import { useOpnameProjects, useAllWarehouses, useItemsList, useUoms, useOpnameCount, useUpdateOpnameCount } from "@/lib/api/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { FormPage, FormSection, FormGrid } from "@/components/ui/form-page";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { ShellLoader } from "@/components/ui/loader";
import { cn } from "@/lib/utils";

interface DetailDraft {
  key: string;
  itemId: string;
  qty: string;
  batch: string;
  uomId: string;
}
let rowKey = 0;
function nextKey() {
  rowKey += 1;
  return `row_${rowKey}_${Date.now()}`;
}

function CountScanHistoryTable({ history, items }: { history: { key: string; barcode: string }[]; items: { id: string; code: string; name: string }[] }) {
  if (history.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <p className="text-[13px] font-medium text-foreground">Belum ada scan history</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Scan barcode di tab Details untuk melihat history.</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">No.</th>
              <th className="px-4 py-2.5 font-semibold">Barcode</th>
              <th className="px-4 py-2.5 font-semibold">Item</th>
              <th className="px-4 py-2.5 font-semibold">Batch</th>
              <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {history.slice().reverse().map((h, idx) => {
              const item = items.find((i) => h.barcode.toLowerCase().includes(i.code.toLowerCase()));
              return (
                <tr key={h.key} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{history.length - idx}</td>
                  <td className="break-all px-4 py-2.5 text-xs text-foreground">{h.barcode}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{item ? `${item.code}: ${item.name}` : "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">—</td>
                  <td className="px-4 py-2.5 text-right text-xs text-foreground">1</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: count, isLoading } = useOpnameCount(id);
  const { data: projects = [] } = useOpnameProjects();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data: items = [] } = useItemsList();
  const { data: uoms = [] } = useUoms();
  const updateCount = useUpdateOpnameCount();

  const [projectId, setProjectId] = useState("");
  const [postingDate, setPostingDate] = useState("");
  const [postingTime, setPostingTime] = useState("");
  const [editPosting, setEditPosting] = useState(false);
  const [cutOffDate, setCutOffDate] = useState("");
  const [cutOffTime, setCutOffTime] = useState("");
  const [notes, setNotes] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [rows, setRows] = useState<DetailDraft[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [scanInput, setScanInput] = useState("");
  const [scanHistory, setScanHistory] = useState<{ key: string; barcode: string }[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [snapshot, setSnapshot] = useState<string>("");

  const warehouseMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w.name])), [warehouses]);
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const uomMap = useMemo(() => new Map(uoms.map((u) => [u.id, u.name])), [uoms]);
  const [tab, setTab] = useState<"details" | "scans">("details");

  const selectedProject = useMemo(() => projects.find((p) => p.id === projectId), [projects, projectId]);
  const filteredWarehouses = useMemo(() => {
    if (!selectedProject) return [];
    const ids = new Set(selectedProject.warehouses.map((w) => w.warehouseId));
    return warehouses.filter((w) => ids.has(w.id));
  }, [warehouses, selectedProject]);
  const selectedWarehouseName = warehouseMap.get(warehouseId) ?? "—";

  const isPosted = count?.status === "POSTED";

  // Load count into form when fetched
  useEffect(() => {
    if (!count) return;
    setProjectId(count.projectId ?? "");
    setPostingDate(count.postingDate ?? "");
    setPostingTime(count.postingTime ?? "");
    setCutOffDate(count.cutOffDate ?? "");
    setCutOffTime(count.cutOffTime ?? "");
    setNotes(count.notes ?? "");
    setWarehouseId(count.warehouseId ?? "");
    const details = (count.details ?? []).map((d) => ({
      key: nextKey(),
      itemId: d.itemId,
      qty: String(d.qty),
      batch: d.batch ?? "",
      uomId: d.uomId ?? "",
    }));
    setRows(details);
    // snapshot after load
    setTimeout(() => setSnapshot(JSON.stringify({ projectId: count.projectId, warehouseId: count.warehouseId, postingDate: count.postingDate ?? "", postingTime: count.postingTime ?? "", cutOffDate: count.cutOffDate ?? "", cutOffTime: count.cutOffTime ?? "", notes: count.notes ?? "", rows: details })), 0);
  }, [count]);

  useEffect(() => {
    if (warehouseId && !filteredWarehouses.some((w) => w.id === warehouseId)) {
      setWarehouseId("");
    }
  }, [filteredWarehouses, warehouseId]);

  const setRow = (key: string, patch: Partial<DetailDraft>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    setRows((prev) => [...prev, { key: nextKey(), itemId: "", qty: "", batch: "", uomId: "" }]);
  };
  const toggleRow = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const toggleAll = () => {
    setSelectedKeys((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.key))));
  };
  const removeSelected = () => {
    setRows((prev) => prev.filter((r) => !selectedKeys.has(r.key)));
    setSelectedKeys(new Set());
  };
  const allSelected = rows.length > 0 && selectedKeys.size === rows.length;
  const someSelected = selectedKeys.size > 0 && !allSelected;

  const handleScanned = (raw: string) => {
    if (isPosted) return;
    const barcode = raw.trim();
    if (!barcode) return;
    const item = items.find((i) => i.code.toLowerCase() === barcode.toLowerCase() || i.alternativeCode?.toLowerCase() === barcode.toLowerCase());
    const fallback = !item ? items.find((i) => barcode.toLowerCase().includes(i.code.toLowerCase())) : null;
    const found = item ?? fallback;
    if (found) {
      const existing = rows.find((r) => r.itemId === found.id && r.batch === "");
      if (existing) {
        const cur = Number(existing.qty || 0);
        setRow(existing.key, { qty: String(cur + 1) });
      } else {
        setRows((prev) => [...prev, { key: nextKey(), itemId: found.id, qty: "1", batch: "", uomId: found.uomId ?? "" }]);
      }
    } else {
      setRows((prev) => [...prev, { key: nextKey(), itemId: "", qty: "1", batch: barcode, uomId: "" }]);
    }
    setScanHistory((prev) => [...prev, { key: `${barcode}-${Date.now()}`, barcode }]);
    setScanInput("");
  };

  const serialize = () => JSON.stringify({ projectId, warehouseId, postingDate, postingTime, cutOffDate, cutOffTime, notes, rows });
  const dirty = serialize() !== snapshot;

  const handleSave = async () => {
    if (!id) return;
    if (isPosted) return;
    try {
      await updateCount.mutateAsync({
        id,
        patch: {
          projectId,
          warehouseId,
          postingDate: postingDate || null,
          postingTime: postingTime || null,
          cutOffDate: cutOffDate || null,
          cutOffTime: cutOffTime || null,
          notes: notes || null,
          details: rows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId, qty: r.qty, batch: r.batch || null, uomId: r.uomId || null })),
        },
      });
      setSnapshot(serialize());
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal save");
    }
  };

  const handleSubmit = async () => {
    if (!id) return;
    if (dirty) {
      alert("Wajib Save lagi sebelum Submit");
      return;
    }
    try {
      await updateCount.mutateAsync({ id, patch: { status: "POSTED" } });
      alert(`Count ${id} berhasil di-submit`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal submit");
    }
  };

  if (isLoading) return <ShellLoader />;
  if (!count) return <div className="py-20 text-center">Count tidak ditemukan</div>;

  const tabs = (
    <div className="flex items-center gap-1 border-b border-border">
      <button
        onClick={() => setTab("details")}
        className={
          tab === "details"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Details
      </button>
      <button
        onClick={() => setTab("scans")}
        className={
          tab === "scans"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Scan History{scanHistory.length > 0 ? ` (${scanHistory.length})` : ""}
      </button>
    </div>
  );

  return (
    <div>
      <FormPage
        title={(count as any).documentNo ?? count.id}
        titleBadge={<Badge tone={dirty ? "destructive" : count.status === "POSTED" ? "emerald" : "neutral"}>{dirty ? "Not Save" : count.status}</Badge>}
        tabs={tabs}
        actions={
          <div className="flex items-center gap-2">
            {!isPosted && dirty ? (
              <Button variant="primary" size="sm" className="h-7 px-2.5 text-xs" onClick={handleSave} disabled={updateCount.isPending}>
                {updateCount.isPending ? "Saving..." : "Save"}
              </Button>
            ) : !isPosted && !dirty ? (
              <Button variant="primary" size="sm" className="h-7 px-2.5 text-xs" onClick={handleSubmit} disabled={updateCount.isPending}>
                Submit
              </Button>
            ) : null}
          </div>
        }
      >
        {tab === "scans" ? (
          <CountScanHistoryTable history={scanHistory} items={items} />
        ) : (
        <div className="flex flex-col gap-5">
          <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
            <FormSection>
              <FormGrid>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium leading-none">Stock opname project</label>
                  <Input value={projects.find((p) => p.id === projectId)?.name ?? ""} disabled className="bg-zinc-200/60" />
                </div>

                <Select label="Warehouse" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} disabled={isPosted || !selectedProject}>
                  <option value="">Select warehouse...</option>
                  {filteredWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>

                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-foreground">
                    <Checkbox checked={editPosting} onCheckedChange={(v) => setEditPosting(v === true)} disabled={isPosted} />
                    Edit posting date time
                  </label>
                </div>

                <DatePicker label="Posting date" value={postingDate} disabled={!editPosting || isPosted} onChange={setPostingDate} />
                <TimePicker label="Posting time" value={postingTime} disabled={!editPosting || isPosted} onChange={setPostingTime} />

                <DatePicker label="Cut off date" value={cutOffDate} disabled onChange={setCutOffDate} />
                <TimePicker label="Cut off time" value={cutOffTime} disabled onChange={setCutOffTime} />

                <div className="sm:col-span-2">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-medium leading-none">Notes</label>
                    <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isPosted} placeholder="Add notes..." className="min-h-[80px] bg-zinc-200/60" />
                  </div>
                </div>
              </FormGrid>
            </FormSection>

            <div className="my-6 h-px bg-border" />

            <FormSection className="pb-0">
              <div className="mb-4 grid gap-x-8 sm:grid-cols-2">
                <div>
                  <div className="mb-2">
                    <span className="text-[13px] font-medium text-foreground">Scan Barcode</span>
                  </div>
                  <div className="relative">
                    <Input
                      ref={scanInputRef}
                      value={scanInput}
                      disabled={isPosted}
                      onChange={(e) => setScanInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleScanned(scanInput);
                        }
                      }}
                      placeholder="Scan barcode..."
                      className="h-8 rounded-md pl-3 pr-11 text-[13px] shadow-none focus-visible:ring-1"
                    />
                    <button type="button" disabled={isPosted} aria-label="Scan with camera" onClick={() => alert("Camera scan coming soon")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-zinc-200/80 hover:text-foreground disabled:opacity-50">
                      <Camera size={16} strokeWidth={2} />
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Press Enter to add to Items table.</p>
                </div>

                {scanHistory.length > 0 && (
                  <div>
                    <div className="mb-2">
                      <span className="text-[13px] font-medium text-foreground">Last barcode</span>
                    </div>
                    <div className="overflow-hidden rounded-md border border-border bg-zinc-100 dark:bg-muted/40">
                      <div className="max-h-[280px] overflow-y-auto">
                        {scanHistory.slice(-10).reverse().map((h) => (
                          <div key={h.key} className="break-all border-b border-border/60 bg-card px-3 py-1.5 text-[11.5px] text-foreground last:border-0 even:bg-zinc-50 dark:even:bg-muted/20">
                            {h.barcode}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-lg border border-border">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
                  <span className="text-[12px] font-semibold text-muted-foreground">Items</span>
                  <span className="text-[11px] text-muted-foreground">{rows.length} rows</span>
                </div>

                {rows.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <ScanBarcode size={26} strokeWidth={1.6} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-[13px] font-medium text-foreground">Belum ada item</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">Scan barcode pertama untuk memulai, atau tambah baris manual.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table className="table-fixed border-collapse text-left text-sm [&_th]:border-r [&_th]:border-border/60 [&_td]:border-r [&_td]:border-border/60 [&_th]:last:border-r-0 [&_td]:last:border-r-0">
                      <TableHeader className="bg-muted/40 [&_tr]:border-border">
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="w-10 px-3">
                            <Checkbox checked={rows.length > 0 && selectedKeys.size === rows.length ? true : selectedKeys.size > 0 ? "indeterminate" : false} onCheckedChange={() => setSelectedKeys((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.key))))} aria-label="Select all" disabled={isPosted} />
                          </TableHead>
                          <TableHead className="w-12 px-3">No.</TableHead>
                          <TableHead className="min-w-[220px] px-4">Item Code</TableHead>
                          <TableHead className="w-[100px] px-4 text-right">Qty</TableHead>
                          <TableHead className="w-[140px] px-4">Batch</TableHead>
                          <TableHead className="w-[100px] px-4">UOM</TableHead>
                          <TableHead className="w-[160px] px-4">Warehouse</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, idx) => {
                          const item = itemMap.get(r.itemId);
                          const uomName = r.uomId ? (uomMap.get(r.uomId) ?? r.uomId) : item?.uomId ? (uomMap.get(item.uomId) ?? item.uomId) : "—";
                          return (
                            <TableRow key={r.key} className={cn("border-border/70", selectedKeys.has(r.key) && "bg-muted/50")}>
                              <TableCell className="px-3">
                                <Checkbox checked={selectedKeys.has(r.key)} onCheckedChange={() => toggleRow(r.key)} aria-label={`Select row ${idx + 1}`} disabled={isPosted} />
                              </TableCell>
                              <TableCell className="px-3 text-sm text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell className="px-4">
                                <SearchableSelect compact value={r.itemId} onChange={(v) => { const it = itemMap.get(v); setRow(r.key, { itemId: v, uomId: it?.uomId ?? "" }); }} options={items.map((i) => ({ value: i.id, label: `${i.code}: ${i.name}` }))} placeholder="Select item..." emptyLabel="No items" className="w-full" disabled={isPosted} />
                              </TableCell>
                              <TableCell className="px-4">
                                <Input type="number" value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })} disabled={isPosted} placeholder="0" className="h-8 w-full text-right text-sm shadow-none" />
                              </TableCell>
                              <TableCell className="px-4">
                                <Input value={r.batch} onChange={(e) => setRow(r.key, { batch: e.target.value })} disabled={isPosted} placeholder="—" className="h-8 w-full text-sm shadow-none" />
                              </TableCell>
                              <TableCell className="px-4 text-xs text-muted-foreground">{uomName}</TableCell>
                              <TableCell className="px-4 text-xs text-muted-foreground">{selectedWarehouseName}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {!isPosted && (
                <div className="mt-3 flex items-center justify-start">
                  {selectedKeys.size > 0 ? (
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { setRows((prev) => prev.filter((r) => !selectedKeys.has(r.key))); setSelectedKeys(new Set()); }}>
                      <Trash2 size={13} strokeWidth={2} />
                      Delete ({selectedKeys.size})
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={() => setRows((prev) => [...prev, { key: nextKey(), itemId: "", qty: "", batch: "", uomId: "" }])}>
                      <Plus size={13} strokeWidth={2} />
                      Add row
                    </Button>
                  )}
                </div>
              )}
            </FormSection>
          </div>
        </div>
        )}
      </FormPage>
    </div>
  );
}