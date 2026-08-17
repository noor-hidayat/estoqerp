"use client";

import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Pencil,
  Send,
  Trash2,
} from "lucide-react";
import {
  useStockMovement,
  usePostMovement,
  useDeleteMovement,
} from "@/lib/api/query";
import { formatDate, formatNumber } from "@/lib/utils";
import { MenuGate } from "@/components/ui/role-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShellLoader } from "@/components/ui/loader";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import type { StockMovementDetailRow } from "@/types";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "emerald",
};

export default function TransactionDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: movement, isLoading } = useStockMovement(id);
  const postMovement = usePostMovement();
  const deleteMovement = useDeleteMovement();

  if (isLoading || !movement) return <ShellLoader />;

  const handlePost = async () => {
    if (!confirm(`Post transaction "${movement.movementNumber}"? Stock will be applied.`)) return;
    try {
      await postMovement.mutateAsync(movement.id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to post");
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete transaction "${movement.movementNumber}"?`)) return;
    try {
      await deleteMovement.mutateAsync(movement.id);
      navigate("/app/transaction");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const columns: DataTableColumn<StockMovementDetailRow>[] = [
    {
      id: "item",
      header: "Item",
      sortValue: (d) => d.itemCode ?? "",
      cell: (d) => (
        <div className="flex flex-col">
          <span className="font-mono text-xs text-muted-foreground">{d.itemCode ?? "—"}</span>
          <span className="text-[13px] font-medium text-foreground">{d.itemName ?? "—"}</span>
        </div>
      ),
      className: "min-w-[180px]",
    },
    {
      id: "from",
      header: "From",
      sortValue: (d) => d.fromWarehouseName ?? "",
      cell: (d) => (
        <span className="text-xs text-foreground">
          {d.fromWarehouseCode ? `${d.fromWarehouseCode} — ${d.fromWarehouseName}` : "—"}
        </span>
      ),
      className: "min-w-[140px]",
    },
    {
      id: "to",
      header: "To",
      sortValue: (d) => d.toWarehouseName ?? "",
      cell: (d) => (
        <span className="text-xs text-foreground">
          {d.toWarehouseCode ? `${d.toWarehouseCode} — ${d.toWarehouseName}` : "—"}
        </span>
      ),
      className: "min-w-[140px]",
    },
    {
      id: "batch",
      header: "Batch",
      sortValue: (d) => d.batchNumber ?? "",
      cell: (d) => (
        <span className="font-mono text-xs text-foreground">{d.batchNumber ?? "—"}</span>
      ),
      className: "whitespace-nowrap",
    },
    {
      id: "qty",
      header: "Qty",
      align: "right",
      sortValue: (d) => d.qty,
      cell: (d) => (
        <span className="font-mono text-xs font-semibold tabular-nums">
          {formatNumber(d.qty)}
          {d.uomCode ? ` ${d.uomCode}` : d.unit ? ` ${d.unit}` : ""}
        </span>
      ),
    },
  ];

  return (
    <MenuGate menu="inventory.transactions">
      <PageHeader
        title={movement.movementNumber}
        actions={
          <>
            {movement.status === "DRAFT" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => navigate(`/app/transaction/${movement.id}/edit`)}
                >
                  <Pencil size={14} strokeWidth={2} />
                  Edit
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handlePost}
                >
                  <Send size={14} strokeWidth={2} />
                  Post
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleDelete}
                >
                  <Trash2 size={14} strokeWidth={2} />
                  Delete
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Type</p>
          <p className="mt-1 text-[15px] font-semibold text-foreground">
            {movement.typeName ?? movement.typeCode ?? "—"}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Date</p>
          <p className="mt-1 font-mono text-[15px] font-semibold text-foreground">
            {formatDate(movement.movementDate)}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Status</p>
          <div className="mt-1.5">
            <Badge tone={STATUS_TONE[movement.status] ?? "neutral"}>
              {movement.status}
            </Badge>
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Reference</p>
          <p className="mt-1 font-mono text-[13px] font-medium text-foreground">
            {movement.referenceId ?? "—"}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Created by</p>
          <p className="mt-1 text-[13px] font-medium text-foreground">
            {movement.createdByName ?? "—"}
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-5">
          <p className="text-[12px] font-medium text-muted-foreground">Total qty</p>
          <p className="mt-1 font-mono text-[15px] font-semibold text-foreground">
            {formatNumber(movement.details.reduce((a, d) => a + Number(d.qty), 0))}
          </p>
        </div>
      </div>

      {movement.description && (
        <p className="mb-5 rounded-md border border-border bg-card px-3.5 py-2.5 text-[13px] text-muted-foreground">
          {movement.description}
        </p>
      )}

      <div className="mb-6 flex items-center gap-3 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <ArrowLeftRight size={14} strokeWidth={2} />
        Items
        <div className="h-px flex-1 bg-border" />
      </div>

      <DataTable
        columns={columns}
        data={movement.details}
        getRowId={(d) => d.id}
        searchPlaceholder="Search items..."
        getSearchText={(d) => `${d.itemCode ?? ""} ${d.itemName ?? ""}`}
        minWidth={640}
        emptyIcon={<ArrowRight size={26} strokeWidth={2} />}
        emptyTitle="No items"
        emptyDescription="This transaction has no detail rows."
      />

      <div className="mt-8">
        <Button variant="ghost" onClick={() => navigate("/app/transaction")}>
          <ArrowLeft size={15} strokeWidth={2} />
          Back to Transactions
        </Button>
      </div>
    </MenuGate>
  );
}
