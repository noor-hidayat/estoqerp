"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { Scale, Search } from "lucide-react";
import {
  useProjects,
  useAllWarehouses,
} from "@/lib/api/query";
import { api } from "@/lib/api/client";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { cx } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/ui/role-guard";

interface VarianceStats {
  projectId: string;
  progress: { total: number; counted: number; pct: number };
  variance: { itemId: string; itemCode: string; itemName: string; unit: string; systemQty: number; countedQty: number; diff: number }[];
}

export default function VarianceReviewPage() {
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get("projectId") ?? "";
  const [projectId, setProjectId] = useState(urlProjectId || "all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (urlProjectId) setProjectId(urlProjectId);
  }, [urlProjectId]);

  const { data: projects = [] } = useProjects();
  const { data: warehouses = [] } = useAllWarehouses();

  const targetProjects = useMemo(
    () =>
      projectId === "all"
        ? projects
        : projects.filter((p) => p.id === projectId),
    [projects, projectId]
  );

  const statsQueries = useQueries({
    queries: targetProjects.map((project) => ({
      queryKey: ["project-stats", project.id],
      queryFn: () => api.get<VarianceStats>(`/projects/${project.id}/stats`),
      staleTime: 30_000,
    })),
  });

  const rows = useMemo(() => {
    return targetProjects.flatMap((project, i) => {
      const data = statsQueries[i]?.data;
      if (!data?.variance) return [];
      const wh = warehouses.find((w) => w.id === project.warehouseId);
      return data.variance
        .map((r) => ({
          projectId: project.id,
          projectName: project.name,
          warehouseName: wh?.name ?? "—",
          itemCode: r.itemCode,
          itemName: r.itemName,
          diff: r.diff,
        }))
        .filter((r) => r.diff !== 0);
    }).filter((r) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return r.itemName.toLowerCase().includes(q) || r.itemCode.includes(q);
    }).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [targetProjects, statsQueries, warehouses, query]);

  const { isSystem, permissions } = useSession();

  if (!can(isSystem, permissions, "opname.variance", "view")) {
    return <AccessDenied />;
  }

  const anyLoading = statsQueries.some((q) => q.isLoading);

  const totalDiff = rows.reduce((a, r) => a + r.diff, 0);

  if (anyLoading) {
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
            icon={<Search size={15} strokeWidth={2} />}
            className="sm:max-w-xs"
          />
          <Select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="sm:w-64"
          >
            <option value="all">Semua project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
        </div>
      </div>
    );
  }

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
          icon={<Search size={15} strokeWidth={2} />}
          className="sm:max-w-xs"
        />
        <Select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="sm:w-64"
        >
          <option value="all">Semua project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Scale size={26} strokeWidth={2} />}
          title={
            projectId === "all"
              ? "Tidak ada selisih"
              : "Tidak ada selisih"
          }
          description={
            projectId === "all"
              ? "Tidak ada item dengan selisih di semua project."
              : "Belum ada item dengan selisih di project ini."
          }
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
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
          <Table
            storageKey="variance-review"
            columns={[
              "Item Code",
              "Item Name",
              "Project",
              "Warehouse",
              "Selisih",
            ]}
          >
            {rows.map((r) => (
              <tr key={`${r.projectId}-${r.itemCode}`} className="transition-colors hover:bg-zinc-50/60">
                <Td mono truncate>
                  {r.itemCode}
                </Td>
                <Td truncate>
                  <span className="text-[13.5px] font-semibold text-zinc-900">
                    {r.itemName}
                  </span>
                </Td>
                <Td>
                  <Link
                    href={`/app/opname/${r.projectId}`}
                    className="text-[13px] text-zinc-600 hover:text-emerald-600"
                  >
                    {r.projectName}
                  </Link>
                </Td>
                <Td className="text-[12.5px] text-zinc-600">
                  {r.warehouseName}
                </Td>
                <Td className="text-right">
                  <span
                    className={cx(
                      "font-mono text-[12.5px] font-semibold",
                      r.diff === 0
                        ? "text-zinc-400"
                        : r.diff > 0
                          ? "text-emerald-600"
                          : "text-red-600"
                    )}
                  >
                    {r.diff > 0 ? `+${formatNumber(r.diff)}` : formatNumber(r.diff)}
                  </span>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
