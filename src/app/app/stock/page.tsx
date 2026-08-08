"use client";

import { useMemo, useState } from "react";
import {
  FileDown,
  FileSpreadsheet,
  Notebook,
  Search,
} from "lucide-react";
import { useDB } from "@/hooks/use-db";
import { formatNumber } from "@/lib/utils";
import { exportPdf, exportXlsx } from "@/lib/export";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export default function StockLedgerPage() {
  const db = useDB();
  const [query, setQuery] = useState("");
  const [warehouseId, setWarehouseId] = useState("all");

  const warehouses = useMemo(
    () =>
      warehouseId === "all"
        ? db.warehouses
        : db.warehouses.filter((w) => w.id === warehouseId),
    [db, warehouseId]
  );

  const rows = useMemo(() => {
    const items = db.items.filter((i) => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q)
      );
    });

    const out: {
      code: string;
      name: string;
      unit: string;
      category: string;
      warehouse: string;
      qty: number;
    }[] = [];

    for (const item of items) {
      for (const wh of warehouses) {
        const qty = item.systemStock[wh.id] ?? 0;
        out.push({
          code: item.code,
          name: item.name,
          unit: item.unit,
          category:
            db.categories.find((c) => c.id === item.categoryId)?.name ?? "—",
          warehouse: wh.code,
          qty,
        });
      }
    }

    return out.sort(
      (a, b) =>
        a.code.localeCompare(b.code) || a.warehouse.localeCompare(b.warehouse)
    );
  }, [db, query, warehouses]);

  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalItems = new Set(rows.map((r) => r.code)).size;

  const exportColumns = [
    { key: "code" as const, header: "Kode Item" },
    { key: "name" as const, header: "Nama Item" },
    { key: "qty" as const, header: "Qty", format: (v: unknown) => formatNumber(Number(v)) },
    { key: "unit" as const, header: "UOM" },
    { key: "category" as const, header: "Kategori" },
    { key: "warehouse" as const, header: "Warehouse" },
  ];

  const handleExport = (type: "xlsx" | "pdf") => {
    const base = "stock-ledger";
    const meta = {
      title: "Stock Ledger — Monitoring Stok",
      subtitle: `${totalItems} item · total qty ${formatNumber(totalQty)}`,
    };
    if (type === "xlsx")
      exportXlsx(rows, exportColumns, base, "Stock Ledger");
    else exportPdf(rows, exportColumns, base, meta);
  };

  return (
    <div>
      <PageHeader
        title="Stock Balance"
        description="Monitoring stok per item di setiap gudang."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("xlsx")}
            >
              <FileSpreadsheet
                size={15}
                strokeWidth={2.2}
                className="text-emerald-600"
              />
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport("pdf")}
            >
              <FileDown size={15} strokeWidth={2.2} className="text-red-500" />
              PDF
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Total item</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {totalItems}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Total qty</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {formatNumber(totalQty)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <p className="text-[12px] font-medium text-zinc-400">Baris stok</p>
          <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {rows.length}
          </p>
        </div>
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Cari kode atau nama item..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          icon={<Search size={15} strokeWidth={2.2} />}
          className="sm:max-w-xs"
        />
        <Select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="sm:w-56"
        >
          <option value="all">Semua gudang</option>
          {db.warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} — {w.name}
            </option>
          ))}
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Notebook size={26} strokeWidth={2} />}
          title="Tidak ada data stok"
          description="Belum ada data item atau sesuaikan filter."
        />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <Table
            columns={[
              "Kode Item",
              "Nama Item",
              "Qty",
              "UOM",
              "Kategori",
              "Warehouse",
            ]}
          >
            {rows.map((r, i) => (
              <tr key={i} className="transition-colors hover:bg-zinc-50/60">
                <Td mono>{r.code}</Td>
                <Td className="text-[13.5px] font-semibold text-zinc-900">
                  {r.name}
                </Td>
                <Td mono>{formatNumber(r.qty)}</Td>
                <Td className="text-[12.5px] text-zinc-500">{r.unit}</Td>
                <Td className="text-[12.5px] text-zinc-500">{r.category}</Td>
                <Td className="text-[12.5px] text-zinc-500">{r.warehouse}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </div>
  );
}
