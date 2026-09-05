import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function SupplierReturnPage() {
  return (
    <PlaceholderPage
      menu="supply.goodsReceipts"
      eyebrow="Inbound"
      title="Supplier Return"
      description="Retur barang ke supplier (barang reject / selisih QC)."
      relatedHref="/app/transaction"
      relatedLabel="Buka Transaction"
    />
  );
}
