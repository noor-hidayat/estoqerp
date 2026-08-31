import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  useStockMovement,
  useUpdateMovement,
  usePostMovement,
  useUnpostMovement,
  useAmendMovement,
} from "@/lib/api/query";
import { MenuGate } from "@/components/ui/role-guard";
import { ShellLoader } from "@/components/ui/loader";
import { Badge } from "@/components/ui/badge";
import { FormPage } from "@/components/ui/form-page";
import { MovementForm } from "@/components/transactions/movement-form";
import { formatNumber } from "@/lib/utils";
import type { StockMovementDetailRow } from "@/types";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "emerald",
  CANCELED: "destructive",
};

function ScanHistoryTable({ details }: { details: StockMovementDetailRow[] }) {
  const scanned = details.filter((d) => d.barcode);
  if (scanned.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
        <p className="text-[13px] font-medium text-foreground">
          Belum ada scan history
        </p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Transaksi ini tidak dibuat dari scan barcode.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12.5px]">
          <thead className="bg-muted/40 text-[10.5px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Barcode</th>
              <th className="px-3 py-2.5 font-semibold">Batch</th>
              <th className="px-3 py-2.5 font-semibold">Item Code</th>
              <th className="px-3 py-2.5 font-semibold">Serial Number</th>
              <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scanned.map((d) => (
              <tr key={d.id} className="hover:bg-muted/30">
                <td className="break-all px-4 py-2.5 font-mono text-[12px] text-foreground">
                  {d.barcode}
                </td>
                <td className="break-all px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">
                  {d.batchNumber ?? "—"}
                </td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-[11.5px] font-medium text-foreground">
                    {d.itemCode ?? "—"}
                  </span>
                  {d.itemName && (
                    <span className="ml-2 text-[11px] text-muted-foreground">
                      {d.itemName}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11.5px] text-muted-foreground">
                  {d.serialNumber ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] font-semibold tabular-nums text-foreground">
                  {formatNumber(d.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: movement } = useStockMovement(id);
  const update = useUpdateMovement();
  const post = usePostMovement();
  const unpost = useUnpostMovement();
  const amend = useAmendMovement();
  const [tab, setTab] = useState<"details" | "scans">("details");

  if (!movement) return <ShellLoader />;

  const isDraft = movement.status === "DRAFT";

  const tabs = (
    <div className="flex items-center gap-1 border-b border-border">
      <button
        onClick={() => setTab("details")}
        className={
          tab === "details"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Details
      </button>
      <button
        onClick={() => setTab("scans")}
        className={
          tab === "scans"
            ? "border-b-2 border-primary px-3 pb-2 text-[13px] font-semibold text-foreground"
            : "border-b-2 border-transparent px-3 pb-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        }
      >
        Scan History
      </button>
    </div>
  );

  if (tab === "scans") {
    return (
      <MenuGate menu="inventory.transactions">
        <FormPage
          title={movement.typeName ?? movement.id}
          titleBadge={
            <Badge tone={STATUS_TONE[movement.status] ?? "neutral"}>
              {movement.status}
            </Badge>
          }
          tabs={tabs}
        >
          <ScanHistoryTable details={movement.details ?? []} />
        </FormPage>
      </MenuGate>
    );
  }

  return (
    <MenuGate menu="inventory.transactions">
      <MovementForm
        title={movement.typeName ?? movement.id}
        submitLabel="Save Changes"
        initial={movement}
        readOnly={!isDraft}
        tabs={tabs}
        onSubmit={async (input) => {
          if (!isDraft) return;
          await update.mutateAsync({ id: movement.id, body: input });
        }}
        onPost={async () => {
          if (!isDraft) return;
          await post.mutateAsync(movement.id);
        }}
        onCancel={
          movement.status === "POSTED"
            ? async () => {
                if (!confirm(`Cancel posting "${movement.id}"? Stock will be reversed.`)) return;
                await unpost.mutateAsync(movement.id);
              }
            : undefined
        }
        onAmend={
          movement.status === "CANCELED"
            ? async () => {
                if (!confirm(`Amend "${movement.id}"? It will reopen as a draft.`)) return;
                await amend.mutateAsync(movement.id);
              }
            : undefined
        }
        statusBadge={
          <Badge tone={STATUS_TONE[movement.status] ?? "neutral"}>
            {movement.status}
          </Badge>
        }
      />
    </MenuGate>
  );
}