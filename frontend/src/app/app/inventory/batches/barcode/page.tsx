"use client";

import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, Barcode } from "lucide-react";
import {
  useStockBarcodes,
  useBatches,
  useItemsList,
  useAllWarehouses,
} from "@/lib/api/query";
import type { StockBarcode } from "@/types";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

export default function BatchBarcodesPage() {
  const [searchParams] = useSearchParams();

  const [batchId, setBatchId] = useState(searchParams.get("batch") ?? "all");
  const [warehouseId, setWarehouseId] = useState(
    searchParams.get("wh") ?? "all"
  );
  const [itemId, setItemId] = useState(searchParams.get("item") ?? "all");

  const { data: batches = [] } = useBatches();
  const { data: items = [] } = useItemsList();
  const { data: warehouses = [] } = useAllWarehouses();
  const { data, isLoading } = useStockBarcodes({
    batchId: batchId !== "all" ? batchId : undefined,
    warehouseId: warehouseId !== "all" ? warehouseId : undefined,
    itemId: itemId !== "all" ? itemId : undefined,
  });

  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const batchMap = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);
  const whMap = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);
  const rows = data ?? [];
  const total = rows.length;

  const columns: DataTableColumn<StockBarcode>[] = [
    {
      id: "itemCode",
      header: "Kode Item",
      sortValue: (r) => itemMap.get(r.itemId ?? "")?.code ?? "",
      cell: (r) => (
        <span className="whitespace-nowrap font-mono text-xs font-medium text-foreground">
          {itemMap.get(r.itemId ?? "")?.code ?? "—"}
        </span>
      ),
      className: "min-w-[100px]",
    },
    {
      id: "itemName",
      header: "Nama Item",
      sortValue: (r) => itemMap.get(r.itemId ?? "")?.name ?? "",
      cell: (r) => (
        <span className="block max-w-[280px] truncate text-[13px] font-medium text-foreground">
          {itemMap.get(r.itemId ?? "")?.name ?? "—"}
        </span>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "barcode",
      header: "Barcode",
      sortValue: (r) => r.barcode,
      cell: (r) => <span className="font-mono text-xs">{r.barcode}</span>,
      className: "whitespace-nowrap",
    },
    {
      id: "batch",
      header: "Batch",
      sortValue: (r) => batchMap.get(r.batchId ?? "")?.batchNumber ?? "",
      cell: (r) => (
        <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
          {batchMap.get(r.batchId ?? "")?.batchNumber ?? r.barcode}
        </span>
      ),
      className: "min-w-[150px]",
    },
    {
      id: "warehouse",
      header: "Gudang",
      sortValue: (r) => whMap.get(r.warehouseId)?.name ?? r.warehouseId,
      cell: (r) => (
        <span className="text-[12.5px]">
          {whMap.get(r.warehouseId)?.name ?? r.warehouseId}
        </span>
      ),
      className: "min-w-[160px]",
    },
  ];

  return (
    <MenuGate menu="inventory.batches">
      <PageHeader
        title="Barcode Batch"
        actions={
          <Link
            to="/app/inventory/batches"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} strokeWidth={2} />
            Kembali ke Batch
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          className="h-8 w-56 text-xs"
        >
          <option value="all">Semua batch</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchNumber}
            </option>
          ))}
        </Select>
        <Select
          value={warehouseId}
          onChange={(e) => setWarehouseId(e.target.value)}
          className="h-8 w-48 text-xs"
        >
          <option value="all">Semua gudang</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
        <Select
          value={itemId}
          onChange={(e) => setItemId(e.target.value)}
          className="h-8 w-52 text-xs"
        >
          <option value="all">Semua item</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.barcode}
        loading={isLoading}
        searchPlaceholder="Cari barcode..."
        getSearchText={(r) =>
          `${r.barcode} ${itemMap.get(r.itemId)?.name ?? ""} ${whMap.get(r.warehouseId)?.name ?? ""}`
        }
        footerLeft={
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">{total}</span> barcode
          </span>
        }
        minWidth={680}
        emptyIcon={<Barcode size={26} strokeWidth={2} />}
        emptyTitle="Belum ada barcode"
        emptyDescription="Tidak ada barcode yang cocok dengan filter terpilih."
      />
    </MenuGate>
  );
}
