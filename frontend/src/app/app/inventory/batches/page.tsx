"use client";

import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import {
  useBatches,
  useStockBatches,
  useItemsList,
  useAllWarehouses,
} from "@/lib/api/query";
import type { Batch, StockBatch } from "@/types";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { MenuGate } from "@/components/ui/role-guard";
import { Select } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";

interface BatchRow {
  key: string;
  batchId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  batchNumber: string;
  status: Batch["status"];
  warehouseId: string | null;
  warehouseLabel: string;
  qty: number;
}

export default function BatchesPage() {
  const [itemId, setItemId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [status, setStatus] = useState("all");

  const { data: batchesRaw = [] } = useBatches();
  const { data: stockBatches = [] } = useStockBatches();
  const { data: items = [] } = useItemsList();
  const { data: warehouses = [] } = useAllWarehouses();

  const itemOf = useMemo(() => {
    const m = new Map(items.map((i) => [i.id, i]));
    return (id: string) => m.get(id);
  }, [items]);

  const whOf = useMemo(() => {
    const m = new Map(warehouses.map((w) => [w.id, w]));
    return (id: string) => m.get(id);
  }, [warehouses]);

  const rows: BatchRow[] = useMemo(() => {
    const stockMap = new Map<string, StockBatch[]>();
    for (const sb of stockBatches) {
      const list = stockMap.get(sb.batchId) ?? [];
      list.push(sb);
      stockMap.set(sb.batchId, list);
    }
    const out: BatchRow[] = [];
    for (const b of batchesRaw) {
      const item = itemOf(b.itemId);
      if (itemId !== "all" && b.itemId !== itemId) continue;
      if (status !== "all" && b.status !== status) continue;
      const stocks = stockMap.get(b.id) ?? [];
      const filtered = stocks.filter(
        (s) => warehouseId === "all" || s.warehouseId === warehouseId
      );
      if (filtered.length === 0) {
        out.push({
          key: `${b.id}|none`,
          batchId: b.id,
          itemId: b.itemId,
          itemCode: item?.code ?? "—",
          itemName: item?.name ?? "—",
          batchNumber: b.batchNumber,
          status: b.status,
          warehouseId: null,
          warehouseLabel: "—",
          qty: 0,
        });
      } else {
        for (const s of filtered) {
          const wh = whOf(s.warehouseId);
          out.push({
            key: `${b.id}|${s.warehouseId}`,
            batchId: b.id,
            itemId: b.itemId,
            itemCode: item?.code ?? "—",
            itemName: item?.name ?? "—",
            batchNumber: b.batchNumber,
            status: b.status,
            warehouseId: s.warehouseId,
            warehouseLabel: wh ? `${wh.code} — ${wh.name}` : s.warehouseId,
            qty: Number(s.qty),
          });
        }
      }
    }
    return out.sort(
      (a, b) =>
        a.itemCode.localeCompare(b.itemCode) ||
        a.batchNumber.localeCompare(b.batchNumber)
    );
  }, [batchesRaw, stockBatches, items, warehouses, itemId, warehouseId, status, itemOf, whOf]);

  const columns: DataTableColumn<BatchRow>[] = [
    {
      id: "item",
      header: "Item",
      sortValue: (r) => r.itemName,
      cell: (r) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">{r.itemCode}</span>
          <span className="text-[13px] font-medium text-foreground">{r.itemName}</span>
        </div>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "batch",
      header: "Batch Number",
      sortValue: (r) => r.batchNumber,
      cell: (r) => (
        <span className="font-mono text-xs font-medium text-foreground">
          {r.batchNumber}
        </span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseLabel,
      cell: (r) => (
        <span className="text-xs text-muted-foreground">{r.warehouseLabel}</span>
      ),
      className: "min-w-[150px]",
    },
    {
      id: "qty",
      header: "On-hand",
      align: "right",
      sortValue: (r) => r.qty,
      cell: (r) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {formatNumber(r.qty)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge tone={r.status === "ACTIVE" ? "emerald" : "neutral"}>{r.status}</Badge>
      ),
      className: "whitespace-nowrap",
    },
  ];

  return (
    <MenuGate menu="inventory.batches">
      <PageHeader title="Batch" />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.key}
        searchPlaceholder="Search batch or item..."
        getSearchText={(r) => `${r.batchNumber} ${r.itemCode} ${r.itemName}`}
        filters={
          <>
            <Select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="h-8 w-52 text-xs"
            >
              <option value="all">All items</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code} — {i.name}
                </option>
              ))}
            </Select>
            <Select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-8 w-52 text-xs"
            >
              <option value="all">All warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-8 w-32 text-xs"
            >
              <option value="all">All status</option>
              <option value="ACTIVE">Active</option>
              <option value="EMPTY">Empty</option>
            </Select>
          </>
        }
        minWidth={720}
        emptyIcon={<Layers size={26} strokeWidth={2} />}
        emptyTitle="No batches yet"
        emptyDescription="Batch otomatis dibuat saat transaksi receiving/transfer dengan nomor batch diposting."
        onResetFilters={() => {
          setItemId("all");
          setWarehouseId("all");
          setStatus("all");
        }}
      />
    </MenuGate>
  );
}
