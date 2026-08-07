"use client";

import type { ReactNode } from "react";
import { LockKey } from "@phosphor-icons/react";
import { useSession } from "@/lib/session";
import type { Role } from "@/types";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function RoleGuard({
  roles,
  children,
}: {
  roles: Role[];
  children: ReactNode;
}) {
  const { user, hasRole } = useSession();
  const router = useRouter();

  if (!user) return null;

  if (!hasRole(roles)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
        <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
          <LockKey size={28} weight="bold" />
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

  return <>{children}</>;
}
