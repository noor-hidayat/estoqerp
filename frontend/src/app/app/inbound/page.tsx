import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  ClipboardCheck,
  Inbox,
  PackageCheck,
  PackageSearch,
  Undo2,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";

export default function InboundPage() {
  const { isSystem, permissions } = useSession();

  const MENUS = [
    {
      label: "Receiving",
      href: "/app/inbound/receiving",
      icon: <Inbox size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.purchaseOrders", "view"),
    },
    {
      label: "QC Inspection",
      href: "/app/inbound/qc",
      icon: <ClipboardCheck size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.goodsReceipts", "view"),
    },
    {
      label: "GRN",
      href: "/app/goods-receipts",
      icon: <PackageCheck size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.goodsReceipts", "view"),
    },
    {
      label: "Putaway",
      href: "/app/inbound/putaway",
      icon: <PackageSearch size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.goodsReceipts", "view"),
    },
    {
      label: "Supplier Return",
      href: "/app/inbound/supplier-return",
      icon: <Undo2 size={24} strokeWidth={2} />,
      show: can(isSystem, permissions, "supply.goodsReceipts", "view"),
    },
  ].filter((m) => m.show);

  return (
    <MenuGate menu="supply.purchaseOrders">
      <div>
        <PageHeader title="Inbound" description="Alur barang masuk: receiving hingga putaway." />

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
