"use client";

import { useState } from "react";
import { useCreateMovement, usePostMovement } from "@/lib/api/query";
import { MenuGate } from "@/components/ui/role-guard";
import { MovementForm } from "@/components/transactions/movement-form";

export default function NewTransactionPage() {
  const create = useCreateMovement();
  const post = usePostMovement();
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  return (
    <MenuGate menu="inventory.transactions">
      <MovementForm
        title={savedTitle ?? "New Transaction"}
        submitLabel="Save Transaction"
        onSubmit={async (input) => {
          const res = await create.mutateAsync(input);
          const id = (res as { id?: string }).id;
          if (id) setSavedId(id);
        }}
        onSaved={(typeName) => setSavedTitle(typeName)}
        onPost={async () => {
          if (!savedId) return;
          await post.mutateAsync(savedId);
          alert("Transaction posted.");
        }}
      />
    </MenuGate>
  );
}
