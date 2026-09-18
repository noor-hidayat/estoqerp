import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function InboundPutawayPage() {
  return (
    <PlaceholderPage
      menu="supply.goodsReceipts"
      eyebrow="Inbound"
      title="Putaway"
      description="Penempatan barang hasil GRN ke lokasi gudang."
      relatedHref="/app/grn"
      relatedLabel="Buka GRN"
    />
  );
}
