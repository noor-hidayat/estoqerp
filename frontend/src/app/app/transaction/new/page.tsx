import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useCreateMovement,
  usePostMovement,
  useUpdateMovement,
} from "@/lib/api/query";
import { MenuGate } from "@/components/ui/role-guard";
import { MovementForm } from "@/modules/inventory/components/movement-form";

export default function NewTransactionPage() {
  const navigate = useNavigate();
  const create = useCreateMovement();
  const update = useUpdateMovement();
  const post = usePostMovement();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);

  return (
    <MenuGate menu="inventory.transactions">
      <MovementForm
        title={savedTitle ?? "New Transaction"}
        onSaved={(typeName) => setSavedTitle(typeName)}
        submitLabel="Save"
        onSubmit={async (input) => {
          if (savedId) {
            await update.mutateAsync({ id: savedId, body: input });
            navigate(`/app/transaction/${savedId}`, { replace: true });
          } else {
            const res = await create.mutateAsync(input);
            const docNo = (res as { documentNo?: string }).documentNo;
            const id = (res as { id?: string }).id;
            const navId = docNo ?? id;
            if (navId) {
              if (id) setSavedId(id);
              navigate(`/app/transaction/${navId}`, { replace: true });
            }
          }
        }}
        onPost={async () => {
          if (!savedId) return;
          await post.mutateAsync(savedId);
          navigate(`/app/transaction/${savedId}`, { replace: true });
        }}
      />
    </MenuGate>
  );
}