"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  Building2,
  MapPin,
  Warehouse,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";

export default function StockPage() {
  const { isSystem, permissions } = useSession();
  const canManage =
    can(isSystem, permissions, "inventory.branches", "view") ||
    can(isSystem, permissions, "inventory.warehouses", "view") ||
    can(isSystem, permissions, "inventory.locations", "view");

  const MENUS = [
    {
      label: "Stock Balance",
      description: "Monitoring stok per item di setiap gudang.",
      href: "/app/stock/balance",
      icon: <Boxes size={24} strokeWidth={2} />,
      show: true,
    },
    {
      label: "Plants",
      description: "Kelola cabang / plant sebagai struktur tertinggi.",
      href: "/app/stock/branches",
      icon: <Building2 size={24} strokeWidth={2} />,
      show: canManage,
    },
    {
      label: "Warehouses",
      description: "Kelola gudang yang berada di bawah setiap plant.",
      href: "/app/stock/warehouses",
      icon: <Warehouse size={24} strokeWidth={2} />,
      show: canManage,
    },
    {
      label: "Locations",
      description: "Kelola lokasi / rak penyimpanan di setiap gudang.",
      href: "/app/stock/locations",
      icon: <MapPin size={24} strokeWidth={2} />,
      show: canManage,
    },
  ].filter((m) => m.show);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Pilih menu untuk memonitor stok atau mengelola struktur plant, gudang, dan lokasi."
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
  );
}
