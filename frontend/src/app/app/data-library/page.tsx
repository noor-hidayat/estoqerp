"use client";

import Link from "next/link";
import {
  ArrowRightLeft,
  ArrowUpRight,
  Barcode,
  Building2,
  MapPin,
  Package,
  Tag,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";

export default function DataLibraryPage() {
  const { isSystem, permissions } = useSession();
  const canView = (menu: string) => can(isSystem, permissions, menu, "view");

  const MENUS = [
    {
      label: "Items",
      href: "/app/data-library/items",
      icon: <Package size={24} strokeWidth={2} />,
      show: canView("master.items"),
    },
    {
      label: "Categories",
      href: "/app/data-library/categories",
      icon: <Tag size={24} strokeWidth={2} />,
      show: canView("master.categories"),
    },
    {
      label: "Barcode Formats",
      href: "/app/data-library/barcode-formats",
      icon: <Barcode size={24} strokeWidth={2} />,
      show: canView("master.barcodeFormats"),
    },
    {
      label: "Transaction Types",
      href: "/app/data-library/transaction-types",
      icon: <ArrowRightLeft size={24} strokeWidth={2} />,
      show: canView("master.movementTypes"),
    },
    {
      label: "Warehouses",
      href: "/app/data-library/warehouses",
      icon: <Warehouse size={24} strokeWidth={2} />,
      show: canView("inventory.warehouses"),
    },
    {
      label: "Locations",
      href: "/app/data-library/locations",
      icon: <MapPin size={24} strokeWidth={2} />,
      show: canView("inventory.locations"),
    },
    {
      label: "Branches",
      href: "/app/data-library/branches",
      icon: <Building2 size={24} strokeWidth={2} />,
      show: canView("inventory.branches"),
    },
  ].filter((m) => m.show);

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["master"]}>
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
    </RoleGuard>
  );
}