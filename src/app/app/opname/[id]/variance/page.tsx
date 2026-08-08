"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
} from "lucide-react";
import { useDB, useData } from "@/hooks/use-db";
import { useSession } from "@/lib/session";
import { isManager } from "@/lib/roles";
import { projectCounted } from "@/lib/compute";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { cx } from "@/lib/utils";

export default function ProjectVariancePage() {
  const params = useParams<{ id: string }>();
  const db = useDB();
  const { update } = useData();
  const { user } = useSession();
  const [onlyDiff, setOnlyDiff] = useState(true);

  const project = db.projects.find((p) => p.id === params.id);
  const rows = useMemo(
    () => (project ? projectCounted(db, project) : []),
    [db, project]
  );

  if (!project) return null;

  const filtered = onlyDiff ? rows.filter((r) => r.diff !== 0) : rows;
  const totalSystem = rows.reduce((a, r) => a + r.systemQty, 0);
  const totalCounted = rows.reduce((a, r) => a + r.countedQty, 0);
  const diffItems = rows.filter((r) => r.diff !== 0).length;
  const canFinalize =
    isManager(user?.role ?? "STAFF") && project.status === "IN_PROGRESS";

  const finalize = async () => {
    await update("projects", project.id, { status: "APPROVED" });
  };

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Qty sistem</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {formatNumber(totalSystem)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Referensi stok di master item
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Qty fisik terhitung</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-600">
            {formatNumber(totalCounted)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Dari hasil scan
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Item berselisih</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {diffItems}
            <span className="ml-1 text-sm font-medium text-zinc-400">
              dari {rows.length} item
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            Perlu pengecekan ulang
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOnlyDiff(true)}
            className={cx(
              "rounded-md px-4 py-2 text-[12.5px] font-medium transition-colors",
              onlyDiff
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-800"
            )}
          >
            Hanya selisih
          </button>
          <button
            onClick={() => setOnlyDiff(false)}
            className={cx(
              "rounded-md px-4 py-2 text-[12.5px] font-medium transition-colors",
              !onlyDiff
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-800"
            )}
          >
            Semua item
          </button>
        </div>

        {canFinalize && (
          <Button variant="secondary" onClick={() => void finalize()}>
            Tandai Final
            <ArrowRight size={15} strokeWidth={2.2} />
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={26} strokeWidth={2} />}
          title="Tidak ada selisih"
          description="Semua item tercatat sesuai stok sistem. Tambahkan sesi scan bila diperlukan."
          className="py-16"
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table columns={["Item", "Qty Sistem", "Qty Fisik", "Selisih", "Status"]}>
            {filtered.map((row) => {
              const item = db.items.find((i) => i.id === row.itemId);
              const d = row.diff;
              return (
                <tr key={row.itemId} className="transition-colors hover:bg-zinc-50/60">
                  <Td>
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[10.5px] font-bold text-white"
                        style={{ background: `hsl(${item?.hue ?? 200} 55% 45%)` }}
                      >
                        {item?.name.split(" ").slice(0, 2).map((w) => w[0]).join("") ?? "?"}
                      </span>
                      <div>
                        <p className="text-[13.5px] font-semibold text-zinc-900">
                          {item?.name ?? "—"}
                        </p>
                        <p className="font-mono text-[10.5px] text-zinc-400">
                          {item?.code} · {item?.unit}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td mono>{formatNumber(row.systemQty)}</Td>
                  <Td mono>{formatNumber(row.countedQty)}</Td>
                  <Td>
                    <span
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[12.5px] font-semibold",
                        d === 0
                          ? "bg-zinc-50 text-zinc-400"
                          : d > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-red-50 text-red-700"
                      )}
                    >
                      {d > 0 ? `+${formatNumber(d)}` : formatNumber(d)}
                    </span>
                  </Td>
                  <Td>
                    <Badge
                      tone={d === 0 ? "neutral" : d > 0 ? "emerald" : "red"}
                      dot
                    >
                      {d === 0
                        ? "Cocok"
                        : d > 0
                          ? "Lebih banyak"
                          : "Kurang"}
                    </Badge>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="mt-4 flex items-center gap-2 text-[12px] text-zinc-400">
          <ArrowLeftRight size={14} strokeWidth={2.2} />
          Variance dihitung otomatis dari total scan per item vs stok sistem di
          master item.
        </p>
      )}
    </div>
  );
}
