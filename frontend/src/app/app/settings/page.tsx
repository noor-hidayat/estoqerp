import { Link } from "react-router-dom";
import { ArrowUpRight, Bot, FileSpreadsheet, SquareAsterisk, Users } from "lucide-react";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { isManager, MANAGER_ROLES } from "@/lib/roles";
import type { ReactNode } from "react";

export default function SettingsPage() {
  const { user, isSystem, permissions } = useSession();
  const canView = (menu: string) => can(isSystem, permissions, menu, "view");

  const MENUS: {
    label: string;
    href: string;
    icon: ReactNode;
    iconClass: string;
  }[] = [
    ...(canView("settings.users")
      ? [
          {
            label: "Users",
            href: "/app/settings/users",
            icon: <Users size={24} strokeWidth={2} />,
            iconClass: "bg-primary text-primary-foreground",
          },
        ]
      : []),
    ...(canView("settings.roles")
      ? [
          {
            label: "Roles",
            href: "/app/settings/roles",
            icon: <SquareAsterisk size={24} strokeWidth={2} />,
            iconClass: "bg-primary text-primary-foreground",
          },
        ]
      : []),
    ...(canView("settings.import")
      ? [
          {
            label: "Import",
            href: "/app/settings/import",
            icon: <FileSpreadsheet size={24} strokeWidth={2} />,
            iconClass: "bg-primary text-primary-foreground",
          },
        ]
      : []),
    ...(user && isManager(user.role)
      ? [
          {
            label: "AI Assistant",
            href: "/app/settings/ai",
            icon: <Bot size={24} strokeWidth={2} />,
            iconClass: "bg-primary text-primary-foreground",
          },
        ]
      : []),
  ];

  return (
    <RoleGuard roles={MANAGER_ROLES} menus={["settings"]}>
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
              <span
                className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105 ${m.iconClass}`}
              >
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