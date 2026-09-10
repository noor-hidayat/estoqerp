import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Pencil, X } from "lucide-react";
import { useQcInspection, useSubmitQcInspection, useCancelQcInspection, useRemoveQcInspection, useUpdateQcInspection, useReceiving, useSuppliers, usePurchaseOrders, useQcParameters } from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { DocMenu } from "@/components/ui/doc-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { DatePicker } from "@/components/ui/date-picker";
import { DocStatusBadge } from "@/components/supply/doc-status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useErrorToast } from "@/hooks/use-error-toast";
import { formatId, formatNumber } from "@/lib/utils";
import { useItemsList } from "@/lib/api/query";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function QcDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: qc, isLoading } = useQcInspection(id) as any;
  const { data: receiving } = useReceiving(qc?.receivingId) as any;
  const { data: items = [] } = useItemsList();
  const { data: suppliers = [] } = useSuppliers();
  const { data: pos = [] } = usePurchaseOrders() as any;
  const { data: qcParams = [] } = useQcParameters();
  const submit = useSubmitQcInspection();
  const cancel = useCancelQcInspection();
  const remove = useRemoveQcInspection();
  const update = useUpdateQcInspection();
  const [error, setError] = useState("");
  useErrorToast(error);
  const [editing, setEditing] = useState(false);
  const [formNotes, setFormNotes] = useState("");
  const [editPostingDate, setEditPostingDate] = useState(todayISO());
  const [editQtyReject, setEditQtyReject] = useState<string[]>([]);
  const [editParamRows, setEditParamRows] = useState<Array<{ itemIdx: number; parameterId: string; qty: string }>>([]);

  useEffect(() => {
    if (qc) {
      setFormNotes(qc.notes ?? "");
      setEditPostingDate(qc.inspectionDate?.slice(0, 10) ?? todayISO());
      if (qc.lines) {
        setEditQtyReject(qc.lines.map((l: any) => String(l.qtyRejected ?? "0")));
        const flat: Array<{ itemIdx: number; parameterId: string; qty: string }> = [];
        (qc.lines as any[]).forEach((l: any, idx: number) => {
          (l.params ?? []).forEach((p: any) => flat.push({ itemIdx: idx, parameterId: p.parameterId, qty: String(p.qty) }));
        });
        setEditParamRows(flat);
      }
    }
  }, [qc?.id]);

  const startEdit = () => {
    if (!qc) return;
    setFormNotes(qc.notes ?? "");
    setEditPostingDate(qc.inspectionDate?.slice(0, 10) ?? todayISO());
    setEditQtyReject((qc.lines ?? []).map((l: any) => String(l.qtyRejected ?? "0")));
    const flat: Array<{ itemIdx: number; parameterId: string; qty: string }> = [];
    (qc.lines as any[]).forEach((l: any, idx: number) => {
      (l.params ?? []).forEach((p: any) => flat.push({ itemIdx: idx, parameterId: p.parameterId, qty: String(p.qty) }));
    });
    setEditParamRows(flat);
    setEditing(true);
  };

  if (isLoading) return <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}><p className="py-20 text-center text-muted-foreground">Loading…</p></RoleGuard>;
  if (!qc) return <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}><p className="py-20 text-center">QC tidak ditemukan.</p></RoleGuard>;

  const isDraft = qc.status === "DRAFT";
  const isCompleted = qc.status === "COMPLETED";

  const onSubmit = async () => {
    if (!confirm("Submit QC ini? Receiving akan menjadi COMPLETED.")) return;
    try { await submit.mutateAsync(qc.id); } catch (e) { setError(e instanceof Error ? e.message : "Gagal submit"); }
  };
  const onCancel = async () => {
    if (!confirm("Batalkan QC ini?")) return;
    try { await cancel.mutateAsync(qc.id); } catch (e) { setError(e instanceof Error ? e.message : "Gagal cancel"); }
  };
  const onDelete = async () => {
    if (!confirm("Hapus QC ini? Data akan dihapus dari database.")) return;
    try { await remove.mutateAsync(qc.id); navigate("/app/qc"); } catch (e) { setError(e instanceof Error ? e.message : "Gagal hapus"); }
  };
  const onSaveEdit = async () => {
    try {
      const lines = (qc.lines ?? []).map((rl: any, idx: number) => {
        const params = editParamRows.filter((r) => r.itemIdx === idx).map((p) => ({ parameterId: p.parameterId, qty: p.qty }));
        return { id: rl.id, qtyRejected: editQtyReject[idx] ?? "0", rejectReason: params.length ? params.map((p) => { const pr = (qcParams as any[]).find((x) => x.id === p.parameterId); return `${pr?.name ?? p.parameterId}:${p.qty}`; }).join(", ") : null, qtyReceived: rl.qtyReceived, itemId: rl.itemId, uomId: rl.uomId, batchNumber: rl.batchNumber, params };
      });
      await update.mutateAsync({ id: qc.id, patch: { inspectionDate: editPostingDate || todayISO(), notes: formNotes.trim() || null, lines } } as any);
      setEditing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal save"); }
  };

  const docNo = (qc as any).documentNo ?? formatId(qc.id);
  const receivingDocNo = (receiving as any)?.documentNo ?? (receiving ? formatId((receiving as any).id) : formatId(qc?.receivingId));
  const supplierIdForReceiving = (receiving as any)?.supplierId ?? (qc as any)?.supplierId ?? (pos.find((p: any) => p.id === (receiving as any)?.purchaseOrderId) as any)?.supplierId;
  const supplierName = suppliers.find((s) => s.id === supplierIdForReceiving)?.name ?? "—";
  const displayPostingDate = editing ? editPostingDate : (qc.inspectionDate?.slice(0, 10) ?? todayISO());

  const hasAnyReject = editing ? editQtyReject.some((v) => Number(v) > 0) : (qc.lines ?? []).some((l: any) => Number(l.qtyRejected) > 0);
  const getQtyAccepted = (idx: number, rejected: string | number) => {
    const received = Number((qc.lines?.[idx] as any)?.qtyReceived ?? (receiving?.lines?.[idx] as any)?.qty ?? 0);
    return received - Number(rejected || 0);
  };

  return (
    <RoleGuard roles={[]} menus={["supply.purchaseOrders"]}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{docNo}</h1>
            <DocStatusBadge status={qc.status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft && !editing && <Button variant="outline" size="sm" onClick={startEdit}><Pencil size={14} strokeWidth={2}/>Edit</Button>}
          {isDraft && !editing && <Button variant="primary" size="sm" onClick={onSubmit} disabled={submit.isPending}>Submit</Button>}
          {isDraft && !editing && <DocMenu onCancel={onCancel} onDelete={onDelete} />}
          {editing && <Button variant="ghost" size="sm" onClick={()=>setEditing(false)}><X size={14} strokeWidth={2}/>Discard</Button>}
          {editing && <Button variant="primary" size="sm" onClick={onSaveEdit}>Save</Button>}
          {isCompleted && <Button variant="outline" size="sm" onClick={()=>navigate(`/app/receiving/${(receiving as any)?.documentNo ?? qc.receivingId}`)}>View Receiving</Button>}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <SearchableSelect label="Document" placeholder="—" options={[{ value: qc.receivingId, label: receivingDocNo }]} value={qc.receivingId} onChange={()=>{}} disabled />
            <DatePicker label="Posting Date" value={displayPostingDate} onChange={(v) => setEditPostingDate(v)} disabled={!editing} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium leading-none">Supplier Name</label>
              <div className="flex h-8 items-center rounded-md border border-input bg-zinc-100 px-3 text-[13px] text-foreground">{supplierName}</div>
            </div>
            <div aria-hidden="true" />
            <div className="flex flex-col gap-1.5">
              <label className="mb-1.5 block text-sm font-medium">Notes</label>
              <Textarea value={editing ? formNotes : qc.notes ?? ""} onChange={(e)=>setFormNotes(e.target.value)} disabled={!editing} placeholder="—" />
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Items</h2>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <Table className="table-fixed text-left text-[13px] border border-border">
                <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                  <TableRow className="border-border hover:bg-transparent divide-x divide-border">
                    <TableHead className="w-10 px-3 text-center">No</TableHead>
                    <TableHead className="min-w-[200px] px-3">Item Code</TableHead>
                    <TableHead className="w-[120px] px-3 text-right">Qty Reject</TableHead>
                    <TableHead className="w-[120px] px-3 text-right">Qty Accept</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-border/70">
                  {(qc.lines ?? []).map((rl: any, idx: number) => {
                    const it = items.find((i) => i.id === rl.itemId);
                    const qtyReject = editing ? (editQtyReject[idx] ?? "0") : String(rl.qtyRejected ?? "0");
                    const qtyAccept = editing ? String(getQtyAccepted(idx, qtyReject)) : String(rl.qtyAccepted ?? (Number(rl.qtyReceived) - Number(rl.qtyRejected || 0)));
                    return (
                      <TableRow key={rl.id ?? idx} className="border-border/70 hover:bg-transparent divide-x divide-border">
                        <TableCell className="px-3 text-center text-muted-foreground">{idx+1}</TableCell>
                        <TableCell className="px-3 font-medium">{it ? `${it.code}: ${it.name}` : rl.itemId}</TableCell>
                        <TableCell className="px-3 text-right">
                          {editing ? (
                            <Input type="number" min={0} value={qtyReject} onChange={(e)=> { const v=e.target.value; setEditQtyReject(prev=>{ const c=[...prev]; c[idx]=v; return c; }); }} className="h-8 text-right" />
                          ) : (
                            <span className="tabular-nums text-destructive">{formatNumber(rl.qtyRejected ?? "0")}</span>
                          )}
                        </TableCell>
                        <TableCell className="px-3 text-right font-medium text-emerald-700">{formatNumber(qtyAccept)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {hasAnyReject && (
          <div>
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-muted-foreground">Parameter</h2>
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <Table className="table-fixed text-left text-[13px] border border-border">
                  <TableHeader className="bg-zinc-100 dark:bg-zinc-800 [&_tr]:border-border">
                    <TableRow className="border-border hover:bg-transparent divide-x divide-border">
                      <TableHead className="w-10 px-3 text-center">No</TableHead>
                      <TableHead className="min-w-[180px] px-3">Item Code</TableHead>
                      <TableHead className="px-3">Parameter</TableHead>
                      <TableHead className="w-[120px] px-3 text-right">Qty</TableHead>
                      {editing && <TableHead className="w-10 px-3"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&_tr]:border-border/70">
                    {(editing ? editParamRows : ((): Array<{itemIdx:number, parameterId:string, qty:string, id?:string}> => {
                      const flat: Array<{itemIdx:number, parameterId:string, qty:string, id?:string}> = [];
                      (qc.lines ?? []).forEach((l: any, idx: number) => {
                        (l.params ?? []).forEach((p: any) => flat.push({ itemIdx: idx, parameterId: p.parameterId, qty: String(p.qty), id: p.id }));
                      });
                      return flat;
                    })()
                    ).map((row: any, rIdx: number) => {
                      const itemIdx = row.itemIdx;
                      const rl = (qc.lines ?? [])[itemIdx] as any;
                      const it = rl ? items.find((i) => i.id === rl.itemId) : null;
                      const itemLabel = it ? `${it.code}: ${it.name}` : `Item ${itemIdx+1}`;
                      const param = (qcParams as any[]).find((x) => x.id === row.parameterId);
                      return (
                        <TableRow key={rIdx} className="border-border/70 hover:bg-transparent divide-x divide-border">
                          <TableCell className="px-3 text-center text-muted-foreground">{rIdx+1}</TableCell>
                          <TableCell className="px-3 font-medium text-xs">{itemLabel}</TableCell>
                          <TableCell className="px-3">
                            {editing ? (
                              <SearchableSelect
                                placeholder="Pilih parameter..."
                                columnTitle="Parameter"
                                options={(qcParams as any[]).filter((x) => x.isActive).map((x) => ({ value: x.id, label: `${x.code} - ${x.name}` }))}
                                value={row.parameterId}
                                onChange={(v) => setEditParamRows(prev=> prev.map((r,i)=> i===rIdx ? {...r, parameterId:v} : r))}
                              />
                            ) : (
                              <span className="text-xs">{param ? `${param.code} - ${param.name}` : row.parameterId}</span>
                            )}
                          </TableCell>
                          <TableCell className="px-3 text-right">
                            {editing ? (
                              <Input type="number" min={1} value={row.qty} onChange={(e)=> setEditParamRows(prev=> prev.map((r,i)=> i===rIdx ? {...r, qty:e.target.value} : r))} className="h-8 text-right" />
                            ) : (
                              <span className="tabular-nums">{formatNumber(row.qty)}</span>
                            )}
                          </TableCell>
                          {editing && <TableCell className="px-3 text-center"><Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={()=> setEditParamRows(prev=> prev.filter((_,i)=>i!==rIdx))}>×</Button></TableCell>}
                        </TableRow>
                      );
                    })}
                    {(!editing && (qc.lines ?? []).every((l:any)=> Number(l.qtyRejected||0)===0)) || (editing && editParamRows.length===0 && hasAnyReject) ? (
                      <TableRow><TableCell colSpan={editing ? 5 : 4} className="px-3 py-6 text-center text-muted-foreground text-xs">{editing ? "Belum ada parameter — klik Add Parameter" : "Tidak ada parameter"}</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
              {editing && (
                <div className="border-t border-border p-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2.5 text-xs"
                    onClick={() => {
                      const nextIdx = (() => {
                        const rejectByItem = (qc.lines ?? []).map((_:any, i:number) => Number(editQtyReject[i]||0));
                        for (let i=0;i<rejectByItem.length;i++) {
                          const allocated = editParamRows.filter((r)=> r.itemIdx===i).reduce((s,r)=> s+Number(r.qty||0),0);
                          if (allocated < rejectByItem[i]) return i;
                        }
                        return null;
                      })();
                      if (nextIdx===null) { setError("Semua Qty Reject sudah teralokasi."); return; }
                      const first = (qcParams as any[])[0]?.id ?? "";
                      setEditParamRows(prev=> [...prev, { itemIdx: nextIdx, parameterId: first, qty: "1" }]);
                    }}
                  >
                    + Add Parameter
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  );
}
