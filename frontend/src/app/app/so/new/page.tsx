import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useBranches, useWarehouses, useInsert } from "@/lib/api/query";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";
import { MANAGER_ROLES } from "@/lib/roles";
import { cx } from "@/lib/utils";
import type { OpnameMode } from "@/types";
import { useErrorToast } from "@/hooks/use-error-toast";

const MODES: {
  id: OpnameMode;
  title: string;
  desc: string;
  points: string[];
}[] = [
  {
    id: "COMPARE",
    title: "COMPARE",
    desc: "Physical count results are compared with system stock to find variance.",
    points: [
      "System qty taken from master item",
      "Variance calculated automatically",
      "Suitable for periodic opname",
    ],
  },
  {
    id: "SCRATCH",
    title: "SCRATCH",
    desc: "Does not compare with system stock. All qty is counted physically.",
    points: [
      "No system stock reference",
      "Ideal for stock cleanup / audit",
      "Physical result becomes new basis",
    ],
  },
];

export default function NewProjectPage() {
  const navigate = useNavigate();
  const router = { push: (to: string) => navigate(to), replace: (to: string) => navigate(to, { replace: true }), back: () => navigate(-1) } as any;
  useEffect(() => { router.replace("/app/project/new"); }, [router]);

  const { user, isSystem, access } = useSession();
  const { data: branches, isLoading: branchesLoading } = useBranches();
  const insertProjects = useInsert("projects");

  const allowedBranches = useMemo(() => {
    if (!branches) return [];
    if (isSystem) return branches;
    return branches.filter((b) => access.branchIds.includes(b.id));
  }, [branches, access.branchIds, isSystem]);

  const [name, setName] = useState("");
  const [branchId, setBranchId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [mode, setMode] = useState<OpnameMode>("COMPARE");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  useErrorToast(error);
  const [saving, setSaving] = useState(false);

  const { data: warehouseData = [] } = useWarehouses(
    branchId || undefined
  );

  useEffect(() => {
    if (!branchId && allowedBranches.length > 0) {
      setBranchId(allowedBranches[0].id);
    }
  }, [branchId, allowedBranches]);

  useEffect(() => {
    if (!warehouseId && warehouseData.length > 0) {
      setWarehouseId(warehouseData[0].id);
    }
  }, [branchId, warehouseId, warehouseData]);

  const handleBranchChange = (id: string) => {
    setBranchId(id);
    setWarehouseId("");
  };

  const create = async () => {
    if (!name.trim() || !warehouseId) return;
    setSaving(true);
    setError("");
    try {
      const created = (await insertProjects.mutateAsync({
        name: name.trim(),
        branchId,
        warehouseId,
        mode,
        status: "DRAFT",
        createdAt: new Date().toISOString(),
        deadline: deadline || undefined,
        createdBy: user?.id ?? "",
      })) as { id: string };
      router.push(`/app/project/warehouse?projectId=${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create stock opname");
      setSaving(false);
    }
  };

  if (branchesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["opname.new"]}>
        <FormSkeleton
          sections={[["wide", "half", "half", "wide"], ["mode"]]}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["opname.new"]}>
      <FormPage
        title="Create Stock Opname"

      >
        <FormSection>
          <FormGrid>
            <div className="sm:col-span-2">
              <Input
                label="Stock opname name"
                placeholder="e.g.: Opname February 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Select
              label="Branch"
              value={branchId}
              onChange={(e) => handleBranchChange(e.target.value)}
            >
              {allowedBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select
              label="Warehouse"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouseData.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Input
                label="Deadline (optional)"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </FormGrid>
        </FormSection>

        <FormSection>
          <div className="flex flex-col gap-3">
            {MODES.map((m) => {
              const active = mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cx(
                    "rounded-lg border p-5 text-left transition-all",
                    active
                      ? "border-primary/60 bg-primary/10 ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-border"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[14.5px] font-semibold text-foreground">
                      {m.title}
                    </p>
                    <span
                      className={cx(
                        "flex h-5 w-5 items-center justify-center rounded-full border-2",
                        active
                          ? "border-primary"
                          : "border-muted"
                      )}
                    >
                      {active && (
                        <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                      )}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {m.desc}
                  </p>
                  <ul className="mt-3 space-y-1">
                    {m.points.map((pt) => (
                      <li
                        key={pt}
                        className="flex items-center gap-2 text-[11.5px] text-muted-foreground"
                      >
                        <span className="h-1 w-1 rounded-full bg-primary" />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </FormSection>


        <FormActions>
          <Button
            variant="ghost"
            onClick={() => router.push("/app/so")}
            disabled={saving}
          >
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim() || !warehouseId || saving}
            onClick={create}
          >
            {saving ? "Creating..." : "Create Project"}
            <ArrowRight size={16} strokeWidth={2} />
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}