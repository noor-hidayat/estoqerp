import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { useCreateWorkflow, useCreateWorkflowState, useRoles } from "@/lib/api/query";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FormPage, FormSection } from "@/components/ui/form-page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function NewWorkflowPage() {
  const navigate = useNavigate();
  const create = useCreateWorkflow();
  const createState = useCreateWorkflowState();
  const { data: roles = [] } = useRoles();
  const [form, setForm] = useState({
    name: "",
    documentType: "PO",
    isActive: true,
    isDefault: false,
  });
  const [approvers, setApprovers] = useState<{ roleId: string; requiresSignature: boolean }[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  const submit = async () => {
    if (!form.name.trim()) return setError("Name wajib.");
    try {
      const res = await create.mutateAsync({
        name: form.name,
        documentType: form.documentType,
        isActive: form.isActive,
        isDefault: form.isDefault,
      });
      const workflowId = (res as any).id;
      for (let i = 0; i < approvers.length; i++) {
        const ap = approvers[i];
        if (!ap.roleId) continue;
        const role = (roles as any[]).find((r: any) => r.id === ap.roleId);
        const code = `LEVEL_${i + 1}`;
        const name = role ? role.name : `Level ${i + 1}`;
        await createState.mutateAsync({
          workflowId,
          body: { code, name, type: "intermediate", color: "neutral", orderNo: i + 1, requiresSignature: !!ap.requiresSignature },
        });
      }
      navigate(`/app/settings/workflows/${workflowId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create workflow");
    }
  };

  const isSaving = create.isPending || createState.isPending;

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.workflows"]}>
      <FormPage
        title="New Approval"
        actions={
          <Button size="sm" onClick={submit} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save"}
          </Button>
        }
      >
        {error && <div className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
        <FormSection>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Input label="Name" placeholder="PO Approval" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <Select label="Document Type" value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })} className="h-8">
              <option value="PO">PO</option>
              <option value="SO">SO</option>
              <option value="GR">GR</option>
              <option value="RECEIVING">RECEIVING</option>
              <option value="QC">QC</option>
              <option value="DELIVERY">DELIVERY</option>
            </Select>
            <div className="flex flex-col justify-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} /> Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: !!v })} /> Default for document type
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
                        if (v) setSelectedApprovers(new Set(approvers.map((_, i) => i)));
                        else setSelectedApprovers(new Set());
                      }}
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
                        onCheckedChange={(v) => {
                          const next = new Set(selectedApprovers);
                          if (v) next.add(idx);
                          else next.delete(idx);
                          setSelectedApprovers(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-2 text-center text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell className="p-0">
                      <SearchableSelect
                        table
                        placeholder="Select role..."
                        columnTitle="Role"
                        options={(roles as any[]).map((r: any) => ({ value: r.id, label: r.name }))}
                        value={ap.roleId}
                        onChange={(v) => setApprovers((prev) => prev.map((x, i) => (i === idx ? { ...x, roleId: v } : x)))}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={!!ap.requiresSignature}
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
                      Belum ada approval — klik Add Approval untuk tambah level
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

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
        </div>
      </FormPage>
    </RoleGuard>
  );
}
