"use client";

import Link from "next/link";
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
    label: "Laporan per Project",
    description: "Hasil opname lengkap per project: qty sistem, qty hitung, dan selisih.",
    href: "/app/reports/project",
    icon: <BarChart3 size={24} strokeWidth={2} />,
  },
  {
    label: "Variance Report",
    description: "Rekap selisih stok untuk ditinjau dan disetujui.",
    href: "/app/reports/variance",
    icon: <TriangleAlert size={24} strokeWidth={2} />,
  },
  {
    label: "Summary Report",
    description: "Ringkasan keseluruhan hasil stock opname.",
    href: "/app/reports/summary",
    icon: <FileText size={24} strokeWidth={2} />,
  },
  {
    label: "Riwayat Scan",
    description: "Log aktivitas scan barcode di semua project.",
    href: "/app/reports/history",
    icon: <History size={24} strokeWidth={2} />,
  },
];

export default function ReportsPage() {
  return (
    <div>
      <PageHeader
        title="Laporan"
        description="Pilih jenis laporan yang ingin dilihat atau diekspor."
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
