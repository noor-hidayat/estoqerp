"use client";

import Link from "next/link";
import { ArrowUpRight, Barcode, Package, Tag } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";

const MENUS = [
  {
    label: "Item List",
    description: "Kelola daftar item / produk beserta stok sistem per gudang.",
    href: "/app/setup/items",
    icon: <Package size={24} strokeWidth={2} />,
  },
  {
    label: "Category",
    description: "Kelola kategori produk untuk pengelompokan item.",
    href: "/app/setup/categories",
    icon: <Tag size={24} strokeWidth={2} />,
  },
  {
    label: "Barcode Format",
    description: "Kelola template barcode dan format scan untuk item.",
    href: "/app/setup/barcode-formats",
    icon: <Barcode size={24} strokeWidth={2} />,
  },
];

export default function SetupPage() {
  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
      <div>
        <PageHeader
          title="Master"
          description="Pilih menu item list, category, atau barcode format untuk mengelola master data."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {MENUS.map((m, i) => (
            <Link
              key={m.href}
              href={m.href}
              className="animate-fade-up group flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_36px_-16px_rgb(17_17_17/0.14)]"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-50 transition-transform duration-300 group-hover:scale-105">
                {m.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-zinc-900">
                  {m.label}
                  <ArrowUpRight
                    size={15}
                    strokeWidth={2}
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
