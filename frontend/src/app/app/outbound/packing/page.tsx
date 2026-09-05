import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function OutboundPackingPage() {
  return (
    <PlaceholderPage
      menu="supply.deliveries"
      eyebrow="Outbound"
      title="Packing"
      description="Pengemasan barang hasil picking sebelum dispatch."
      relatedHref="/app/deliveries"
      relatedLabel="Buka Deliveries"
    />
  );
}
