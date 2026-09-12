import { useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { useRoles } from "@/lib/api/query";
import { RoleForm } from "@/components/roles/role-form";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormSkeleton } from "@/components/ui/skeleton";

export default function EditRolePage() {
  const params = useParams<{ id: string }>();
  const { data: roles, isLoading } = useRoles();
  const role = (roles ?? []).find((r) => r.id === params.id);

  if (isLoading) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
        <FormSkeleton
          sections={[
            ["wide", "toggle"],
            ["wide", "wide"],
            ["block", "block", "block", "block", "block", "block"],
          ]}
        />
      </RoleGuard>
    );
  }

  if (!role) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Role not found</p>
        <div className="text-center">
          <Link to="/app/settings/roles" className="text-sm text-primary hover:text-primary/80">Back to Roles</Link>
        </div>
      </RoleGuard>
    );
  }

  if (role.isSystem) {
    return (
      <RoleGuard roles={["role_sys_admin"]} menus={["settings.roles"]}>
        <p className="py-20 text-center text-lg font-semibold text-foreground">Administrator role tidak ditampilkan</p>
        <div className="text-center">
          <Link to="/app/settings/roles" className="text-sm text-primary hover:text-primary/80">Back to Roles</Link>
        </div>
      </RoleGuard>
    );
  }

  return <RoleForm role={role} />;
}