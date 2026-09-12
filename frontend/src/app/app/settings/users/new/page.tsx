import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus } from "lucide-react";
import { useUsers, useRoles } from "@/lib/api/query";
import { api } from "@/lib/api/client";
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
import type { User } from "@/types";
import { useErrorToast } from "@/hooks/use-error-toast";

export default function NewUserPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    roleId: "",
    active: true,
  });
  const [error, setError] = useState("");
  useErrorToast(error);
  const [saving, setSaving] = useState(false);

  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: roles, isLoading: rolesLoading } = useRoles();

  const save = async () => {
    if (saving) return;
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if ((users ?? []).some((u) => u.email.toLowerCase() === form.email.trim().toLowerCase())) {
      setError("Email already registered.");
      return;
    }
    if (!form.password) {
      setError("Password is required.");
      return;
    }
    setSaving(true);
    setError("");

    try {
      await api.post<{ user: User }>("/auth/register", {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        password: form.password,
        roleId: form.roleId,
      });
      navigate("/app/settings/users");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create account.");
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(save, !saving);

  if (usersLoading || rolesLoading) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.users"]}>
        <FormSkeleton
          sections={[["wide", "wide", "wide", "half", "half"]]}
        />
      </RoleGuard>
    );
  }

  return (
    <RoleGuard roles={["role_sys_admin"]} menus={["settings.users"]}>
      <FormPage
        title="Add User"
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
            <Input
              label="Telpon"
              type="tel"
              placeholder="08xxxxxxxxxx"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            <Select
              label="Role"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            >
              {(roles ?? []).filter((r) => r.active && !r.isSystem).map((r) => (
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
            <Plus size={15} strokeWidth={2} />
            {saving ? "Saving..." : "Save"}
          </Button>
        </FormActions>
      </FormPage>
    </RoleGuard>
  );
}