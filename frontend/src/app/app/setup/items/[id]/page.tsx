"use client";

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useItem, useCategories, useUpdate } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";
import Link from "next/link";

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading: itemLoading } = useItem(id);
  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const updateItem = useUpdate("items");

  const [form, setForm] = useState({
    code: "",
    name: "",
    unit: "pcs",
    categoryId: "",
    price: 0,
    barcodeId: "",
    qty: undefined as number | undefined,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (item) {
      setForm({
        code: item.code,
        name: item.name,
        unit: item.unit,
        categoryId: item.categoryId,
        price: item.price,
        barcodeId: item.barcodeId ?? "",
        qty: item.qty,
      });
    }
  }, [item]);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.categoryId) {
      setError("Code, name, and category are required.");
      return;
    }
    if (!id) return;
    try {
      await updateItem.mutateAsync({
        id,
        patch: { ...form, code: form.code.trim(), name: form.name.trim() },
      });
      navigate("/app/setup/items");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item.");
    }
  };

  useSaveShortcut(save, true);

  if (itemLoading || categoriesLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
        <FormSkeleton
          sections={[
            ["half", "half", "wide", "half", "half", "half", "half"],
          ]}
        />
      </RoleGuard>
    );
  }

  if (!item) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Item not found</p>
        <div className="text-center">
          <Link href="/app/setup/items" className="text-sm text-primary hover:text-primary/80">Back to Items</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
      <FormPage
        title="Edit Item"
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Item code"
              placeholder="00001"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Unit"
              placeholder="pcs / box / sack"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Item name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <Select
              label="Category"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Select category...</option>
              {(categories ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
            <Input
              label="Unit price (Rp)"
              type="number"
              min={0}
              value={form.price}
              onChange={(e) =>
                setForm({ ...form, price: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <Input
              label="Barcode ID (optional)"
              placeholder="Enter item barcode"
              value={form.barcodeId ?? ""}
              onChange={(e) => setForm({ ...form, barcodeId: e.target.value })}
            />
            <Input
              label="Master qty (qty per barcode)"
              type="number"
              min={0}
              placeholder="e.g.: 1 barcode = 12 pcs"
              value={form.qty ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  qty: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0),
                })
              }
            />
          </FormGrid>

          {error && (
            <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/setup/items")}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button variant="primary" onClick={save}>
            <Save size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
