import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function OutboundPickingPage() {
  return (
    <PlaceholderPage
      menu="supply.deliveries"
      eyebrow="Outbound"
      title="Picking"
      description="Pengambilan barang dari lokasi berdasarkan Delivery Order."
      relatedHref="/app/sales-orders"
      relatedLabel="Buka Sales Orders"
    />
  );
}
