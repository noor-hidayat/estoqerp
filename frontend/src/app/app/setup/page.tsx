import { Link } from "react-router-dom";
import {
  ArrowRightLeft,
  ArrowUpRight,
  Barcode,
  Building2,
  Layers,
  MapPin,
  Package,
  Ruler,
  Tag,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { MANAGER_ROLES } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";

export default function SetupPage() {
  const { isSystem, permissions } = useSession();
  const canView = (menu: string) => can(isSystem, permissions, menu, "view");

  const MENUS = [
    {
      label: "Items",
      href: "/app/setup/items",
      icon: <Package size={24} strokeWidth={2} />,
      show: canView("master.items"),
    },
    {
      label: "Item Groups",
      href: "/app/setup/item-groups",
      icon: <Tag size={24} strokeWidth={2} />,
      show: canView("master.itemGroups"),
    },
    {
      label: "Barcode Formats",
      href: "/app/setup/barcode-formats",
      icon: <Barcode size={24} strokeWidth={2} />,
      show: canView("master.barcodeFormats"),
    },
    {
      label: "Batch Formats",
      href: "/app/setup/batch-formats",
      icon: <Layers size={24} strokeWidth={2} />,
      show: canView("master.batchFormats"),
    },
    {
      label: "UOM",
      href: "/app/setup/uom",
      icon: <Ruler size={24} strokeWidth={2} />,
      show: canView("master.uom"),
    },
    {
      label: "Transaction Types",
      href: "/app/setup/transaction-types",
      icon: <ArrowRightLeft size={24} strokeWidth={2} />,
      show: canView("master.movementTypes"),
    },
    {
      label: "Warehouses",
      href: "/app/setup/warehouses",
      icon: <Warehouse size={24} strokeWidth={2} />,
      show: canView("inventory.warehouses"),
    },
    {
      label: "Locations",
      href: "/app/setup/locations",
      icon: <MapPin size={24} strokeWidth={2} />,
      show: canView("inventory.locations"),
    },
    {
      label: "Branches",
      href: "/app/setup/branches",
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
              to={m.href}
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