import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import {
  useWorkflow,
  useUpdateWorkflow,
  useRemoveWorkflow,
  useSubmitWorkflow,
  useWorkflowStates,
  useCreateWorkflowState,
  useUpdateWorkflowState,
  useRemoveWorkflowState,
  useWorkflowTransitions,
  useCreateWorkflowTransition,
  useUpdateWorkflowTransition,
  useRemoveWorkflowTransition,
  useRoles,
} from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DocStatusBadge } from "@/components/data-display/doc-status";
import { DocMenu } from "@/components/ui/doc-menu";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: workflow, isLoading } = useWorkflow(id);
  const { data: states = [] } = useWorkflowStates(id);
  const { data: transitions = [] } = useWorkflowTransitions(id);
  const { data: roles = [] } = useRoles();
  const update = useUpdateWorkflow();
  const remove = useRemoveWorkflow();
  const submit = useSubmitWorkflow();
  const createState = useCreateWorkflowState();
  const updateState = useUpdateWorkflowState();
  const removeState = useRemoveWorkflowState();
  const createTransition = useCreateWorkflowTransition();
  const updateTransition = useUpdateWorkflowTransition();
  const removeTransition = useRemoveWorkflowTransition();

  const [form, setForm] = useState({ name: "", documentType: "PO", isActive: true, isDefault: false });
  const [approvers, setApprovers] = useState<{ roleId: string; requiresSignature: boolean }[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (workflow) {
      setForm({
        name: workflow.name,
        documentType: workflow.documentType,
        isActive: workflow.isActive,
        isDefault: workflow.isDefault,
      });
    }
  }, [workflow]);

  // Sync approvers from workflow states (intermediate only) — harus sebelum early return (Rules of Hooks)
  useEffect(() => {
    if (states.length && roles.length && approvers.length === 0) {
      const sorted = [...states].filter((s: any) => s.type === "intermediate").sort((a: any, b: any) => a.orderNo - b.orderNo);
      if (sorted.length) {
        const mapped = sorted.map((s: any) => {
          const byName = roles.find((r: any) => r.name.toLowerCase() === s.name.toLowerCase());
          const byCode = roles.find((r: any) => r.code?.toLowerCase() === s.code.toLowerCase());
          const found = byName ?? byCode;
          return { roleId: found ? found.id : "", requiresSignature: !!s.requiresSignature };
        });
        if (mapped.some((m) => m.roleId)) setApprovers(mapped);
      }
    }
  }, [states, roles, approvers.length]);

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  if (!workflow) return <div className="py-20 text-center">Workflow not found</div>;

  const isDraft = (workflow as any).status === "DRAFT";
  const isActive = (workflow as any).status === "ACTIVE";

  // Not save detection — bandingkan form + approvers vs snapshot awal
  const initialApproversSnapshot = (() => {
    const sorted = [...states].filter((s: any) => s.type === "intermediate").sort((a: any, b: any) => a.orderNo - b.orderNo);
    return sorted.map((s: any) => {
      const byName = roles.find((r: any) => r.name.toLowerCase() === s.name.toLowerCase());
      const byCode = roles.find((r: any) => r.code?.toLowerCase() === s.code.toLowerCase());
      const found = byName ?? byCode;
      return { roleId: found ? found.id : "", requiresSignature: !!s.requiresSignature };
    });
  })();
  const dirty =
    form.name !== workflow.name ||
    form.documentType !== workflow.documentType ||
    form.isActive !== workflow.isActive ||
    form.isDefault !== workflow.isDefault ||
    JSON.stringify(approvers) !== JSON.stringify(initialApproversSnapshot);

  const saveAll = async () => {
    // Save header + approval steps sekaligus (keseluruhan) — tetap DRAFT
    await update.mutateAsync({ id: workflow.id, patch: form });
    for (const s of states) {
      if ((s as any).type === "intermediate") await removeState.mutateAsync(s.id);
    }
    for (let i = 0; i < approvers.length; i++) {
      const ap = approvers[i];
      if (!ap.roleId) continue;
      const role = roles.find((r: any) => r.id === ap.roleId);
      const code = `LEVEL_${i + 1}`;
      const name = role ? role.name : `Level ${i + 1}`;
      await createState.mutateAsync({
        workflowId: workflow.id,
        body: { code, name, type: "intermediate", color: "neutral", orderNo: i + 1, requiresSignature: !!ap.requiresSignature },
      });
    }
  };
  const onDelete = async () => {
    if (!confirm("Delete workflow?")) return;
    await remove.mutateAsync(workflow.id);
    navigate("/app/settings/workflows");
  };
  const onSubmit = async () => {
    if (dirty) {
      alert("Simpan perubahan dulu (Save) sebelum Submit.");
      return;
    }
    if (!confirm("Submit workflow? Status akan menjadi ACTIVE dan tidak bisa diedit lagi.")) return;
    try {
      await submit.mutateAsync(workflow.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal submit.");
    }
  };

  const stateName = (id: string | null) => {
    const s = states.find((x) => x.id === id);
    return s ? `${s.code} — ${s.name}` : id;
  };
  const roleNames = (ids: string[]) => {
    if (!ids.length) return "";
    return ids.map((rid) => roles.find((r) => r.id === rid)?.name ?? rid).join(", ");
  };

  const onCancel = () => {
    setForm({
      name: workflow.name,
      documentType: workflow.documentType,
      isActive: workflow.isActive,
      isDefault: workflow.isDefault,
    });
    setApprovers(initialApproversSnapshot);
    setSelectedApprovers(new Set());
  };

  const isEditable = isDraft;

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.workflows"]}>
      <FormPage
        title={workflow.name}
        titleBadge={isDraft && dirty ? <Badge tone="destructive">Not save</Badge> : <DocStatusBadge status={(workflow as any).status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isDraft ? (
              <>
                {dirty ? (
                  <Button size="sm" onClick={saveAll} disabled={update.isPending || createState.isPending || removeState.isPending}>
                    Save
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={onSubmit} disabled={submit.isPending}>
                    Submit
                  </Button>
                )}
                <DocMenu onCancel={onCancel} onDelete={onDelete} />
              </>
            ) : (
              <DocMenu onCancel={onCancel} onDelete={onDelete} />
            )}
          </div>
        }
      >
        <FormSection>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={!isEditable} />
            </div>
            <Select label="Document Type" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} disabled={!isEditable} className="h-8">
              <option value="PO">PO</option>
              <option value="SO">SO</option>
              <option value="GR">GR</option>
              <option value="RECEIVING">RECEIVING</option>
              <option value="QC">QC</option>
              <option value="DELIVERY">DELIVERY</option>
            </Select>
            <div className="flex flex-col justify-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} disabled={!isEditable} /> Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: !!v })} disabled={!isEditable} /> Default
              </label>
            </div>
          </div>
        </FormSection>

        {/* ── Garis pemisah antara Document Type dan Approval Steps ── */}
        <div className="border-t border-border pt-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold tracking-tight text-foreground">Approval Steps</h3>
            {approvers.length > 0 && (
              <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {approvers.length} level
              </span>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <Table className="table-fixed text-left text-[13px]">
              <TableHeader className="bg-zinc-100 dark:bg-zinc-800">
                <TableRow className="border-b hover:bg-zinc-100 dark:hover:bg-zinc-800 divide-x divide-border">
                  <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center">
                    <Checkbox
                      checked={
                        approvers.length > 0 && selectedApprovers.size === approvers.length
                          ? true
                          : selectedApprovers.size > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(v) => {
                        if (!isEditable) return;
                        if (v) setSelectedApprovers(new Set(approvers.map((_, i) => i)));
                        else setSelectedApprovers(new Set());
                      }}
                      disabled={!isEditable}
                      aria-label="select all"
                    />
                  </TableHead>
                  <TableHead className="w-[40px] min-w-[40px] max-w-[40px] px-3 text-center text-[13px] font-semibold text-muted-foreground">No</TableHead>
                  <TableHead className="px-3 text-[13px] font-semibold text-muted-foreground">Role</TableHead>
                  <TableHead className="w-32 px-3 text-center text-[13px] font-semibold text-muted-foreground">Signature</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border">
                {approvers.map((ap, idx) => (
                  <TableRow key={idx} className="divide-x divide-border hover:bg-muted/40">
                    <TableCell className="px-2 py-2 text-center">
                      <Checkbox
                        checked={selectedApprovers.has(idx)}
                        disabled={!isEditable}
                        onCheckedChange={(v) => {
                          const next = new Set(selectedApprovers);
                          if (v) next.add(idx);
                          else next.delete(idx);
                          setSelectedApprovers(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className={isEditable ? "p-0" : "px-3 py-2"}>
                      {isEditable ? (
                        <SearchableSelect
                          table
                          placeholder="Select role..."
                          columnTitle="Role"
                          options={(roles as any[]).map((r: any) => ({ value: r.id, label: r.name }))}
                          value={ap.roleId}
                          onChange={(v) => setApprovers((prev) => prev.map((x, i) => (i === idx ? { ...x, roleId: v } : x)))}
                        />
                      ) : (
                        <div className="flex h-9 items-center text-[13px] text-foreground">
                          {roles.find((r: any) => r.id === ap.roleId)?.name ?? ""}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!ap.requiresSignature}
                          disabled={!isEditable}
                          onCheckedChange={(v) => setApprovers((prev) => prev.map((x, i) => (i === idx ? { ...x, requiresSignature: !!v } : x)))}
                          aria-label="signature required"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {approvers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="px-3 py-8 text-center text-xs text-muted-foreground">
                      Belum ada approval — {isEditable ? "klik Add Approval untuk tambah level" : ""}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {isEditable && (
            <div className="mt-3 flex items-center gap-2">
              {selectedApprovers.size > 0 ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={() => {
                    setApprovers((prev) => prev.filter((_, i) => !selectedApprovers.has(i)));
                    setSelectedApprovers(new Set());
                  }}
                >
                  <Trash2 size={14} /> Delete ({selectedApprovers.size})
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 px-2.5 text-xs"
                  onClick={() => setApprovers((prev) => [...prev, { roleId: "", requiresSignature: false }])}
                >
                  <Plus size={14} /> Add Approval
                </Button>
              )}
            </div>
          )}
        </div>
      </FormPage>
    </RoleGuard>
  );
}
