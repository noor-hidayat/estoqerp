import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAllWarehouses, useBranches, useInsert } from "@/lib/api/query";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
} from "@/components/ui/form-page";
import { toast } from "sonner";

export default function NewWarehousePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ code: "", name: "", branchId: "", parentId: "", picName: "", picPhone: "", picEmail: "", address: "", phone: "", email: "", isActive: true });

  const { data: warehouses = [] } = useAllWarehouses();
  const { data: branches = [], isLoading: branchesLoading } = useBranches();
  const insertWarehouse = useInsert("warehouses");

  const parentOptions = useMemo(() => {
    if (!form.branchId) return [];
    return warehouses.filter((w) => w.branchId === form.branchId);
  }, [warehouses, form.branchId]);

  const handleCreate = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.branchId) {
      toast.error("Code, warehouse name, and branch are required.");
      return;
    }
    if (
      warehouses.some(
        (w) => w.code.toLowerCase() === form.code.trim().toLowerCase()
      )
    ) {
      toast.error("Warehouse code already in use.");
      return;
    }
    if (form.picEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.picEmail.trim())) {
      toast.error("PIC email tidak valid.");
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      toast.error("Email warehouse tidak valid.");
      return;
    }
    const confirmed = await new Promise<boolean>((resolve) => {
      toast.custom(
        (t) => (
          <div className="bg-background border border-border rounded-lg shadow-lg p-3 w-[300px]">
            <div className="font-semibold text-xs">Confirm</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">This transaction will be made permanent, continue?</div>
            <div className="flex justify-end gap-1.5 mt-3">
              <Button variant="ghost" size="sm" className="h-6 px-2.5 text-xs" onClick={() => { toast.dismiss(t); resolve(false); }}>
                No
              </Button>
              <Button size="sm" className="h-6 px-2.5 text-xs" onClick={() => { toast.dismiss(t); resolve(true); }}>
                Yes
              </Button>
            </div>
          </div>
        ),
        { duration: Infinity }
      );
    });
    if (!confirmed) return;
    try {
      await insertWarehouse.mutateAsync({
        code: form.code.trim(),
        name: form.name.trim(),
        branchId: form.branchId,
        parentId: form.parentId || null,
        picName: form.picName.trim() || null,
        picPhone: form.picPhone.trim() || null,
        picEmail: form.picEmail.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        isActive: !!form.isActive,
      });
      toast.success("Created");
      navigate("/app/setup/warehouses");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (branchesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
        <FormSkeleton
          sections={[["half", "half", "wide"]]}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["inventory.warehouses"]}>
      <FormPage
        title="Add Warehouse"
        actions={
          <Button size="sm" onClick={handleCreate} disabled={insertWarehouse.isPending}>
            {insertWarehouse.isPending ? "Saving..." : "Create"}
          </Button>
        }
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Warehouse code"
              placeholder="BND-01"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Select
              label="Branch"
              value={form.branchId}
              onChange={(e) => setForm({ ...form, branchId: e.target.value })}
            >
              <option value="">Select branch...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Input
                label="Warehouse name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Select
                label="Parent"
                value={form.parentId}
                onChange={(e) => setForm({ ...form, parentId: e.target.value })}
              >
                <option value="">— Without parent (Central Warehouse) —</option>
                {parentOptions.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Contoh: buat <b>JATI</b> tanpa parent, lalu buat <b>Gdg Bahan Baku / Gdg Sparepart</b> dengan Parent = JATI.</p>
            </div>
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border border-border px-3 py-2.5">
              <div>
                <div className="text-sm font-medium leading-none">Active</div>
                <div className="text-xs text-muted-foreground">Non-aktif akan jadi Inactive di tabel</div>
              </div>
              <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: !!v })} />
            </div>
          </FormGrid>
        </FormSection>
        <FormSection title="PIC & Kontak (dipakai di PO)">
          <FormGrid>
            <Input
              label="PIC Name"
              placeholder="Budi"
              value={form.picName}
              onChange={(e) => setForm({ ...form, picName: e.target.value })}
            />
            <Input
              label="PIC Phone"
              placeholder="0812..."
              value={form.picPhone}
              onChange={(e) => setForm({ ...form, picPhone: e.target.value })}
            />
            <Input
              label="PIC Email"
              placeholder="budi@contoh.com"
              value={form.picEmail}
              onChange={(e) => setForm({ ...form, picEmail: e.target.value })}
            />
            <Input
              label="Telp Warehouse"
              placeholder="021-..."
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Email Warehouse"
                placeholder="gudang@contoh.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-sm font-medium leading-none">Alamat Warehouse</label>
              <Textarea
                placeholder="Jl. ..."
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </FormGrid>
        </FormSection>
      </FormPage>
    </RoleGuard>
  );
}
