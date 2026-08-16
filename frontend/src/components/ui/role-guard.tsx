"use client";

import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

/** "Access restricted" screen — used by RoleGuard and MenuGate. */
export function AccessDenied() {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <LockKeyhole size={28} strokeWidth={2} />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Access restricted
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        This page can only be accessed by authorized roles. Contact
        admin to get access.
      </p>
      <Button variant="outline" className="mt-6" onClick={() => router.push("/app")}>
        Back to Dashboard
      </Button>
    </div>
  );
}

/** RBAC menu-based gate — users without view access to the menu don't see children. */
export function MenuGate({
  menu,
  children,
}: {
  menu: string;
  children: ReactNode;
}) {
  const { user, isSystem, permissions } = useSession();
  if (!user) return null;
  if (!can(isSystem, permissions, menu, "view")) return <AccessDenied />;
  return <>{children}</>;
}

export function RoleGuard({
  roles,
  menus,
  children,
}: {
  /** Allowed role ids (e.g. role_sys_admin). */
  roles: string[];
  /** Allowed RBAC menus — user only needs one to pass. */
  menus?: string[];
  children: ReactNode;
}) {
  const { user, hasRole, isSystem, permissions } = useSession();

  if (!user) return null;

  const allowedByMenu =
    menus && menus.some((menu) => can(isSystem, permissions, menu, "view"));

  if (!hasRole(roles) && !allowedByMenu) return <AccessDenied />;

  return <>{children}</>;
}
