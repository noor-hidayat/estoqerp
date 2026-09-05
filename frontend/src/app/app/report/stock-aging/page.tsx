import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function StockAgingReportPage() {
  return (
    <PlaceholderPage
      menu="reports"
      eyebrow="Report"
      title="Stock Aging"
      description="Umur stok per item/batch untuk deteksi slow-moving dan dead stock."
      relatedHref="/app/inventory/balance"
      relatedLabel="Buka Stock Balance"
    />
  );
}
