import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function InboundQcPage() {
  return (
    <PlaceholderPage
      menu="supply.goodsReceipts"
      eyebrow="Inbound"
      title="QC Inspection"
      description="Pemeriksaan kualitas barang sebelum Goods Receipt diposting."
      relatedHref="/app/goods-receipts"
      relatedLabel="Buka Goods Receipts"
    />
  );
}
