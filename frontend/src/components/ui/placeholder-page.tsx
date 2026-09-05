import { Link } from "react-router-dom";
import { ArrowRight, Hammer } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";
import { Button } from "@/components/ui/button";

/** Halaman sementara untuk modul warehouse fase 2 (QC, Putaway, Picking, dsb).
 *  Digate permission induknya agar role existing langsung melihat struktur baru. */
export function PlaceholderPage({
  menu,
  eyebrow,
  title,
  description,
  relatedHref,
  relatedLabel,
}: {
  menu: string;
  eyebrow: string;
  title: string;
  description: string;
  relatedHref: string;
  relatedLabel: string;
}) {
  return (
    <MenuGate menu={menu}>
      <PageHeader title={title} eyebrow={eyebrow} description={description} />
      <div className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-border bg-card p-8">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Hammer size={24} strokeWidth={2} />
        </span>
        <div>
          <p className="text-[15px] font-semibold tracking-tight text-foreground">Modul tahap 2</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Halaman {title} belum diimplementasikan. Sementara ini gunakan halaman terkait di bawah.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link to={relatedHref}>
            {relatedLabel}
            <ArrowRight size={14} strokeWidth={2} />
          </Link>
        </Button>
      </div>
    </MenuGate>
  );
}
