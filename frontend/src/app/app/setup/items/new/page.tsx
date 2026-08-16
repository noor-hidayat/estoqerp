"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useCategories, useInsert } from "@/lib/api/query";
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

const EMPTY = {
  code: "",
  name: "",
  unit: "pcs",
  categoryId: "",
  price: 0,
  barcodeId: "",
  qty: undefined as number | undefined,
};

export default function NewItemPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const { data: categories, isLoading: categoriesLoading } = useCategories();
  const insertItem = useInsert("items");

  const save = async () => {
    if (!form.code.trim() || !form.name.trim() || !form.categoryId) {
      setError("Code, name, and category are required.");
      return;
    }
    try {
      await insertItem.mutateAsync({
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        hue: Math.floor(Math.random() * 360),
      });
      navigate("/app/setup/items");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save item.");
    }
  };

  useSaveShortcut(save, true);

  if (categoriesLoading) {
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

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.items"]}>
      <FormPage
        title="Add Item"
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
            <Plus size={15} strokeWidth={2} />
            Save
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
