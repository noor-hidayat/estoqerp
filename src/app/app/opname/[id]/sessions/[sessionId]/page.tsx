"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ScanLine } from "lucide-react";
import { useDB } from "@/hooks/use-db";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default function ScanSessionDetailPage() {
  const params = useParams<{ id: string; sessionId: string }>();
  const db = useDB();

  const project = db.projects.find((p) => p.id === params.id);
  const session = db.scanSessions.find((s) => s.id === params.sessionId);

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

  const records = db.scanRecords
    .filter((r) => r.sessionId === session.id)
    .sort((a, b) => b.scannedAt.localeCompare(a.scannedAt));

  const totalBarcodes = records.length;
  const totalQty = records.reduce((a, r) => a + r.quantity, 0);
  const distinctItems = new Set(records.map((r) => r.itemId).filter(Boolean))
    .size;

  const location = db.locations.find((l) => l.id === session.locationId);
  const user = db.users.find((u) => u.id === session.scannedBy);
  const serial = db.scanSessions
    .filter((s) => s.projectId === project.id)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .findIndex((s) => s.id === session.id) + 1;

  const itemOf = (itemId?: string) =>
    db.items.find((i) => i.id === itemId);

  return (
    <div>
      <Link
        href={`/app/opname/${project.id}`}
        className="mb-6 inline-flex items-center gap-2 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-800"
      >
        <ArrowLeft size={15} strokeWidth={2.2} />
        Kembali ke Project
      </Link>

      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={session.status === "ACTIVE" ? "amber" : "neutral"} dot>
            {session.status === "ACTIVE" ? "Aktif" : "Selesai"}
          </Badge>
          <Badge tone="emerald">
            Sesi #{String(serial).padStart(3, "0")}
          </Badge>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-[28px]">
          {project.name}
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {location ? `${location.code} — ${location.name}` : "Lokasi —"} ·{" "}
          {user?.name ?? "—"} · dimulai {formatDateTime(session.startedAt)}
          {session.endedAt && ` · selesai ${formatDateTime(session.endedAt)}`}
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
                  <Td>
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-white"
                        style={{
                          background: `hsl(${item?.hue ?? 200} 55% 45%)`,
                        }}
                      >
                        {item?.name
                          .split(" ")
                          .slice(0, 2)
                          .map((w) => w[0])
                          .join("") ?? "?"}
                      </span>
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
                    </div>
                  </Td>
                  <Td mono>{formatNumber(r.quantity)}</Td>
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
