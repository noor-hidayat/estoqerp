"use client";

import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { useUser, useUsers, useRoles, useUpdate } from "@/lib/api/query";
import { useSaveShortcut } from "@/lib/use-save-shortcut";
import { RoleGuard } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { FormSkeleton } from "@/components/ui/skeleton";
import {
  FormPage,
  FormSection,
  FormGrid,
  FormActions,
} from "@/components/ui/form-page";
import Link from "next/link";
import { useErrorToast } from "@/hooks/use-error-toast";

export default function EditUserPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading: userLoading } = useUser(id);
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const updateUser = useUpdate("users");

  const [form, setForm] = useState({
    name: "",
    email: "",
    roleId: "",
    active: true,
  });
  const [error, setError] = useState("");
  useErrorToast(error);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name,
        email: user.email,
        roleId: user.role,
        active: user.active,
      });
    }
  }, [user]);

  const save = async () => {
    if (saving) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (
      (users ?? []).some(
        (u) =>
          u.email.toLowerCase() === form.email.trim().toLowerCase() &&
          u.id !== id
      )
    ) {
      setError("Email already registered.");
      return;
    }
    if (!id) return;
    setSaving(true);
    setError("");

    try {
      await updateUser.mutateAsync({
        id,
        patch: {
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          role: form.roleId,
          active: form.active,
        },
      });
      navigate("/app/settings/users");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(save, !saving);

  if (userLoading || usersLoading || rolesLoading) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.users"]}>
        <FormSkeleton
          sections={[["wide", "wide", "half", "half"]]}
        />
      </RoleGuard>
    );
  }

  if (!user) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.users"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">User not found</p>
        <div className="text-center">
          <Link href="/app/settings/users" className="text-sm text-primary hover:text-primary/80">Back to Users</Link>
        </div>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.users"]}>
      <FormPage
        title="Edit User"
      >
        <FormSection>
          <FormGrid>
            <div className="sm:col-span-2">
              <Input
                label="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <Select
              label="Role"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            >
              {(roles ?? []).filter((r) => r.active).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-3 pt-1.5">
              <Toggle
                checked={form.active}
                onChange={(v) => setForm({ ...form, active: v })}
              />
              <span className="text-sm text-muted-foreground">
                {form.active ? "Active" : "Inactive"}
              </span>
            </div>
          </FormGrid>

        </FormSection>

        <FormActions>
          <Button variant="ghost" onClick={() => navigate("/app/settings/users")}>
            <ArrowLeft size={15} strokeWidth={2} />
            Back
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            <Save size={15} strokeWidth={2} />
            {saving ? "Saving..." : "Save"}
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}
