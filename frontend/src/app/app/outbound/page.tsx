import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ListChecks,
  Package,
  Receipt,
  RotateCcw,
  Truck,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";

export default function OutboundPage() {
  const { isSystem, permissions } = useSession();

  const MENUS = [
    {
      label: "Delivery Order",
      href: "/app/sales-orders",
      icon: <Receipt size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.salesOrders", "view"),
    },
    {
      label: "Picking",
      href: "/app/outbound/picking",
      icon: <ListChecks size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.deliveries", "view"),
    },
    {
      label: "Packing",
      href: "/app/outbound/packing",
      icon: <Package size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.deliveries", "view"),
    },
    {
      label: "Dispatch / Shipment",
      href: "/app/deliveries",
      icon: <Truck size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.deliveries", "view"),
    },
    {
      label: "Customer Return",
      href: "/app/outbound/customer-return",
      icon: <RotateCcw size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.deliveries", "view"),
    },
  ].filter((m) => m.show);

  return (
    <MenuGate menu="supply.salesOrders">
      <div>
        <PageHeader title="Outbound" description="Alur barang keluar: delivery order hingga dispatch." />

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
    </MenuGate>
  );
}
