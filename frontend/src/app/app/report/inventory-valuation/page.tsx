import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function InventoryValuationReportPage() {
  return (
    <PlaceholderPage
      menu="reports"
      eyebrow="Report"
      title="Inventory Valuation"
      description="Nilai persediaan per item/gudang berdasarkan valuation rate."
      relatedHref="/app/inventory/balance"
      relatedLabel="Buka Stock Balance"
    />
  );
}
