import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function CustomerReturnPage() {
  return (
    <PlaceholderPage
      menu="supply.deliveries"
      eyebrow="Outbound"
      title="Customer Return"
      description="Retur barang dari customer (barang reject / salah kirim)."
      relatedHref="/app/transaction"
      relatedLabel="Buka Transaction"
    />
  );
}
