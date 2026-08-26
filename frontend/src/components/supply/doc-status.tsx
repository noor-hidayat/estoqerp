"use client";

import { Badge } from "@/components/ui/badge";
import type { DocStatus } from "@/types";

const TONE: Record<DocStatus, string> = {
  DRAFT: "neutral",
  POSTED: "success",
  CANCELED: "destructive",
};

const LABEL: Record<DocStatus, string> = {
  DRAFT: "Draft",
  POSTED: "Posted",
  CANCELED: "Canceled",
};

export function DocStatusBadge({ status }: { status: DocStatus }) {
  return (
    <Badge tone={TONE[status] ?? "neutral"} dot={status === "DRAFT"}>
      {LABEL[status] ?? status}
    </Badge>
  );
}
