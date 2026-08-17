"use client";

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useCategory, useCategories, useUpdate } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { MANAGER_ROLES } from "@/lib/roles";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";
import Link from "next/link";

export default function EditCategoryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: category, isLoading: categoryLoading } = useCategory(id);
  const { data: categoriesRaw = [] } = useCategories();
  const updateCategory = useUpdate("categories");

  const [form, setForm] = useState({ code: "", name: "" });
  const [error, setError] = useState("");

  useEffect(() => {
    if (category) {
      setForm({ code: category.code, name: category.name });
    }
  }, [category]);

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError("Code and category name are required.");
      return;
    }
    if (
      categoriesRaw.some(
        (c) =>
          c.code.toLowerCase() === form.code.trim().toLowerCase() &&
          c.id !== id
      )
    ) {
      setError("Category code already in use.");
      return;
    }
    if (!id) return;
    try {
      await updateCategory.mutateAsync({ id, patch: { ...form } });
      navigate("/app/data-library/categories");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    }
  };

  useSaveShortcut(save, true);

  if (categoryLoading) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.categories"]}>
        <FormSkeleton
          sections={[["half", "half"]]}
        />
      </RoleGuard>
    );
  }

  if (!category) {
    return (
      <RoleGuard roles={MANAGER_ROLES} menus={["master.categories"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Category not found</p>
        <div className="text-center">
          <Link href="/app/data-library/categories" className="text-sm text-primary hover:text-primary/80">Back to Categories</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master.categories"]}>
      <FormPage
        title="Edit Category"
      >
        <FormSection>
          <FormGrid>
            <Input
              label="Category code"
              placeholder="CTGRY"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
            <Input
              label="Category name"
              placeholder="Snacks"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </FormGrid>
          {error && (
            <p className="mt-5 rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
              {error}
            </p>
          )}
        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/data-library/categories")}>
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
