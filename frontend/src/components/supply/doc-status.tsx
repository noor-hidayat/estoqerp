import { Badge } from "@/components/ui/badge";
import type { DocStatus, ReceivingStatus } from "@/types";

const TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "success",
  COMPLETED: "success",
  PENDING_QC: "warning",
  CANCELED: "destructive",
};

const LABEL: Record<string, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  COMPLETED: "Completed",
  PENDING_QC: "Pending QC",
  CANCELED: "Canceled",
};

export function DocStatusBadge({ status }: { status: DocStatus | ReceivingStatus | string }) {
  return (
    <Badge tone={TONE[status] ?? "neutral"} dot={status === "DRAFT" || status === "PENDING_QC"}>
      {LABEL[status] ?? status}
    </Badge>
  );
}