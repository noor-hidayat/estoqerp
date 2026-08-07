"use client";

import { PageHeader } from "@/components/ui/page-header";
import { RoleGuard } from "@/components/ui/role-guard";
import { FormatEditor } from "@/components/barcode/format-editor";
import type { BarcodeFormat } from "@/types";

export default function NewBarcodeFormatPage() {
  const emptyFormat: BarcodeFormat = {
    id: "",
    name: "",
    isActive: true,
    qtyPerFormat: true,
    segments: [],
    updatedAt: "",
  };

  return (
    <RoleGuard roles={["ADMIN"]}>
      <PageHeader
        eyebrow="Setup"
        title="Format Barcode Baru"
        description="Definisikan segmen posisi digit pada barcode, lalu uji parsingnya secara langsung."
      />
      <FormatEditor format={emptyFormat} />
    </RoleGuard>
  );
}
