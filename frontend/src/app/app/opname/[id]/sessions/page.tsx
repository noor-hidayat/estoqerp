"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ScanLine } from "lucide-react";
import { useProject, useScanSessions, useScanRecords, useItemsList } from "@/lib/api/query";
import { formatDateTime, formatId, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/ui/stat";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ShellLoader } from "@/components/ui/loader";
import { useSession } from "@/lib/session";
import { can } from "@/lib/permissions";
import { AccessDenied } from "@/components/ui/role-guard";

export default function ScanSessionsPage() {
  const params = useParams<{ id: string }>();
  const { data: project, isLoading: projectLoading } = useProject(params.id);
  const { data: sessions = [], isLoading: sessionsLoading } = useScanSessions({ projectId: params.id });
  const { data: recordsData } = useScanRecords({ projectId: params.id, pageSize: 10000 });
  const { data: items = [] } = useItemsList();
  const { isSystem, permissions } = useSession();
  const canDetail = can(isSystem, permissions, "opname.detail.sessions.detail", "view");
  const canScan = can(isSystem, permissions, "opname.detail.scan", "view");

  if (!can(isSystem, permissions, "opname.detail.sessions", "view")) {
    return <AccessDenied />;
  }

  if (projectLoading || sessionsLoading) return <ShellLoader />;
  if (!project) return null;

  const records = recordsData?.rows ?? [];

  const stats = sessions.map((s) => {
    const recs = records
      .filter((r) => r.sessionId === s.id)
      .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));
    return {
      session: s,
      recs,
      qty: recs.reduce((a, r) => a + r.quantity, 0),
      barcodes: recs.length,
      lastItemName: recs[0]
        ? items.find((i) => i.id === recs[0].itemId)?.name ?? "—"
        : "—",
      lastItemUnit: recs[0]
        ? items.find((i) => i.id === recs[0].itemId)?.unit ?? "—"
        : "—",
    };
  });

  const distinctItems = new Set(
    records.map((r) => r.itemId).filter(Boolean)
  ).size;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-[13px] text-zinc-500">
          <span className="font-semibold text-zinc-900">{sessions.length}</span>{" "}
          sesi scan · <span className="font-semibold text-zinc-900">{project.name}</span>
        </p>
        {canScan && (
          <Link href={`/app/opname/${project.id}/scan`}>
            <Button variant="secondary" size="sm">
              <ScanLine size={14} strokeWidth={2} />
              Buka Halaman Scan
            </Button>
          </Link>
        )}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          compact
          label="Total Sesi"
          value={stats.length}
          sub={`${stats.filter((s) => s.session.status === "ACTIVE").length} sesi aktif`}
          icon={<ScanLine size={16} strokeWidth={2} />}
          accent
        />
        <Stat
          compact
          label="Total Barcode"
          value={formatNumber(stats.reduce((a, s) => a + s.barcodes, 0))}
          sub="Barcode di-scan"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Total Qty"
          value={formatNumber(stats.reduce((a, s) => a + s.qty, 0))}
          sub="Unit terhitung"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
        <Stat
          compact
          label="Item Unik"
          value={formatNumber(distinctItems)}
          sub="Item berbeda di-scan"
          icon={<ScanLine size={16} strokeWidth={2} />}
        />
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={<ScanLine size={26} strokeWidth={2} />}
          title="Belum ada sesi scan"
          description="Sesi scan akan tercatat di sini setelah dimulai dari halaman scan."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table
            storageKey="scan-sessions"
            columns={[
              "Session Code",
              "Item Name",
              "Qty Barcode",
              "Qty",
              "UOM",
              "Start",
              "End",
              "Detail",
            ]}
          >
            {stats.map(({ session: s, qty, barcodes, lastItemName, lastItemUnit }) => (
              <tr key={s.id} className="transition-colors hover:bg-zinc-50/60">
                <Td mono className="text-[12px] text-zinc-600">
                  {formatId(s.id)}
                </Td>
                <Td truncate className="text-[12.5px]">
                  {lastItemName}
                </Td>
                <Td mono className="text-right">
                  {formatNumber(barcodes)}
                </Td>
                <Td mono className="text-right">
                  {formatNumber(qty)}
                </Td>
                <Td className="text-[12.5px]">{lastItemUnit}</Td>
                <Td className="whitespace-nowrap text-[12px] text-zinc-500">
                  {formatDateTime(s.startedAt)}
                </Td>
                <Td className="whitespace-nowrap text-[12px] text-zinc-500">
                  {s.endedAt ? formatDateTime(s.endedAt) : "—"}
                </Td>
                <Td>
                  {canDetail ? (
                    <Link
                      href={`/app/opname/${project.id}/sessions/${s.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                    >
                      <ScanLine size={15} strokeWidth={2} />
                    </Link>
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center text-zinc-200">
                      <ScanLine size={15} strokeWidth={2} />
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
