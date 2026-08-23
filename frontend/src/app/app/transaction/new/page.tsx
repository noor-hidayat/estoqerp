"use client";

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCreateMovement,
  usePostMovement,
  useUpdateMovement,
} from "@/lib/api/query";
import { MenuGate } from "@/components/ui/role-guard";
import { MovementForm } from "@/components/transactions/movement-form";

export default function NewTransactionPage() {
  const navigate = useNavigate();
  const create = useCreateMovement();
  const update = useUpdateMovement();
  const post = usePostMovement();
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  return (
    <MenuGate menu="inventory.transactions">
      <MovementForm
        title={savedTitle ?? "New Transaction"}
        submitLabel="Save Transaction"
        onSubmit={async (input) => {
          if (savedId) {
            await update.mutateAsync({ id: savedId, body: input });
          } else {
            const res = await create.mutateAsync(input);
            const id = (res as { id?: string }).id;
            if (id) {
              setSavedId(id);
              navigate(`/app/transaction/${id}`);
            }
          }
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
