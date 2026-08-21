"use client";

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
import { MovementForm } from "@/components/transactions/movement-form";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "emerald",
  CANCELED: "destructive",
};

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: movement } = useStockMovement(id);
  const update = useUpdateMovement();
  const post = usePostMovement();
  const unpost = useUnpostMovement();
  const amend = useAmendMovement();

  if (!movement) return <ShellLoader />;

  const isDraft = movement.status === "DRAFT";

  return (
    <MenuGate menu="inventory.transactions">
      <MovementForm
        title={movement.typeName ?? movement.movementNumber}
        submitLabel="Save Changes"
        initial={movement}
        readOnly={!isDraft}
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
                if (!confirm(`Cancel posting "${movement.movementNumber}"? Stock will be reversed.`)) return;
                await unpost.mutateAsync(movement.id);
              }
            : undefined
        }
        onAmend={
          movement.status === "CANCELED"
            ? async () => {
                if (!confirm(`Amend "${movement.movementNumber}"? It will reopen as a draft.`)) return;
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