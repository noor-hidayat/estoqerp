"use client";

import { useNavigate } from "react-router-dom";
import { useCreateMovement } from "@/lib/api/query";
import { MenuGate } from "@/components/ui/role-guard";
import { MovementForm } from "@/components/transactions/movement-form";

export default function NewTransactionPage() {
  const navigate = useNavigate();
  const create = useCreateMovement();

  return (
    <MenuGate menu="inventory.transactions">
      <MovementForm
        title="New Transaction"
        submitLabel="Save Transaction"
        onSubmit={async (input) => {
          const res = await create.mutateAsync(input);
          const id = (res as { id?: string }).id;
          if (id) navigate(`/app/transaction/${id}`);
          else navigate("/app/transaction");
        }}
      />
    </MenuGate>
  );
}
