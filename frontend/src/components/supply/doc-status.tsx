import { Badge } from "@/components/ui/badge";
import type { DocStatus, ReceivingStatus } from "@/types";

const TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "success",
  ACTIVE: "success",
  APPROVED: "success",
  COMPLETED: "success",
  PENDING_QC: "warning",
  PENDING_APPROVAL: "warning",
  REJECTED: "destructive",
  CANCELED: "destructive",
};

const LABEL: Record<string, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  ACTIVE: "Active",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  PENDING_QC: "Pending QC",
  PENDING_APPROVAL: "Pending Approval",
  REJECTED: "Rejected",
  CANCELED: "Canceled",
};

export function DocStatusBadge({ status }: { status: DocStatus | ReceivingStatus | string }) {
  return (
    <Badge tone={TONE[status] ?? "neutral"} dot={status === "DRAFT" || status === "PENDING_QC"}>
      {LABEL[status] ?? status}
    </Badge>
  );
}