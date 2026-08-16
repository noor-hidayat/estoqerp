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
      href: "/app/stock/balance",
      icon: <Boxes size={24} strokeWidth={2} />,
      show: true,
    },
    {
      label: "Plants",
      href: "/app/stock/branches",
      icon: <Building2 size={24} strokeWidth={2} />,
      show: canManage,
    },
    {
      label: "Warehouses",
      href: "/app/stock/warehouses",
      icon: <Warehouse size={24} strokeWidth={2} />,
      show: canManage,
    },
    {
      label: "Locations",
      href: "/app/stock/locations",
      icon: <MapPin size={24} strokeWidth={2} />,
      show: canManage,
    },
  ].filter((m) => m.show);

  return (
    <div>
      <PageHeader
        title="Shortcut"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {MENUS.map((m, i) => (
          <Link
            key={m.href}
            href={m.href}
            className="animate-fade-up group flex items-center gap-4 rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_14px_36px_-16px_rgb(17_17_17/0.14)]"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-300 group-hover:scale-105">
              {m.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
                {m.label}
                <ArrowUpRight
                  size={15}
                  strokeWidth={2}
                  className="text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground"
                />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
