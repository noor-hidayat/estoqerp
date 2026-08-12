"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ScanLine } from "lucide-react";
import { useProject, useScanSessions, useScanRecords, useItemsList, useLocations, useUsers } from "@/lib/api/query";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ShellLoader } from "@/components/ui/loader";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/ui/role-guard";

export default function ScanSessionDetailPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const { data: project, isLoading: projectLoading } = useProject(params.id);
  const { data: sessions = [], isLoading: sessionsLoading } = useScanSessions({ projectId: params.id });
  const { data: recordsData } = useScanRecords({ projectId: params.id, sessionId: params.sessionId, pageSize: 10000 });
  const { data: items = [] } = useItemsList();
  const { data: locations = [] } = useLocations();
  const { data: users = [] } = useUsers();
  const { isSystem, permissions } = useSession();

  if (!can(isSystem, permissions, "opname.detail.sessions.detail", "view")) {
    return <AccessDenied />;
  }

  if (projectLoading || sessionsLoading) return <ShellLoader />;

  const session = sessions.find((s) => s.id === params.sessionId);

  if (!project || !session) {
    return (
      <div className="py-20 text-center">
        <p className="text-lg font-semibold text-zinc-800">
          Sesi scan tidak ditemukan
        </p>
        <Link
          href={`/app/opname/${params.id}`}
          className="mt-2 inline-block text-sm text-emerald-600 hover:text-emerald-700"
        >
          Kembali ke Project
        </Link>
      </div>
    );
  }

  const records = (recordsData?.rows ?? [])
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));

  const totalBarcodes = records.length;
  const totalQty = records.reduce((a, r) => a + r.quantity, 0);
  const distinctItems = new Set(records.map((r) => r.itemId).filter(Boolean))
    .size;

  const location = locations.find((l) => l.id === session.locationId);
  const user = users.find((u) => u.id === session.scannedBy);

  const itemOf = (itemId?: string) =>
    items.find((i) => i.id === itemId);

  return (
    <div>
      <Breadcrumb
        crumbs={[
          { label: "Projects", href: "/app/opname" },
          { label: "Detail Project", href: `/app/opname/${project.id}` },
          { label: "Detail Session" },
        ]}
      />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
          {project.name}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {location ? `${location.code} — ${location.name}` : "Lokasi —"} ·{" "}
          {user?.name ?? "—"}
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">
            Total barcode discan
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {formatNumber(totalBarcodes)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">barcode</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Total qty</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-emerald-600">
            {formatNumber(totalQty)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">unit terhitung</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Item unik</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {formatNumber(distinctItems)}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-400">item berbeda</p>
        </div>
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon={<ScanLine size={26} strokeWidth={2} />}
          title="Belum ada scan di sesi ini"
          description="Scan barcode pada sesi ini akan tercatat di sini."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table
            storageKey="session-records"
            columns={["Barcode", "Item", "Qty", "Sumber", "Waktu"]}
          >
            {records.map((r) => {
              const item = itemOf(r.itemId);
              return (
                <tr
                  key={r.id}
                  className="transition-colors hover:bg-zinc-50/60"
                >
                  <Td mono className="text-[12px] text-zinc-600">
                    {r.barcode}
                  </Td>
                  <Td truncate>
                    <div>
                      <p className="text-[13px] font-medium text-zinc-800">
                        {item?.name ?? "—"}
                      </p>
                      {item && (
                        <p className="font-mono text-[10.5px] text-zinc-400">
                          {item.code}
                        </p>
                      )}
                    </div>
                  </Td>
                  <Td mono className="text-right">{formatNumber(r.quantity)}</Td>
                  <Td>
                    {r.itemId ? (
                      <Badge tone="emerald" dot>
                        Teridentifikasi
                      </Badge>
                    ) : (
                      <Badge tone="neutral" dot>
                        Tidak dikenal
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-[12px] text-zinc-500">
                    {formatDateTime(r.scannedAt)}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </div>
      )}
    </div>
  );
}
