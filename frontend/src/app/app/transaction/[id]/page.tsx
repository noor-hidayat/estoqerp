import { useNavigate, useParams } from "react-router-dom";
import {
  useStockMovement,
  useUpdateMovement,
  usePostMovement,
  useUnpostMovement,
  useAmendMovement,
  useDeleteMovement,
} from "@/lib/api/query";
import { MenuGate } from "@/components/ui/role-guard";
import { MovementForm } from "@/components/transactions/movement-form";
import { DocStatusBadge } from "@/components/supply/doc-status";

const MENU = "inventory.transactions";

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: movement, isLoading, isError } = useStockMovement(id) as any;
  const update = useUpdateMovement();
  const post = usePostMovement();
  const unpost = useUnpostMovement();
  const amend = useAmendMovement();
  const remove = useDeleteMovement();

  if (isLoading) {
    return (
      <MenuGate menu={MENU}>
        <p className="py-20 text-center text-muted-foreground">Loading… {id}</p>
      </MenuGate>
    );
  }
  if (isError || !movement) {
    return (
      <MenuGate menu={MENU}>
        <p className="py-20 text-center text-foreground">Transaksi tidak ditemukan. (id={id})</p>
      </MenuGate>
    );
  }

  const docNo = (movement as any).documentNo ?? movement.id;
  const mutationId = (movement as any).publicId ?? String(movement.id);
  const isDraft = movement.status === "DRAFT";
  const isPosted = movement.status === "POSTED";
  const isCanceled = movement.status === "CANCELED";

  // Samakan dengan New: satu-satunya yang berubah hanya judul (documentNo).
  // customerId tidak dikembalikan GET detail, turunkan dari reference untuk RETURN_CUSTOMER.
  const initial = {
    ...movement,
    customerId:
      (movement as any).customerId ??
      (movement.referenceType === "RETURN_CUSTOMER" ? (movement.referenceId ?? "") : ""),
  };

  return (
    <MenuGate menu={MENU}>
      <MovementForm
        key={movement.id}
        title={docNo}
        initial={initial}
        submitLabel="Save"
        readOnly={!isDraft}
        statusBadge={<DocStatusBadge status={movement.status} />}
        onSubmit={(input) => update.mutateAsync({ id: mutationId, body: input }).then(() => {})}
        onPost={isDraft ? () => post.mutateAsync(mutationId).then(() => {}) : undefined}
        onCancel={isPosted ? () => unpost.mutateAsync(mutationId).then(() => {}) : undefined}
        onAmend={isCanceled ? () => amend.mutateAsync(mutationId).then(() => {}) : undefined}
        onDelete={
          isDraft
            ? () => remove.mutateAsync(mutationId).then(() => { navigate("/app/transaction"); })
            : undefined
        }
      />
    </MenuGate>
  );
}
