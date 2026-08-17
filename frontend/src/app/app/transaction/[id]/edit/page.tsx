"use client";

import { useNavigate, useParams } from "react-router-dom";
import { useStockMovement, useUpdateMovement } from "@/lib/api/query";
import { MenuGate } from "@/components/ui/role-guard";
import { ShellLoader } from "@/components/ui/loader";
import { MovementForm } from "@/components/transactions/movement-form";

export default function EditTransactionPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: movement, isLoading } = useStockMovement(id);
  const update = useUpdateMovement();

  if (isLoading || !movement) return <ShellLoader />;

  if (movement.status !== "DRAFT") {
    return (
      <MenuGate menu="inventory.transactions">
        <div className="mx-auto w-full max-w-[680px] pt-10">
          <p className="rounded-lg bg-muted px-3 py-2 text-[12.5px] text-destructive">
            Transaksi sudah diposting — tidak dapat diubah lagi.
          </p>
        </div>
      </MenuGate>
    );
  }

  return (
    <MenuGate menu="inventory.transactions">
      <MovementForm
        title={`Edit ${movement.movementNumber}`}
        submitLabel="Save Changes"
        initial={movement}
        onSubmit={async (input) => {
          await update.mutateAsync({ id: movement.id, body: input });
          navigate(`/app/transaction/${movement.id}`);
        }}
      />
    </MenuGate>
  );
}
