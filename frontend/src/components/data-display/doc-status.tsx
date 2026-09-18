import { Badge } from "@/components/ui/badge";
import type { DocStatus, ReceivingStatus } from "@/types";

const TONE: Record<string, string> = {
  DRAFT: "neutral",
  POSTED: "success",
  SUBMITTED: "success",
  ACTIVE: "success",
  APPROVED: "success",
  COMPLETED: "success",
  PENDING_QC: "warning",
  PENDING_APPROVAL: "warning",
  REJECTED: "destructive",
  CANCELED: "destructive",
  SENT: "info",
  QUOTED: "warning",
  QUOTATION_RECEIVED: "warning",
  EVALUATION: "violet",
  AWARDED: "violet",
  PO_CREATED: "success",
  CLOSED: "secondary",
};

const LABEL: Record<string, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  SUBMITTED: "Submitted",
  ACTIVE: "Active",
  APPROVED: "Approved",
  COMPLETED: "Completed",
  PENDING_QC: "Pending QC",
  PENDING_APPROVAL: "Pending Approval",
  REJECTED: "Rejected",
  CANCELED: "Canceled",
  SENT: "Sent",
  QUOTED: "Quotation Received",
  QUOTATION_RECEIVED: "Quotation Received",
  EVALUATION: "Evaluation",
  AWARDED: "Awarded",
  PO_CREATED: "PO Created",
  CLOSED: "Closed",
};

export function DocStatusBadge({ status }: { status: DocStatus | ReceivingStatus | string }) {
  return (
    <Badge tone={TONE[status] ?? "neutral"} dot={status === "DRAFT" || status === "PENDING_QC"}>
      {LABEL[status] ?? status}
    </Badge>
  );
}