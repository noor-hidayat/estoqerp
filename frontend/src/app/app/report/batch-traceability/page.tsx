import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function BatchTraceabilityReportPage() {
  return (
    <PlaceholderPage
      menu="reports"
      eyebrow="Report"
      title="Batch Traceability"
      description="Lacak pergerakan batch/lot dari receiving hingga delivery."
      relatedHref="/app/inventory/batches"
      relatedLabel="Buka Batch"
    />
  );
}
