"use client";

import type { ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

/** Layar "Akses terbatas" — dipakai RoleGuard dan MenuGate. */
export function AccessDenied() {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-lg bg-zinc-100 text-zinc-400">
        <LockKeyhole size={28} strokeWidth={2} />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
        Akses terbatas
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
        Halaman ini hanya dapat diakses oleh role yang berwenang. Hubungi
        admin untuk mendapatkan akses.
      </p>
      <Button variant="outline" className="mt-6" onClick={() => router.push("/app")}>
        Kembali ke Dashboard
      </Button>
    </div>
  );
}

/** Gate berbasis menu RBAC — user tanpa akses view menu tidak melihat children. */
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
  /** Role id yang diizinkan (mis. role_sys_admin). */
  roles: string[];
  /** Menu RBAC yang diizinkan — user cukup punya salah satu untuk lolos. */
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
