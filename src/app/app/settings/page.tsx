"use client";

import Link from "next/link";
import { ArrowUpRight, Barcode, Users } from "lucide-react";
import { useSession } from "@/lib/session";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";

export default function SettingsPage() {
  const { user } = useSession();
  const isRoot = user?.role === "ADMINISTRATOR";

  const MENUS = [
    {
      label: "Barcode Format",
      description: "Kelola template barcode dan format scan untuk item.",
      href: "/app/settings/barcode-formats",
      icon: <Barcode size={24} strokeWidth={2} />,
      iconClass: "bg-zinc-900 text-zinc-50",
    },
    ...(isRoot
      ? [
          {
            label: "User & Role",
            description: "Kelola pengguna aplikasi beserta hak akses per role.",
            href: "/app/settings/users",
            icon: <Users size={24} strokeWidth={2} />,
            iconClass: "bg-zinc-900 text-zinc-50",
          },
        ]
      : []),
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <div>
        <PageHeader
          title="Settings"
          description="Atur konfigurasi barcode serta kelola user dan role akses aplikasi."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {MENUS.map((m, i) => (
            <Link
              key={m.href}
              href={m.href}
              className="animate-fade-up group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_36px_-16px_rgb(17_17_17/0.14)]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span
                className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105 ${m.iconClass}`}
              >
                {m.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-900">
                  {m.label}
                  <ArrowUpRight
                    size={15}
                    strokeWidth={2.2}
                    className="text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-900"
                  />
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-zinc-500">
                  {m.description}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </RoleGuard>
  );
}