import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import {
  useBatches,
  useStockBatches,
  useItemsList,
  useAllWarehouses,
} from "@/lib/api/query";
import type { Batch, StockBatch } from "@/types";
import { formatNumber, formatDate } from "@/lib/utils";
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
  productionDate: string | null;
  expiryDate: string | null;
  shift: string | null;
  warehouseId: string | null;
  warehouseLabel: string;
  qty: number;
}

export default function BatchesPage() {
  const [itemId, setItemId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

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
          itemCode: item?.code ?? "",
          itemName: item?.name ?? "",
          batchNumber: b.batchNumber,
          status: b.status,
          productionDate: b.productionDate ?? null,
          expiryDate: b.expiryDate ?? null,
          shift: b.shift ?? null,
          warehouseId: null,
          warehouseLabel: "",
          qty: 0,
        });
      } else {
        for (const s of filtered) {
          const wh = whOf(s.warehouseId);
          out.push({
            key: `${b.id}|${s.warehouseId}`,
            batchId: b.id,
            itemId: b.itemId,
            itemCode: item?.code ?? "",
            itemName: item?.name ?? "",
            batchNumber: b.batchNumber,
            status: b.status,
            productionDate: b.productionDate ?? null,
            expiryDate: b.expiryDate ?? null,
            shift: b.shift ?? null,
            warehouseId: s.warehouseId,
            warehouseLabel: wh ? wh.name : s.warehouseId,
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
      id: "itemCode",
      header: "Item Code",
      sortValue: (r) => r.itemCode,
      cell: (r) => (
        <span className="whitespace-nowrap text-xs font-medium text-foreground">
          {r.itemCode}
        </span>
      ),
      className: "min-w-[90px]",
    },
    {
      id: "itemName",
      header: "Item Name",
      sortValue: (r) => r.itemName,
      cell: (r) => (
        <span
          className="block max-w-[320px] truncate text-[13px] font-medium text-foreground"
          title={r.itemName}
        >
          {r.itemName}
        </span>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "batch",
      header: "Batch Number",
      sortValue: (r) => r.batchNumber,
      cell: (r) => {
        const q = new URLSearchParams();
        q.set("batch", r.batchId);
        if (warehouseId !== "all") q.set("wh", warehouseId);
        if (itemId !== "all") q.set("item", itemId);
        return (
          <Link
            to={`/app/inventory/batches/barcode?${q.toString()}`}
            className="whitespace-nowrap text-xs font-medium text-primary hover:underline"
          >
            {r.batchNumber}
          </Link>
        );
      },
      className: "min-w-[150px]",
    },
    {
      id: "productionDate",
      header: "Production",
      sortValue: (r) => r.productionDate ?? "",
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.productionDate ? formatDate(r.productionDate) : ""}
        </span>
      ),
      className: "min-w-[100px]",
    },
    {
      id: "expiry",
      header: "Expiry",
      sortValue: (r) => r.expiryDate ?? "",
      cell: (r) => {
        const expired =
          r.expiryDate && new Date(`${r.expiryDate}T00:00:00`) < new Date();
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
            <span className="text-muted-foreground">
              {r.expiryDate ? formatDate(r.expiryDate) : ""}
            </span>
            {expired && (
              <Badge tone="red">Expired</Badge>
            )}
          </span>
        );
      },
      className: "min-w-[110px]",
    },
    {
      id: "shift",
      header: "Shift",
      sortValue: (r) => r.shift ?? "",
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.shift ?? ""}
        </span>
      ),
      className: "min-w-[60px]",
    },
    {
      id: "warehouse",
      header: "Warehouse",
      sortValue: (r) => r.warehouseLabel,
      cell: (r) => (
        <span
          className="block max-w-[260px] truncate text-xs text-muted-foreground"
          title={r.warehouseLabel}
        >
          {r.warehouseLabel}
        </span>
      ),
      className: "min-w-[150px]",
    },
    {
      id: "qty",
      header: "On-hand",
      align: "right",
      sortValue: (r) => r.qty,
      cell: (r) => (
        <span className="text-xs font-semibold tabular-nums">
          {formatNumber(r.qty)}
        </span>
      ),
      className: "min-w-[70px]",
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge tone={r.status === "ACTIVE" ? "emerald" : "neutral"}>{r.status}</Badge>
      ),
      className:
        "sticky right-0 z-10 min-w-[90px] bg-card",
      headerClassName: "sticky right-0 z-10 bg-muted/40",
    },
  ];

  return (
    <MenuGate menu="inventory.batches">
      <PageHeader title="Batch" />

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.key}
        selectable
        selectedKeys={selectedKeys}
        onSelectionChange={setSelectedKeys}
        columnVisibilityKey="estoq:cols:batches"
        tableClassName="border-separate border-spacing-0"
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
                  {i.name}
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
                  {w.name}
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