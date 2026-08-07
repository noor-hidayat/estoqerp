"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowsLeftRight,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { useDB } from "@/hooks/use-db";
import { projectCounted } from "@/lib/compute";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { cx } from "@/lib/utils";

export default function VarianceReviewPage() {
  const db = useDB();
  const [projectId, setProjectId] = useState("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const all: {
      projectId: string;
      projectName: string;
      warehouseCode: string;
      itemId: string;
      itemCode: string;
      itemName: string;
      hue: number;
      systemQty: number;
      countedQty: number;
      diff: number;
    }[] = [];

    for (const p of db.projects) {
      if (projectId !== "all" && p.id !== projectId) continue;
      for (const row of projectCounted(db, p)) {
        if (row.diff === 0) continue;
        const item = db.items.find((i) => i.id === row.itemId);
        const wh = db.warehouses.find((w) => w.id === p.warehouseId);
        all.push({
          projectId: p.id,
          projectName: p.name,
          warehouseCode: wh?.code ?? "—",
          itemId: row.itemId,
          itemCode: item?.code ?? "—",
          itemName: item?.name ?? "—",
          hue: item?.hue ?? 200,
          systemQty: row.systemQty,
          countedQty: row.countedQty,
          diff: row.diff,
        });
      }
    }

    if (query) {
      const q = query.toLowerCase();
      return all.filter(
        (r) =>
          r.itemName.toLowerCase().includes(q) ||
          r.itemCode.includes(q) ||
          r.projectName.toLowerCase().includes(q)
      );
    }

    return all.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [db, projectId, query]);

  const totalDiff = rows.reduce((a, r) => a + r.diff, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Stock Opname"
        title="Variance Review"
        description="Semua selisih antara stok sistem dan hasil hitung fisik di seluruh project."
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Cari item / project..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          icon={<MagnifyingGlass size={15} weight="bold" />}
          className="sm:max-w-xs"
        />
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="sm:w-64"
        >
          <option value="all">Semua project</option>
          {db.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ArrowsLeftRight size={26} weight="bold" />}
          title="Tidak ada selisih"
          description="Belum ada item dengan variance di filter ini."
        />
      ) : (
        <div className="rounded-2xl border border-zinc-200/70 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4">
            <p className="text-[13px] text-zinc-500">
              <span className="font-semibold text-zinc-900">{rows.length}</span>{" "}
              baris selisih
            </p>
            <Badge tone={totalDiff >= 0 ? "emerald" : "red"} dot>
              Total selisih:{" "}
              <span className="font-mono">
                {totalDiff >= 0 ? `+${formatNumber(totalDiff)}` : formatNumber(totalDiff)}
              </span>
            </Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200/80">
                  {["Item", "Project", "Qty Sistem", "Qty Fisik", "Selisih", ""].map(
                    (h, i) => (
                      <th
                        key={i}
                        className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 first:pl-5"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr key={`${r.projectId}-${r.itemId}`} className="transition-colors hover:bg-zinc-50/60">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10.5px] font-bold text-white"
                          style={{ background: `hsl(${r.hue} 55% 45%)` }}
                        >
                          {r.itemName.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                        </span>
                        <div>
                          <p className="text-[13.5px] font-semibold text-zinc-900">
                            {r.itemName}
                          </p>
                          <p className="font-mono text-[10.5px] text-zinc-400">
                            {r.itemCode}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/app/opname/${r.projectId}`}
                        className="text-[13px] text-zinc-600 hover:text-emerald-600"
                      >
                        {r.projectName}
                      </Link>
                      <p className="font-mono text-[10.5px] text-zinc-400">
                        {r.warehouseCode}
                      </p>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[13px] text-zinc-700">
                      {formatNumber(r.systemQty)}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-[13px] text-zinc-700">
                      {formatNumber(r.countedQty)}
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={cx(
                          "rounded-lg px-2 py-1 font-mono text-[12.5px] font-semibold",
                          r.diff > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                        )}
                      >
                        {r.diff > 0 ? `+${formatNumber(r.diff)}` : formatNumber(r.diff)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/app/opname/${r.projectId}/variance`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                      >
                        <ArrowRight size={15} weight="bold" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
