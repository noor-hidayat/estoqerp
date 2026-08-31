import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  FileText,
  History,
  TriangleAlert,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const MENUS = [
  {
    label: "Report per Project",
    href: "/app/report/project",
    icon: <BarChart3 size={24} strokeWidth={2} />,
  },
  {
    label: "Variance Report",
    href: "/app/report/variance",
    icon: <TriangleAlert size={24} strokeWidth={2} />,
  },
  {
    label: "Summary Report",
    href: "/app/report/summary",
    icon: <FileText size={24} strokeWidth={2} />,
  },
  {
    label: "Scan History",
    href: "/app/report/history",
    icon: <History size={24} strokeWidth={2} />,
  },
];

export default function ReportsPage() {
  return (
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
  );
}