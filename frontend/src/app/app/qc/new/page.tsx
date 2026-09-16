import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useReceivings, useReceiving, useCreateQcInspection, useSubmitQcInspection, useQcParameters, useSuppliers, usePurchaseOrders } from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSkeleton } from "@/components/ui/skeleton";
import { FormPage, FormSection, FormGrid, FormActions } from "@/components/ui/form-page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableInput } from "@/components/ui/table-input";
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId, formatNumber } from "@/lib/utils";
import { useItemsList } from "@/lib/api/query";

function todayISO() { return new Date().toISOString().slice(0, 10); }

export default function NewQcInspectionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialReceivingId = searchParams.get("receivingId") ?? "";
  const { data: receivings = [], isLoading: recvLoading } = useReceivings();
  const { data: items = [] } = useItemsList();
  const { data: qcParams = [] } = useQcParameters();
  const { data: suppliers = [] } = useSuppliers();
  const { data: pos = [] } = usePurchaseOrders();
  const create = useCreateQcInspection();
  const submitQc = useSubmitQcInspection();
  const [error, setError] = useState("");
  useErrorToast(error);

  const pendingReceivings = receivings.filter((r: any) => r.status === "PENDING_QC");

  const [receivingId, setReceivingId] = useState(initialReceivingId);
  const [inspectionDate, setInspectionDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [qcQtyReject, setQcQtyReject] = useState<string[]>([]);
  const [paramRows, setParamRows] = useState<Array<{ itemIdx: number; parameterId: string; qty: string }>>([]);

  const { data: receiving } = useReceiving(receivingId || undefined) as any;
  const supplierIdForReceiving = (receiving as any)?.supplierId ?? (pos.find((p: any) => p.id === (receiving as any)?.purchaseOrderId) as any)?.supplierId;
  const supplierName = suppliers.find((s) => s.id === supplierIdForReceiving)?.name ?? "";
  const postingDateFromReceiving = (receiving as any)?.receiptDate?.slice(0, 10) ?? "";

  useEffect(() => {
    if (receiving?.lines) {
      setQcQtyReject(receiving.lines.map(() => "0"));
      setParamRows([]);
    } else {
      setQcQtyReject([]);
      setParamRows([]);
    }
  }, [receiving?.id]);

  useEffect(() => {
    if (initialReceivingId) setReceivingId(initialReceivingId);
  }, [initialReceivingId]);

  const getNextItemIdx = () => {
    const lines = receiving?.lines ?? [];
    for (let i = 0; i < lines.length; i++) {
      const reject = Number(qcQtyReject[i] || 0);
      if (reject === 0) continue;
      const allocated = paramRows.filter((r) => r.itemIdx === i).reduce((s, r) => s + Number(r.qty || 0), 0);
      if (allocated < reject) return i;
    }
    return null;
  };

  const hasAnyReject = qcQtyReject.some((v) => Number(v) > 0);

  const doCreate = async (): Promise<string | null> => {
    if (!receivingId) { setError("Pilih No Receiving (PENDING_QC) dulu."); return null; }
    if (!inspectionDate) { setError("Inspection date wajib."); return null; }
    if (!receiving) { setError("Receiving tidak ditemukan."); return null; }
    const lines = receiving.lines ?? [];
    for (let i = 0; i < lines.length; i++) {
      const received = Number((lines[i] as any).qty || 0);
      const rejected = Number(qcQtyReject[i] || 0);
      if (rejected < 0 || rejected > received) { setError(`Qty Reject baris ${i+1} melebihi Qty Received (${received}).`); return null; }
      if (rejected > 0) {
        const allocated = paramRows.filter((r) => r.itemIdx === i).reduce((s, r) => s + Number(r.qty || 0), 0);
        if (allocated !== rejected) { setError(`Total qty parameter untuk ${items.find((x) => x.id === lines[i].itemId)?.code ?? `Item ${i+1}`} harus sama dengan Qty Reject (${rejected}). Saat ini ${allocated}.`); return null; }
        const rowsForItem = paramRows.filter((r) => r.itemIdx === i);
        if (rowsForItem.length === 0) { setError(`Tabel parameter wajib diisi untuk baris ${i+1} karena Qty Reject > 0.`); return null; }
        for (const r of rowsForItem) {
          if (!r.parameterId) { setError(`Pilih parameter untuk baris ${i+1}.`); return null; }
          if (!r.qty || Number(r.qty) <= 0) { setError(`Qty parameter baris ${i+1} harus >0.`); return null; }
        }
      } else {
        const hasParam = paramRows.some((r) => r.itemIdx === i);
        if (hasParam) { setError(`Item ${i+1} reject 0 tidak boleh ada baris parameter.`); return null; }
      }
    }
    try {
      const qcLines = lines.map((rl: any, idx: number) => {
        const received = Number(rl.qty || 0);
        const rejected = Number(qcQtyReject[idx] || 0);
        const accepted = received - rejected;
        const params = paramRows.filter((r) => r.itemIdx === idx).map((p) => ({ parameterId: p.parameterId, qty: String(p.qty), note: null }));
        const rejectReason = params.length ? params.map((p) => { const pr = qcParams.find((x) => x.id === p.parameterId); return `${pr?.name ?? p.parameterId}:${p.qty}`; }).join(", ") : null;
        return {
          receivingLineId: rl.id,
          itemId: rl.itemId,
          uomId: rl.uomId,
          qtyReceived: String(received),
          qtyRejected: String(rejected),
          qtyAccepted: String(accepted),
          batchNumber: rl.batchNumber ?? null,
          rejectReason,
          params,
        };
      });
      const res = await create.mutateAsync({
        receivingId,
        inspectionDate,
        notes: notes.trim() || null,
        qcNotes: null,
        lines: qcLines,
      } as any);
      return (res as any).documentNo ?? (res as any).id;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat QC Inspection.");
      return null;
    }
  };

  const onSaveDraft = async () => {
    const docNo = await doCreate();
    if (docNo) navigate(`/app/qc/${encodeURIComponent(docNo)}`, { replace: true });
  };
  const onSaveSubmit = async () => {
    const docNo = await doCreate();
    if (!docNo) return;
    try {
      await submitQc.mutateAsync(docNo);
      navigate(`/app/qc/${encodeURIComponent(docNo)}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal submit QC.");
      navigate(`/app/qc/${encodeURIComponent(docNo)}`, { replace: true });
    }
  };

  if (recvLoading) {
    return <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}><FormSkeleton sections={[["half","half","half"]]} /></RoleGuard>;
  }

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <FormPage title="New QC Inspection">
        <FormSection>
          <FormGrid className="gap-x-6 gap-y-4">
            <SearchableSelect
              label="Document (No Receiving)"
              placeholder="Pilih receiving PENDING_QC..."
              options={pendingReceivings.map((r: any) => ({ value: r.id, label: `${r.documentNo ?? formatId(r.id)} · ${r.status}` }))}
              value={receivingId}
              onChange={(v) => setReceivingId(v)}
            />
            <DatePicker label="Posting Date" value={postingDateFromReceiving} onChange={() => {}} disabled />
            <DatePicker label="Inspection Date" value={inspectionDate} onChange={(v) => setInspectionDate(v)} />
            <SearchableSelect
              label="Supplier Name"
              placeholder={receivingId ? supplierName : "Pilih receiving dulu..."}
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
              value={supplierIdForReceiving ?? ""}
              onChange={() => {}}
              disabled
            />
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium leading-none">Notes</label>
              <Textarea placeholder="Catatan umum..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </FormGrid>
        </FormSection>

        {!receivingId || !receiving ? (
          <FormSection title="Items">
            <div className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-center"><p className="text-sm text-muted-foreground">Pilih No Receiving untuk menampilkan item.</p></div>
          </FormSection>
        ) : (receiving.lines?.length ?? 0) === 0 ? (
          <FormSection title="Items">
            <div className="rounded-lg border border-border bg-card px-6 py-8 text-center"><p className="text-sm text-muted-foreground">Receiving tidak memiliki item.</p></div>
          </FormSection>
        ) : (
          <>
            <FormSection title="Items">
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="overflow-x-auto">
                  <Table className="table-fixed text-left text-[13px] border-collapse">
                    <TableHeader className="bg-zinc-100 dark:bg-zinc-800 border-b border-border [&_tr]:border-border">
                      <TableRow className="border-border hover:bg-transparent divide-x divide-border">
                        <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">No</TableHead>
                        <TableHead className="min-w-[200px] px-3">Item Code</TableHead>
                        <TableHead className="w-[120px] px-3 text-right">Qty Reject</TableHead>
                        <TableHead className="w-[120px] px-3 text-right">Qty Accept</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="[&_tr]:border-border/70">
                      {(receiving.lines ?? []).map((rl: any, idx: number) => {
                        const it = items.find((i) => i.id === rl.itemId);
                        const received = Number(rl.qty || 0);
                        const rejected = Number(qcQtyReject[idx] || 0);
                        const accepted = received - rejected;
                        return (
                          <TableRow key={rl.id ?? idx} className="border-border/70 hover:bg-transparent divide-x divide-border">
                            <TableCell className="px-3 text-center text-muted-foreground">{idx+1}</TableCell>
                            <TableCell className="px-3 font-medium">{it ? `${it.code}: ${it.name}` : rl.itemId}</TableCell>
                            <TableCell className="p-0 border-r border-border">
                              <TableInput value={qcQtyReject[idx] ?? "0"} onChange={(v) => setQcQtyReject(prev=>{ const c=[...prev]; c[idx]=v; return c; })} columnTitle="Qty Reject" isNumeric />
                            </TableCell>
                            <TableCell className="px-3 text-right font-medium text-emerald-700">{formatNumber(accepted)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </FormSection>

            {hasAnyReject && (
              <FormSection title="Parameter">
                <div className="overflow-hidden rounded-lg border border-border">
                  <div className="overflow-x-auto">
                    <Table className="table-fixed text-left text-[13px] border-collapse">
                      <TableHeader className="bg-zinc-100 dark:bg-zinc-800 border-b border-border [&_tr]:border-border">
                        <TableRow className="border-border hover:bg-transparent divide-x divide-border">
                          <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">No</TableHead>
                          <TableHead className="min-w-[200px] px-3">Item Code</TableHead>
                          <TableHead className="px-3">Parameter</TableHead>
                          <TableHead className="w-[120px] px-3 text-right">Qty</TableHead>
                          <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="[&_tr]:border-border/70">
                        {paramRows.length === 0 ? (
                          <TableRow><TableCell colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-xs">Belum ada parameter — klik Add Parameter</TableCell></TableRow>
                        ) : (
                          paramRows.map((row, rIdx) => {
                            const rl = (receiving.lines ?? [])[row.itemIdx] as any;
                            const it = rl ? items.find((i) => i.id === rl.itemId) : null;
                            return (
                              <TableRow key={rIdx} className="border-border/70 hover:bg-transparent divide-x divide-border">
                                <TableCell className="px-3 text-center text-muted-foreground">{rIdx+1}</TableCell>
                                <TableCell className="px-3 font-medium text-xs">{it ? `${it.code}: ${it.name}` : `Item ${row.itemIdx+1}`}</TableCell>
                                <TableCell className="p-0 border-r border-border">
                                  <SearchableSelect
                                  table
                                  columnTitle="Parameter"
                                  placeholder="Pilih parameter..."
                                    options={qcParams.filter((x) => x.isActive).map((x) => ({ value: x.id, label: `${x.code} - ${x.name}` }))}
                                    value={row.parameterId}
                                    onChange={(v) => setParamRows(prev => prev.map((r,i)=> i===rIdx ? {...r, parameterId:v} : r))}
                                  />
                                </TableCell>
                                <TableCell className="p-0 border-r border-border"><TableInput value={row.qty} onChange={(v)=> setParamRows(prev=> prev.map((r,i)=> i===rIdx ? {...r, qty:v} : r))} columnTitle="Qty" isNumeric /></TableCell>
                                <TableCell className="px-3 text-center"><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={()=> setParamRows(prev=> prev.filter((_,i)=>i!==rIdx))}>×</Button></TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="border-t border-border p-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2.5 text-xs"
                      onClick={() => {
                        const nextIdx = getNextItemIdx();
                        if (nextIdx === null) { setError("Semua Qty Reject sudah teralokasi. Tambah Qty Reject dulu di tabel atas."); return; }
                        setParamRows(prev => [...prev, { itemIdx: nextIdx, parameterId: "", qty: "" }]);
                      }}
                    >
                      + Add Parameter
                    </Button>
                  </div>
                </div>
              </FormSection>
            )}
          </>
        )}

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/qc")}><ArrowLeft size={15} strokeWidth={2}/>Back</Button>
          <Button variant="outline" onClick={onSaveDraft} disabled={create.isPending || submitQc.isPending}>{create.isPending ? "Menyimpan..." : "Save Draft"}</Button>
          <Button variant="primary" onClick={onSaveSubmit} disabled={create.isPending || submitQc.isPending}>{create.isPending||submitQc.isPending ? "Menyimpan..." : "Save & Submit"}</Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
